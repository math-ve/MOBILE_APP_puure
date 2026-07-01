import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calcule le % d'usure d'un timer (même formule que l'app)
function calcProgress(timer: {
  started_at: string;
  total_paused_seconds: number | null;
  expected_duration_days: number;
}): number {
  const elapsed =
    Date.now() -
    new Date(timer.started_at).getTime() -
    (timer.total_paused_seconds ?? 0) * 1000;
  return Math.min(
    Math.round((elapsed / (timer.expected_duration_days * 86400000)) * 100),
    100
  );
}

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

    const { data: timers, error } = await supabase
      .from("cartridge_timers")
      .select("id, user_id, started_at, total_paused_seconds, expected_duration_days, filters(product_name)")
      .eq("is_active", true);

    if (error) throw error;

    console.log(`Checking ${timers?.length ?? 0} active timers`);

    const results: unknown[] = [];

    for (const timer of timers ?? []) {
      const progress = calcProgress(timer);

      // Seuil le plus haut atteint — une seule notif par seuil et par timer
      const threshold = progress >= 95 ? 95 : progress >= 80 ? 80 : null;
      if (!threshold) continue;

      const type = `cartridge_${threshold}`;

      const { data: existingLog } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("user_id", timer.user_id)
        .eq("type", type)
        .eq("data->>timer_id", String(timer.id))
        .maybeSingle();

      if (existingLog) continue;

      const filterName = (timer as any).filters?.product_name;
      const name = filterName ? ` ${filterName}` : "";

      const payload =
        threshold === 95
          ? {
              title: "⚠️ Cartouche à remplacer",
              body: `Votre cartouche${name} a atteint ${progress}% de sa durée de vie. Remplacez-la pour garder une eau parfaitement pure.`,
            }
          : {
              title: "💧 Cartouche bientôt en fin de vie",
              body: `Votre cartouche${name} est à ${progress}% de sa durée de vie. Pensez à commander votre prochaine cartouche.`,
            };

      const notifRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: timer.user_id,
            title: payload.title,
            body: payload.body,
            data: {
              type,
              screen: "/(tabs)/filters",
              timer_id: String(timer.id),
            },
          }),
        }
      );

      const notifResult = await notifRes.json();
      results.push({ timer_id: timer.id, threshold, progress, result: notifResult });
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-cartridge error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
