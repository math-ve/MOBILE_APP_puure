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
      return new Response(
        JSON.stringify({ error: "No push token found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        data,
        sound: "default",
        priority: "high",
      }),
    });

    const result = await res.json();
    console.log("Expo push result:", JSON.stringify(result));

    await supabase.from("notification_logs").insert({
      user_id,
      type: data.type ?? "info",
      title,
      body,
      data,
      expo_receipt_id: result.data?.id ?? null,
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
