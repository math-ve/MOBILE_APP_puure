// Cron quotidien (07h30 UTC, avant notify-renewal à 08h00) :
//  1. resynchronise depuis Appstle les abonnements de chaque client qui en a,
//     pour que les dates de prélèvement (rappel J-3) soient à jour même si le
//     client n'a pas ouvert l'app ;
//  2. détecte les prélèvements refusés (bandeau « paiement refusé ») et
//     prévient le client une seule fois par une notification.
//
// Protégée par x-cron-secret (déployée --no-verify-jwt), comme les autres crons.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCaller, json, preflight } from "../_shared/http.ts";
import { syncUserSubscriptions } from "../_shared/appstle.ts";
import { localized } from "../_shared/messages.ts";

const CONCURRENCY = 4;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!isTrustedCaller(req)) return json({ error: "Forbidden" }, 403);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Clients ayant au moins un abonnement actif ou en pause dans notre base.
  const { data: subs, error } = await supabase
    .from("subscriptions_cache")
    .select("user_id")
    .in("status", ["active", "paused"]);
  if (error) return json({ error: error.message }, 500);
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id).filter(Boolean))];

  let synced = 0, failed = 0, notified = 0;
  const queue = [...userIds];

  const worker = async () => {
    while (queue.length > 0) {
      const userId = queue.shift()!;
      try {
        const result = await syncUserSubscriptions(supabase, userId);
        synced += result.synced;
        for (const f of result.newPaymentFailures) {
          if (await notifyPaymentFailure(supabase, userId, f.contractId, f.productName)) notified++;
        }
      } catch (e) {
        failed++;
        console.warn(`Synchro échouée pour ${userId}:`, e);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Clients: ${userIds.length} | contrats: ${synced} | échecs: ${failed} | notifs paiement: ${notified}`);
  return json({ success: true, customers: userIds.length, contracts: synced, errors: failed, paymentNotifications: notified });
});

async function notifyPaymentFailure(supabase: any, userId: string, contractId: string, productName: string | null) {
  const { data: profile } = await supabase.from("profiles").select("push_token, language").eq("id", userId).single();
  if (!profile?.push_token) return false;
  const msg = localized(profile.language, "paymentFailed", { product: productName ?? "" });
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      user_id: userId,
      title: msg.title,
      body: msg.body,
      data: { type: "payment_failed", screen: `/subscription-detail?contractId=${contractId}`, contract_id: contractId },
    }),
  });
  return res.ok;
}
