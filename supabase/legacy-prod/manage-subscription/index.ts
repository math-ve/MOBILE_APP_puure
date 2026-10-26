import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { identify, ownsContract } from "../../functions/_shared/legacyGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APPSTLE_BASE = "https://subscription-admin.appstle.com/api/external/v2";

type Action = "pause" | "resume" | "cancel" | "update_frequency";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Sécurité : client identifié par sa session (le user_id du corps est ignoré)
    // et le contrat doit lui appartenir.
    const caller = await identify(req);
    if (caller instanceof Response) return caller;
    const body = await req.json();
    const { subscription_contract_id, action, frequency_interval_count } = body;
    const user_id = caller.service ? body.user_id : caller.userId;
    const denied = await ownsContract(caller, subscription_contract_id);
    if (denied) return denied;

    if (!user_id || !subscription_contract_id || !action) {
      return new Response(JSON.stringify({ error: "user_id, subscription_contract_id et action requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const apiKey = Deno.env.get("APPSTLE_API_KEY")!;

    const appstleHeaders = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    };

    const contractId = String(subscription_contract_id);
    console.log("Action:", action, "| Contract:", contractId);

    // ── Appel Appstle selon l'action ────────────────────────────────────────
    let appstleRes: Response;

    const statusMap: Record<string, string> = {
      pause: "PAUSED",
      resume: "ACTIVE",
      cancel: "CANCELLED",
    };

    if (action === "pause" || action === "resume" || action === "cancel") {
      const status = statusMap[action];
      const url = `${APPSTLE_BASE}/subscription-contracts-update-status?contractId=${contractId}&status=${status}`;
      console.log("Calling:", url);
      appstleRes = await fetch(url, {
        method: "PUT",
        headers: appstleHeaders,
      });
    } else if (action === "update_frequency") {
      if (!frequency_interval_count) {
        return new Response(JSON.stringify({ error: "frequency_interval_count requis pour update_frequency" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const url = `${APPSTLE_BASE}/subscription-contracts-update-status?contractId=${contractId}`;
      console.log("Calling frequency update:", url);
      appstleRes = await fetch(`${APPSTLE_BASE}/subscription-contracts/${contractId}/update`, {
        method: "POST",
        headers: appstleHeaders,
        body: JSON.stringify({
          billingPolicyIntervalCount: frequency_interval_count,
          deliveryPolicyIntervalCount: frequency_interval_count,
        }),
      });
    } else {
      return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Appstle response status:", appstleRes.status);

    if (!appstleRes.ok) {
      // Tente de lire le body sauf pour 204
      const errText = appstleRes.status !== 204 ? await appstleRes.text() : "";
      console.log("Appstle error raw:", errText.substring(0, 500));
      return new Response(JSON.stringify({ error: "Appstle action failed", status: appstleRes.status, raw: errText.substring(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Re-sync depuis Appstle pour mettre à jour subscriptions_cache ───────
    const { data: profile } = await supabase
      .from("profiles")
      .select("shopify_customer_id")
      .eq("id", user_id)
      .single();

    if (profile?.shopify_customer_id) {
      const rawGid = profile.shopify_customer_id;
      const numericId = rawGid.includes("/") ? rawGid.split("/").pop()! : rawGid;

      const syncRes = await fetch(
        `${APPSTLE_BASE}/subscription-customers-detail/valid/${numericId}`,
        { headers: appstleHeaders }
      );
      const syncText = await syncRes.text();

      if (syncRes.ok && !syncText.trimStart().startsWith("<")) {
        const subscriptions: any[] = JSON.parse(syncText);

        const rows = subscriptions.map((sub: any) => {
          let contractDetails: any[] = [];
          try {
            contractDetails = typeof sub.contractDetailsJSON === "string"
              ? JSON.parse(sub.contractDetailsJSON)
              : (sub.contractDetailsJSON ?? []);
          } catch (_) { /* ignore parse error */ }

          const firstLine = contractDetails[0] ?? {};
          return {
            user_id,
            appstle_subscription_id: String(sub.subscriptionContractId),
            status: (sub.status ?? "unknown").toLowerCase(),
            product_name: firstLine.title ?? null,
            shopify_product_id: firstLine.productId ? String(firstLine.productId) : null,
            frequency_unit: sub.billingPolicyInterval ? sub.billingPolicyInterval.toLowerCase() : null,
            frequency_value: sub.billingPolicyIntervalCount ?? null,
            next_billing_date: sub.nextBillingDate ?? null,
            next_delivery_date: null,
            shipping_address: null,
            price_amount: firstLine.currentPrice ? parseFloat(firstLine.currentPrice) : null,
            price_currency: sub.currencyCode ?? "EUR",
            last_synced_at: new Date().toISOString(),
          };
        });

        await supabase
          .from("subscriptions_cache")
          .upsert(rows, { onConflict: "appstle_subscription_id" });

        // Retourne le nouveau statut de ce contrat spécifique
        const updated = rows.find(r => r.appstle_subscription_id === contractId);
        return new Response(JSON.stringify({ success: true, new_status: updated?.status ?? null }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, new_status: null }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("manage-subscription error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
