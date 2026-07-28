import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const apiKey = Deno.env.get("APPSTLE_API_KEY")!;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shopify_customer_id")
      .eq("id", user_id)
      .single();

    if (profileError || !profile?.shopify_customer_id) {
      console.log("Profile error:", profileError?.message, "| value:", profile?.shopify_customer_id);
      return new Response(JSON.stringify({ error: "shopify_customer_id introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawGid = profile.shopify_customer_id;
    const customerId = rawGid.includes("/") ? rawGid.split("/").pop()! : rawGid;
    console.log("Customer ID:", customerId);

    const url = `https://subscription-admin.appstle.com/api/external/v2/subscription-customers-detail/valid/${customerId}`;
    console.log("Calling:", url);

    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Raw (1000):", text.substring(0, 1000));

    if (!res.ok || text.trimStart().startsWith("<")) {
      return new Response(JSON.stringify({ error: "Appstle error", status: res.status, raw: text.substring(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscriptions: any[] = JSON.parse(text);
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      console.log("No subscriptions found");
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Subscriptions count:", subscriptions.length);

    const rows = subscriptions.map((sub: any) => {
      let contractDetails: any[] = [];
      try {
        contractDetails = typeof sub.contractDetailsJSON === "string"
          ? JSON.parse(sub.contractDetailsJSON)
          : (sub.contractDetailsJSON ?? []);
      } catch (e) {
        console.log("Failed to parse contractDetailsJSON:", sub.contractDetailsJSON?.substring?.(0, 200));
      }

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
        total_successful_orders: sub.totalSuccessfulOrders ?? 0,
        contract_details_json: contractDetails.length > 0 ? contractDetails : null,
        last_synced_at: new Date().toISOString(),
      };
    });

    console.log("Upserting rows:", rows.length);
    const { error: upsertError } = await supabase
      .from("subscriptions_cache")
      .upsert(rows, { onConflict: "appstle_subscription_id" });

    if (upsertError) throw new Error(`Upsert error: ${upsertError.message}`);

    // Dérive profiles.country depuis l'adresse de livraison du 1er contrat (best-effort,
    // même source que get-subscription-detail : subscription-contracts/contract-external).
    try {
      const firstContractId = subscriptions[0]?.subscriptionContractId;
      if (firstContractId) {
        const contractRes = await fetch(
          `https://subscription-admin.appstle.com/api/external/v2/subscription-contracts/contract-external/${firstContractId}`,
          { headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" } },
        );
        const contractText = await contractRes.text();
        if (contractRes.ok && !contractText.trimStart().startsWith("<")) {
          const contractData = JSON.parse(contractText);
          // countryCode/countryCodeV2 sont déjà des strings ISO alpha-2 ("BE") dans ce payload
          // Appstle — pas un objet GraphQL {code, __typename} comme dans d'autres API Shopify.
          const countryCode: string | null = contractData?.deliveryMethod?.address?.countryCode ?? null;
          if (countryCode) {
            const { error: countryError } = await supabase
              .from("profiles")
              .update({ country: countryCode })
              .eq("id", user_id);
            if (countryError) console.log("Country sync failed:", countryError.message);
          }
        }
      }
    } catch (e) {
      console.log("Country derivation failed:", e);
    }

    console.log("Done, synced:", rows.length);
    return new Response(JSON.stringify({ success: true, synced: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("sync-subscriptions error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
