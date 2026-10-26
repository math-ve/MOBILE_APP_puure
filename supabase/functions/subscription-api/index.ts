// Point d'entrée unique et sécurisé des actions d'abonnement de l'app.
//
// Sécurité : l'utilisateur est identifié par SON jeton de session (jamais par
// un user_id envoyé dans le corps), et chaque action vérifie que le contrat
// lui appartient. Les actions sur une livraison (sauter, décaler, recevoir
// maintenant) vérifient en plus que la livraison appartient à ce contrat.
//
// Remplace pour l'app : get-subscription-detail, subscription-action,
// manage-subscription et sync-subscriptions (qui ne vérifient pas le
// propriétaire et seront retirées une fois l'app mise à jour).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/http.ts";
import {
  appstle, fetchBillingAttempts, getShopifyCustomerId, paymentFailureFrom,
  syncUserSubscriptions, userOwnsContract,
} from "../_shared/appstle.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Un e-mail de changement de carte au plus toutes les 24 h (recommandation Appstle).
const PAYMENT_LINK_COOLDOWN_MS = 24 * 3600 * 1000;

// Motifs d'annulation acceptés (clés stables, libellé lisible envoyé à Appstle).
const CANCEL_REASONS: Record<string, string> = {
  incompatible: "Le filtre ne va pas sur mon robinet",
  stock: "J'ai encore des cartouches",
  price: "C'est trop cher",
  moving: "Je déménage",
  unwanted: "Je n'ai pas voulu d'abonnement",
  other: "Autre raison",
};

type Body = Record<string, any>;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  // ── Qui appelle ? ─────────────────────────────────────────────
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "Session invalide" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Corps JSON invalide" }, 400); }
  const action = String(body.action ?? "");

  try {
    // Synchro de tous les abonnements du client : pas de contrat ciblé.
    if (action === "sync") {
      const result = await syncUserSubscriptions(supabase, user.id);
      return json({ success: true, synced: result.synced });
    }

    const contractId = String(body.contractId ?? "");
    if (!/^\d+$/.test(contractId)) return json({ error: "contractId invalide" }, 400);
    if (!(await userOwnsContract(supabase, user.id, contractId))) {
      console.warn(`Accès refusé : user ${user.id} → contrat ${contractId}`);
      return json({ error: "Abonnement introuvable" }, 404);
    }

    switch (action) {
      case "detail": return json(await detail(user.id, contractId));
      case "skip": return await onUpcomingOrder(contractId, body.attemptId, (id) =>
        appstle(`/subscription-billing-attempts/skip-order/${id}`, { method: "PUT" }), user.id);
      case "order-now": return await onUpcomingOrder(contractId, body.attemptId, (id) =>
        appstle(`/subscription-billing-attempts/attempt-billing/${id}`, { method: "PUT" }), user.id);
      case "reschedule": {
        const date = String(body.newBillingDate ?? "");
        if (!isFutureDate(date)) return json({ error: "Date invalide" }, 400);
        const all = body.rescheduleAllUpcoming === true;
        return await onUpcomingOrder(contractId, body.attemptId, (id) =>
          appstle(`/subscription-billing-attempts/reschedule-order/${id}?contractId=${contractId}&newBillingDate=${date}&rescheduleAllUpcoming=${all}`, { method: "PUT" }), user.id);
      }
      case "update-frequency": {
        const count = Number(body.billingIntervalCount);
        if (!Number.isInteger(count) || count < 1 || count > 12) return json({ error: "Fréquence invalide" }, 400);
        return await done(user.id, await appstle(
          `/subscription-contracts-update-billing-interval?contractId=${contractId}&billingIntervalCount=${count}&deliveryIntervalCount=${count}`,
          { method: "PUT" }));
      }
      case "update-address": {
        if (!body.address || typeof body.address !== "object") return json({ error: "Adresse manquante" }, 400);
        return await done(user.id, await appstle(
          `/subscription-contracts-update-shipping-address?contractId=${contractId}`,
          { method: "PUT", body: JSON.stringify(body.address) }));
      }
      case "apply-discount": {
        const code = String(body.discountCode ?? "").trim();
        if (!code || code.length > 64) return json({ error: "Code invalide" }, 400);
        return await done(user.id, await appstle(
          `/subscription-contracts-apply-discount?contractId=${contractId}&discountCode=${encodeURIComponent(code)}`,
          { method: "PUT" }));
      }
      case "pause":
      case "resume": {
        const status = action === "pause" ? "PAUSED" : "ACTIVE";
        return await done(user.id, await appstle(
          `/subscription-contracts-update-status?contractId=${contractId}&status=${status}`, { method: "PUT" }));
      }
      case "cancel": return await cancel(user.id, contractId, body);
      case "payment-link": return await paymentLink(contractId);
      default: return json({ error: `Action inconnue : ${action}` }, 400);
    }
  } catch (err) {
    console.error(`subscription-api ${action} error:`, err);
    return json({ error: "Erreur serveur" }, 500);
  }
});

// ── Actions ─────────────────────────────────────────────────────

