import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// shopify-webhook — reçoit les webhooks Shopify (orders/paid, orders/fulfilled,
// orders/cancelled) et déclenche notification-runner (dashboard admin) pour la
// campagne "event" correspondante.
//
// Auth : signature HMAC-SHA256 Shopify (header X-Shopify-Hmac-Sha256), calculée
// sur le corps BRUT de la requête avec le secret de signature du webhook
// (Shopify Admin → Notifications → Webhooks, ou l'app custom qui les enregistre).
// Ce n'est PAS le CRON_SECRET ni le service role — c'est un secret propre à
// Shopify, à stocker dans SHOPIFY_WEBHOOK_SECRET.
//
// Topic → event mapping (doit matcher trigger_config.event des campagnes
// "event" créées dans le dashboard admin) :
//   orders/paid       → order_paid
//   orders/fulfilled   → order_shipped   (fulfillments/create envoie un payload
//                                         différent ; on utilise orders/fulfilled
//                                         pour rester sur le format "order")
//   orders/cancelled  → order_cancelled

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-shopify-hmac-sha256, x-shopify-topic",
};

const TOPIC_TO_EVENT: Record<string, string> = {
  "orders/paid": "order_paid",
  "orders/fulfilled": "order_shipped",
  "orders/cancelled": "order_cancelled",
};

async function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): Promise<boolean> {
  if (!hmacHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));
  // Comparaison à temps constant pour éviter les attaques par timing.
  if (computed.length !== hmacHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic") ?? "";
  // Les webhooks REST créés via l'API Admin (voir migration one-shot) sont
  // signés avec le Client Secret de l'app Shopify qui les a enregistrés.
  const secret = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

  const valid = await verifyHmac(rawBody, hmacHeader, secret);
  if (!valid) {
    console.log("Invalid HMAC signature for topic:", topic);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = TOPIC_TO_EVENT[topic];
  if (!event) {
    console.log("Ignoring unhandled topic:", topic);
    return new Response(JSON.stringify({ success: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const order = JSON.parse(rawBody);
    const customerGid = order?.customer?.admin_graphql_api_id as string | undefined;
    const legacyCustomerId = order?.customer?.id ? String(order.customer.id) : undefined;
    const orderNumber = order?.name ? String(order.name).replace("#", "") : String(order?.order_number ?? "");

    if (!legacyCustomerId) {
      console.log("Webhook sans customer.id, ignoré (order:", order?.id, ")");
      return new Response(JSON.stringify({ success: true, skipped: "no_customer" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // shopify_customer_id est stocké tantôt en gid (gid://shopify/Customer/123),
    // tantôt en id legacy selon le flux d'écriture (magic-link écrit un gid) —
    // on matche sur les deux formes pour ne pas rater le profil.
    const candidates = [legacyCustomerId, customerGid].filter(Boolean) as string[];
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .in("shopify_customer_id", candidates)
      .maybeSingle();

    if (!profile) {
      console.log("Aucun profil trouvé pour shopify_customer_id:", candidates);
      return new Response(JSON.stringify({ success: true, skipped: "no_profile" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cherche la campagne "event" active correspondante, comme le ferait
    // notification-scheduler pour les campagnes "cron".
    const { data: campaign } = await supabase
      .from("notification_campaigns")
      .select("id")
      .eq("trigger_type", "event")
      .eq("status", "active")
      .contains("trigger_config", { event })
      .maybeSingle();

    if (!campaign) {
      console.log(`Aucune campagne active pour l'event "${event}"`);
      return new Response(JSON.stringify({ success: true, skipped: "no_campaign" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const runnerRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notification-runner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        campaign_id: campaign.id,
        event_context: { user_id: profile.id, order_number: orderNumber },
      }),
    });
    const runnerResult = await runnerRes.json().catch(() => ({}));
    console.log(`Triggered "${event}" for user ${profile.id}:`, JSON.stringify(runnerResult));

    return new Response(JSON.stringify({ success: true, event, triggered: runnerResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shopify-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
