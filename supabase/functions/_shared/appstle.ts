// Accès à l'API Appstle + synchronisation de subscriptions_cache.
// Partagé par subscription-api (à la demande du client) et
// sync-subscriptions-daily (cron), pour que les deux écrivent la même chose.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const APPSTLE_BASE = "https://subscription-admin.appstle.com/api/external/v2";

export type AppstleResult<T = any> = { ok: boolean; status: number; data: T | null; raw: string };

export async function appstle<T = any>(path: string, init: RequestInit = {}): Promise<AppstleResult<T>> {
  const res = await fetch(`${APPSTLE_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": Deno.env.get("APPSTLE_API_KEY")!,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; PuureFilters/1.0)",
      ...(init.headers ?? {}),
    },
  });
  const raw = res.status === 204 ? "" : await res.text();
  let data: T | null = null;
  // Appstle renvoie parfois une page HTML d'erreur avec un statut 200.
  if (raw && !raw.trimStart().startsWith("<")) {
    try { data = JSON.parse(raw) as T; } catch { /* corps non JSON */ }
  }
  return { ok: res.ok && !raw.trimStart().startsWith("<"), status: res.status, data, raw: raw.substring(0, 500) };
}

/** Liste paginée Appstle ({ content: [...] }) ou tableau brut → tableau. */
export function asList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.content) ? data.content : [];
}

/** gid://shopify/Customer/123 → "123" */
export function numericId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  return gid.includes("/") ? gid.split("/").pop()! : gid;
}

export async function getShopifyCustomerId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("shopify_customer_id").eq("id", userId).single();
  return numericId(data?.shopify_customer_id ?? null);
}

export async function fetchCustomerContracts(customerId: string): Promise<any[] | null> {
  const r = await appstle(`/subscription-customers-detail/valid/${customerId}`);
  return r.ok ? asList(r.data) : null;
}

export async function fetchBillingAttempts(contractId: string): Promise<{ upcoming: any[]; past: any[] }> {
  const [up, past] = await Promise.all([
    appstle(`/subscription-billing-attempts/top-orders?contractId=${contractId}`),
    appstle(`/subscription-billing-attempts/past-orders?contractId=${contractId}`),
  ]);
  return { upcoming: up.ok ? asList(up.data) : [], past: past.ok ? asList(past.data) : [] };
}

/**
 * Date du dernier prélèvement refusé, si c'est le dernier prélèvement tenté.
 * Un prélèvement réussi après l'échec efface le problème. Les échecs de plus
 * de 45 jours sont ignorés (contrat probablement régularisé ou abandonné).
 */
export function paymentFailureFrom(past: any[]): string | null {
  const attempts = past
    .filter((a) => ["SUCCESS", "FAILURE"].includes(String(a?.status ?? "").toUpperCase()))
    .sort((a, b) => new Date(b.billingDate ?? b.attemptTime ?? 0).getTime() - new Date(a.billingDate ?? a.attemptTime ?? 0).getTime());
  const last = attempts[0];
  if (!last || String(last.status).toUpperCase() !== "FAILURE") return null;
  const at = new Date(last.attemptTime ?? last.billingDate ?? Date.now());
  if (Date.now() - at.getTime() > 45 * 86400000) return null;
  return at.toISOString();
}

function parseLines(sub: any): any[] {
  try {
    return typeof sub.contractDetailsJSON === "string"
      ? JSON.parse(sub.contractDetailsJSON)
      : (sub.contractDetailsJSON ?? []);
  } catch {
    return [];
  }
}

export type SyncResult = {
  synced: number;
  /** Contrats dont le paiement vient de passer en échec (pour notifier une seule fois). */
  newPaymentFailures: { contractId: string; productName: string | null }[];
  contractIds: string[];
};

/**
 * Recopie les contrats Appstle du client dans subscriptions_cache.
 * Conserve ce que seule notre base connaît (date d'annulation, motif, envoi
 * du lien de paiement) quand Appstle ne le fournit pas.
 */
export async function syncUserSubscriptions(supabase: SupabaseClient, userId: string): Promise<SyncResult> {
  const empty: SyncResult = { synced: 0, newPaymentFailures: [], contractIds: [] };
  const customerId = await getShopifyCustomerId(supabase, userId);
  if (!customerId) return empty;

  const contracts = await fetchCustomerContracts(customerId);
  if (!contracts || contracts.length === 0) return empty;

  const ids = contracts.map((c) => String(c.subscriptionContractId));
  const { data: existing } = await supabase
    .from("subscriptions_cache")
    .select("appstle_subscription_id, status, cancelled_at, payment_failed_at")
    .in("appstle_subscription_id", ids);
  const before = new Map((existing ?? []).map((r: any) => [r.appstle_subscription_id, r]));

  const now = new Date().toISOString();
  const newPaymentFailures: SyncResult["newPaymentFailures"] = [];

  const rows = await Promise.all(contracts.map(async (sub) => {
    const contractId = String(sub.subscriptionContractId);
    const status = String(sub.status ?? "unknown").toLowerCase();
    const lines = parseLines(sub);
    const first = lines[0] ?? {};
    const prev: any = before.get(contractId);

    // Paiement : seuls les contrats encore vivants peuvent être en échec.
    let paymentFailedAt: string | null = null;
    if (status === "active" || status === "paused") {
      const { past } = await fetchBillingAttempts(contractId);
      paymentFailedAt = paymentFailureFrom(past);
      if (paymentFailedAt && !prev?.payment_failed_at) {
        newPaymentFailures.push({ contractId, productName: first.title ?? null });
      }
    }

    let cancelledAt: string | null = null;
    if (status === "cancelled") {
      cancelledAt = sub.cancelledOn ?? prev?.cancelled_at ?? (prev && prev.status !== "cancelled" ? now : null);
    }

    return {
      user_id: userId,
      appstle_subscription_id: contractId,
      status,
      product_name: first.title ?? null,
      shopify_product_id: first.productId ? String(first.productId) : null,
      frequency_unit: sub.billingPolicyInterval ? String(sub.billingPolicyInterval).toLowerCase() : null,
      frequency_value: sub.billingPolicyIntervalCount ?? null,
      next_billing_date: sub.nextBillingDate ?? null,
      price_amount: first.currentPrice ? parseFloat(first.currentPrice) : null,
      price_currency: sub.currencyCode ?? "EUR",
      total_successful_orders: sub.totalSuccessfulOrders ?? 0,
      contract_details_json: lines.length > 0 ? lines : null,
      payment_failed_at: paymentFailedAt,
      cancelled_at: cancelledAt,
      last_synced_at: now,
    };
  }));

  const { error } = await supabase.from("subscriptions_cache").upsert(rows, { onConflict: "appstle_subscription_id" });
  if (error) throw new Error(`subscriptions_cache upsert: ${error.message}`);

  return { synced: rows.length, newPaymentFailures, contractIds: ids };
}

/**
 * Vérifie que le contrat appartient au client connecté. D'abord dans notre
 * cache, puis auprès d'Appstle (contrat tout juste créé, pas encore synchronisé).
 */
export async function userOwnsContract(supabase: SupabaseClient, userId: string, contractId: string): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions_cache")
    .select("id")
    .eq("user_id", userId)
    .eq("appstle_subscription_id", contractId)
    .maybeSingle();
  if (data) return true;

  const customerId = await getShopifyCustomerId(supabase, userId);
  if (!customerId) return false;
  const contracts = await fetchCustomerContracts(customerId);
  return !!contracts?.some((c) => String(c.subscriptionContractId) === contractId);
}