async function detail(userId: string, contractId: string) {
  const customerId = await getShopifyCustomerId(supabase, userId);
  const [{ upcoming, past }, contract, pm, cache] = await Promise.all([
    fetchBillingAttempts(contractId),
    appstle(`/subscription-contracts/contract-external/${contractId}`),
    customerId
      ? appstle(`/subscription-contract-details/shopify/customer/${customerId}/payment-methods`)
      : Promise.resolve(null),
    supabase.from("subscriptions_cache").select("*").eq("appstle_subscription_id", contractId).maybeSingle(),
  ]);

  const rawAddr = contract.data?.deliveryMethod?.address ?? null;
  const shippingAddress = rawAddr ? (({ __typename, countryCodeV2, ...rest }: any) => rest)(rawAddr) : null;

  // Carte principale (non révocable), sinon la première carte encore valide.
  const nodes: any[] = (pm as any)?.data?.nodes ?? [];
  const node = nodes.find((n) => n.revokedAt === null && n.instrument?.revocable === false)
    ?? nodes.find((n) => n.revokedAt === null) ?? null;
  const i = node?.instrument ?? null;
  const paymentMethod = i ? {
    brand: i.brand ?? null,
    lastDigits: i.lastDigits ?? null,
    maskedNumber: i.maskedNumber ?? null,
    expiryMonth: i.expiryMonth ?? null,
    expiryYear: i.expiryYear ?? null,
    cardHolderName: i.name ?? null,
  } : null;

  if (rawAddr?.countryCode) {
    await supabase.from("profiles").update({ country: rawAddr.countryCode }).eq("id", userId);
  }

  // Le statut affiché suit Appstle (contrat), pas le cache qui peut avoir du retard.
  const status = contract.data?.status ? String(contract.data.status).toLowerCase() : cache.data?.status ?? null;
  const paymentFailedAt = status === "active" || status === "paused" ? paymentFailureFrom(past) : null;
  if (cache.data && (cache.data.status !== status || (cache.data.payment_failed_at ?? null) !== paymentFailedAt)) {
    await supabase.from("subscriptions_cache")
      .update({ status, payment_failed_at: paymentFailedAt })
      .eq("appstle_subscription_id", contractId);
  }

  return {
    subscription: cache.data ? { ...cache.data, status, payment_failed_at: paymentFailedAt } : null,
    upcomingOrders: upcoming,
    pastOrders: past,
    shippingAddress,
    paymentMethod,
    paymentFailedAt,
  };
}

/** Action sur une livraison à venir : vérifie qu'elle appartient au contrat. */
async function onUpcomingOrder(
  contractId: string,
  attemptId: unknown,
  call: (id: string) => Promise<{ ok: boolean; status: number; raw: string }>,
  userId: string,
) {
  const id = String(attemptId ?? "");
  if (!/^\d+$/.test(id)) return json({ error: "Livraison invalide" }, 400);
  const { upcoming } = await fetchBillingAttempts(contractId);
  if (!upcoming.some((o) => String(o.id) === id)) return json({ error: "Livraison introuvable" }, 404);
  return await done(userId, await call(id));
}

async function cancel(userId: string, contractId: string, body: Body) {
  const reasonKey = String(body.reason ?? "");
  if (!CANCEL_REASONS[reasonKey]) return json({ error: "Motif manquant" }, 400);
  const comment = typeof body.comment === "string" ? body.comment.trim().substring(0, 900) : "";

  const params = new URLSearchParams({ cancellationFeedback: CANCEL_REASONS[reasonKey] });
  params.set("cancellationNote", ["Annulé depuis l'app Puure", comment].filter(Boolean).join(" — "));
  const res = await appstle(`/subscription-contracts/${contractId}?${params}`, { method: "DELETE" });
  if (!res.ok) return appstleError(res);

  await supabase.from("subscriptions_cache")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reasonKey })
    .eq("appstle_subscription_id", contractId);
  await resync(userId);
  return json({ success: true, status: "cancelled" });
}

async function paymentLink(contractId: string) {
  const { data: row } = await supabase
    .from("subscriptions_cache").select("payment_link_sent_at").eq("appstle_subscription_id", contractId).maybeSingle();
  const last = row?.payment_link_sent_at ? new Date(row.payment_link_sent_at).getTime() : 0;
  if (Date.now() - last < PAYMENT_LINK_COOLDOWN_MS) {
    // Déjà envoyé récemment : on ne renvoie pas, mais ce n'est pas une erreur pour le client.
    return json({ success: true, alreadySent: true, sentAt: row!.payment_link_sent_at });
  }
  const res = await appstle(`/subscription-contracts-update-payment-method?contractId=${contractId}`, { method: "PUT" });
  if (!res.ok) return appstleError(res);
  const sentAt = new Date().toISOString();
  await supabase.from("subscriptions_cache").update({ payment_link_sent_at: sentAt }).eq("appstle_subscription_id", contractId);
  return json({ success: true, alreadySent: false, sentAt });
}

// ── Utilitaires ─────────────────────────────────────────────────

/** Réponse commune aux actions de modification : erreur Appstle ou resynchro. */
async function done(userId: string, res: { ok: boolean; status: number; raw: string }) {
  if (!res.ok) return appstleError(res);
  await resync(userId);
  return json({ success: true });
}

async function resync(userId: string) {
  try { await syncUserSubscriptions(supabase, userId); } catch (e) { console.warn("Resync échouée :", e); }
}

/** Erreur Appstle → message lisible (Appstle préfixe ses messages par « UserGeneratedError: »). */
function appstleError(res: { status: number; raw: string }) {
  console.warn("Appstle error", res.status, res.raw);
  let message: string | null = null;
  try { message = JSON.parse(res.raw)?.message ?? JSON.parse(res.raw)?.title ?? null; } catch { /* brut */ }
  message = message?.replace(/^.*UserGeneratedError:\s*/, "").trim() || null;
  return json({ error: message ?? "L'action n'a pas pu être effectuée", appstleStatus: res.status }, 502);
}

function isFutureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.getTime() > Date.now() && d.getTime() < Date.now() + 400 * 86400000;
}
