import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Réservé aux appels internes (crons, autres edge functions, dashboard admin).
    // Accepté si :
    //   - Authorization = Bearer <service role>  (appels internes existants)
    //   - x-cron-secret = CRON_SECRET            (dashboard / moteur — robuste aux
    //                                             rotations de clé service role)
    // L'anon key reste refusée.
    const auth = req.headers.get("authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!isService && !isCron) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, title, body, data = {} } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title et body requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("id", user_id)
      .single();

    if (error || !profile?.push_token) {
      try {
        await supabase.from("analytics_events").insert({
          source: "server", name: "push_skipped_no_token", user_id,
          properties: { type: data.type ?? "info", campaign_id: data.campaign_id ?? null },
        });
      } catch (_) { /* analytics best-effort */ }
      return new Response(
        JSON.stringify({ error: "No push token found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Id du log connu AVANT l'envoi : l'app le renvoie au tap (notification_id)
    // pour mesurer le taux d'ouverture.
    const logId = crypto.randomUUID();
    const payloadData = { ...data, notification_id: logId };

    const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN")!;
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${expoToken}`,
      },
      body: JSON.stringify({
        to: profile.push_token,
        title,
        body,
        data: payloadData,
        sound: "default",
        priority: "high",
      }),
    });

    const result = await res.json();
    console.log("Expo push result:", JSON.stringify(result));

    // Erreur immédiate d'Expo (ex: DeviceNotRegistered) → statut connu tout de
    // suite ; sinon le statut final vient des receipts (check-push-receipts).
    const ticket = result.data ?? {};
    const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

    await supabase.from("notification_logs").insert({
      id: logId,
      user_id,
      type: data.type ?? "info",
      title,
      body,
      data: payloadData,
      expo_receipt_id: ticket.id ?? null,
      campaign_id: isUuid(data.campaign_id) ? data.campaign_id : null,
      template_id: isUuid(data.template_id) ? data.template_id : null,
      delivery_status: ticket.status === "error" ? "error" : null,
      delivery_error: ticket.status === "error" ? (ticket.details?.error ?? ticket.message ?? "unknown") : null,
    });

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-notification error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
