import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOPIFY_DOMAIN = "tqjtej-jq.myshopify.com";
const SHOPIFY_API_VERSION = "2026-04";

// Mappe les statuts Shopify (MAJUSCULES) vers les valeurs acceptées par la contrainte CHECK
function normalizeStatus(raw: string | null | undefined): string {
  const map: Record<string, string> = {
    FULFILLED: "fulfilled",
    UNFULFILLED: "unfulfilled",
    PARTIALLY_FULFILLED: "partially_fulfilled",
    SCHEDULED: "pending",
    ON_HOLD: "pending",
    IN_PROGRESS: "unfulfilled",
    OPEN: "pending",
    CLOSED: "fulfilled",
    CANCELLED: "cancelled",
    PAID: "confirmed",
    UNPAID: "pending",
    AUTHORIZED: "confirmed",
    PARTIALLY_PAID: "pending",
    REFUNDED: "refunded",
    PARTIALLY_REFUNDED: "refunded",
    VOIDED: "cancelled",
    PENDING: "pending",
  };
  if (!raw) return "pending";
  return map[raw.toUpperCase()] ?? raw.toLowerCase();
}

// Récupère toutes les commandes d'un client Shopify via GraphQL
async function fetchShopifyOrders(customerId: string, adminToken: string) {
  const query = `
    query($customerId: ID!) {
      customer(id: $customerId) {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              totalPriceSet {
                shopMoney { amount currencyCode }
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    quantity
                    sku
                  }
                }
              }
              shippingAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                zip
                country
              }
              fulfillments(first: 5) {
                trackingInfo(first: 5) {
                  number
                  url
                  company
                }
                status
                updatedAt
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken,
      },
      body: JSON.stringify({ query, variables: { customerId } }),
    }
  );

  if (!res.ok) throw new Error(`Shopify GraphQL error: ${res.status}`);
  const data = await res.json();

  if (data.errors) throw new Error(`Shopify errors: ${JSON.stringify(data.errors)}`);

  return data?.data?.customer?.orders?.edges ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const adminToken = Deno.env.get("SHOPIFY_ADMIN_TOKEN")!;

    // Récupère le shopify_customer_id depuis profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shopify_customer_id, email")
      .eq("id", user_id)
      .single();

    if (profileError || !profile?.shopify_customer_id) {
      return new Response(JSON.stringify({ error: "Profil ou customer_id introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Statuts actuels en cache — pour détecter les transitions vers "expédiée"
    const { data: previousOrders } = await supabase
      .from("orders_cache")
      .select("shopify_order_id, status")
      .eq("user_id", user_id);
    const prevStatusMap = new Map(
      (previousOrders ?? []).map((o) => [o.shopify_order_id, o.status])
    );

    const orderEdges = await fetchShopifyOrders(profile.shopify_customer_id, adminToken);

    if (orderEdges.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transforme les données Shopify → format orders_cache
    const rows = orderEdges.map(({ node: o }: any) => {
      const fulfillment = o.fulfillments?.[0] ?? null;
      const tracking = fulfillment?.trackingInfo?.[0] ?? null;

      return {
        user_id,
        shopify_order_id: o.id,
        order_number: o.name.replace("#", ""),
        status: normalizeStatus(o.displayFulfillmentStatus ?? o.displayFinancialStatus),
        line_items: o.lineItems.edges.map(({ node: li }: any) => ({
          title: li.title,
          quantity: li.quantity,
          sku: li.sku,
        })),
        total_price: parseFloat(o.totalPriceSet?.shopMoney?.amount ?? "0"),
        currency: o.totalPriceSet?.shopMoney?.currencyCode ?? "EUR",
        shipping_address: o.shippingAddress ?? null,
        tracking_number: tracking?.number ?? null,
        tracking_url: tracking?.url ?? null,
        carrier: tracking?.company ?? null,
        tracking_events: fulfillment
          ? [{
              status: fulfillment.status,
              updated_at: fulfillment.updatedAt,
            }]
          : null,
        aftership_tracking_id: null,
        shopify_created_at: o.createdAt,
        last_synced_at: new Date().toISOString(),
      };
    });

    console.log("Statuses found:", rows.map(r => r.status));

    const { error: upsertError } = await supabase
      .from("orders_cache")
      .upsert(rows, { onConflict: "shopify_order_id" });

    if (upsertError) throw new Error(`Upsert error: ${upsertError.message}`);

    // Notifie les commandes qui viennent de passer à "expédiée"
    // (uniquement les transitions — une commande déjà expédiée au premier sync ne notifie pas)
    const newlyShipped = rows.filter((r: any) => {
      const prev = prevStatusMap.get(r.shopify_order_id);
      return prev && prev !== "fulfilled" && r.status === "fulfilled";
    });

    for (const order of newlyShipped) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id,
          title: "📦 Commande expédiée",
          body: `Votre commande #${order.order_number} est en route !`,
          data: { type: "order_shipped", screen: "/(tabs)/orders" },
        }),
      }).catch((e) => console.error("order_shipped notification error:", e));
    }

    return new Response(JSON.stringify({ success: true, synced: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("sync-orders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
