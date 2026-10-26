// Cron 08h00 UTC : rappel 3 jours avant chaque prélèvement d'abonnement.
// Les dates viennent de subscriptions_cache, rafraîchi juste avant par
// sync-subscriptions-daily (07h30). Le tap ouvre l'abonnement sur « Décaler ».

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCaller, json, preflight } from "../_shared/http.ts";
import { formatDateFor, formatPriceFor, localized } from "../_shared/messages.ts";

const DAYS_BEFORE = 3;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!isTrustedCaller(req)) return json({ error: "Forbidden" }, 403);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const target = new Date();
    target.setUTCDate(target.getUTCDate() + DAYS_BEFORE);
    const day = target.toISOString().split("T")[0];

    const { data: subscriptions, error } = await supabase
      .from("subscriptions_cache")
      .select("user_id, appstle_subscription_id, product_name, next_billing_date, price_amount, price_currency")
      .eq("status", "active")
      .gte("next_billing_date", `${day}T00:00:00`)
      .lte("next_billing_date", `${day}T23:59:59`);
    if (error) throw error;

    console.log(`${subscriptions?.length ?? 0} prélèvement(s) le ${day}`);
    let sent = 0, skipped = 0;

    for (const sub of subscriptions ?? []) {
      const { data: profile } = await supabase
        .from("profiles").select("push_token, language").eq("id", sub.user_id).single();
      if (!profile?.push_token) { skipped++; continue; }

      // Un seul rappel par contrat et par échéance.
      const { data: already } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("type", "subscription_renewal_soon")
        .eq("data->>contract_id", sub.appstle_subscription_id)
        .eq("data->>billing_date", day)
        .limit(1);
      if (already && already.length > 0) { skipped++; continue; }

      const msg = localized(profile.language, "renewalSoon", {
        product: sub.product_name ?? "",
        date: formatDateFor(profile.language, sub.next_billing_date),
        price: formatPriceFor(profile.language, Number(sub.price_amount ?? 0), sub.price_currency ?? "EUR"),
      });

      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id: sub.user_id,
          title: msg.title,
          body: msg.body,
          data: {
            type: "subscription_renewal_soon",
            screen: `/subscription-detail?contractId=${sub.appstle_subscription_id}&open=reschedule`,
            contract_id: sub.appstle_subscription_id,
            billing_date: day,
          },
        }),
      });
      if (res.ok) sent++; else skipped++;
    }

    return json({ success: true, sent, skipped });
  } catch (err) {
    console.error("notify-renewal error:", err);
    return json({ error: String(err) }, 500);
  }
});
