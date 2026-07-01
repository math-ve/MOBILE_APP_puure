import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 300; // limite de l'API getReceipts d'Expo

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

    // Receipts des notifications des dernières 48h
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: logs, error } = await supabase
      .from("notification_logs")
      .select("id, user_id, expo_receipt_id")
      .not("expo_receipt_id", "is", null)
      .gte("sent_at", since);

    if (error) throw error;
    if (!logs || logs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, checked: 0, deadTokens: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receiptToUser = new Map(logs.map((l) => [l.expo_receipt_id as string, l.user_id as string]));
    const ids = [...receiptToUser.keys()];
    const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN")!;
    const deadUserIds = new Set<string>();

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${expoToken}`,
        },
        body: JSON.stringify({ ids: chunk }),
      });
      const json = await res.json();
      const receipts = json.data ?? {};

      for (const [receiptId, receipt] of Object.entries<any>(receipts)) {
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          const userId = receiptToUser.get(receiptId);
          if (userId) deadUserIds.add(userId);
        }
      }
    }

    // Purge les tokens morts — ils seront ré-enregistrés au prochain login
    if (deadUserIds.size > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ push_token: null })
        .in("id", [...deadUserIds]);
      if (updateError) throw updateError;
      console.log(`Purged ${deadUserIds.size} dead push tokens`);
    }

    return new Response(
      JSON.stringify({ success: true, checked: ids.length, deadTokens: deadUserIds.size }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-push-receipts error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
