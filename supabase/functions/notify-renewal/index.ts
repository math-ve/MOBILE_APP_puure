import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Déclenchée par cron (x-cron-secret) ou en interne (service role)
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  const isService = (req.headers.get("authorization") ?? "") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isCron && !isService) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    const { data: subscriptions, error } = await supabase
      .from("subscriptions_cache")
      .select("user_id, product_name, next_billing_date, price_amount, price_currency")
      .eq("status", "active")
      .gte("next_billing_date", `${targetDateStr}T00:00:00`)
      .lt("next_billing_date", `${targetDateStr}T23:59:59`);

    if (error) throw error;

    console.log(`Found ${subscriptions?.length ?? 0} subscriptions renewing in 2 days`);

    const results = [];
    const today = new Date().toISOString().split("T")[0];

    for (const sub of subscriptions ?? []) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", sub.user_id)
        .single();

      if (!profile?.push_token) {
        console.log(`No push token for user ${sub.user_id}`);
        continue;
      }

      // Dédoublonnage — ne pas renvoyer si déjà envoyé aujourd'hui
      const { data: existingLog } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("type", "subscription_renewal_soon")
        .gte("sent_at", `${today}T00:00:00`)
        .maybeSingle();

      if (existingLog) {
        console.log(`Already sent renewal notification to user ${sub.user_id} today`);
        continue;
      }

      const billingDate = new Date(sub.next_billing_date);
      const dateFr = billingDate.toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
      });
      const price = new Intl.NumberFormat("fr-FR", {
        style: "currency", currency: sub.price_currency ?? "EUR",
      }).format(sub.price_amount ?? 0);

      const notifRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: sub.user_id,
            title: "🔄 Renouvellement dans 2 jours",
            body: `Votre abonnement ${sub.product_name} sera renouvelé le ${dateFr} pour ${price}`,
            data: {
              type: "subscription_renewal_soon",
              screen: "/(tabs)/subscription",
            },
          }),
        }
      );

      const notifResult = await notifRes.json();
      results.push({ user_id: sub.user_id, result: notifResult });
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("notify-renewal error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
