import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APPSTLE_BASE = "https://subscription-admin.appstle.com/api/external/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { contractId, billingAttemptId } = await req.json();

    if (!contractId || !billingAttemptId) {
      return new Response(JSON.stringify({ error: "contractId et billingAttemptId requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("APPSTLE_API_KEY")!;
    const appstleHeaders = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    };

    const url = `${APPSTLE_BASE}/subscription-contracts/${contractId}/billing-attempts/${billingAttemptId}/skip`;
    console.log("Skip order:", url);

    const res = await fetch(url, { method: "POST", headers: appstleHeaders });
    console.log("Skip response status:", res.status);

    if (!res.ok) {
      const errText = res.status !== 204 ? await res.text() : "";
      console.log("Skip error:", errText.substring(0, 500));
      return new Response(JSON.stringify({ error: "Appstle skip failed", status: res.status, raw: errText.substring(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("skip-order error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
