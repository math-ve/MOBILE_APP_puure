import { attemptBelongs, identify, ownsContract } from "../../functions/_shared/legacyGuard.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APPSTLE_BASE = "https://subscription-admin.appstle.com/api/external/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Sécurité : session obligatoire, contrat du client, et livraison visée
    // (skip, order-now, reschedule) appartenant à ce contrat.
    const caller = await identify(req);
    if (caller instanceof Response) return caller;
    const body = await req.json();
    const denied = await ownsContract(caller, body.contractId);
    if (denied) return denied;
    if (["skip", "order-now", "reschedule"].includes(body.action)) {
      const notHis = await attemptBelongs(caller, body.contractId, body.id);
      if (notHis) return notHis;
    }
    const { action, contractId, id, newBillingDate, rescheduleAllUpcoming, discountCode, billingIntervalCount, deliveryIntervalCount, address } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("APPSTLE_API_KEY")!;
    const appstleHeaders = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; PuureFilters/1.0)",
    };

    let url: string;
    let fetchOptions: RequestInit = { method: "PUT", headers: appstleHeaders };

    switch (action) {
      case "skip":
        if (!id) return err400("id requis pour skip");
        url = `${APPSTLE_BASE}/subscription-billing-attempts/skip-order/${id}`;
        break;

      case "reschedule":
        if (!id || !contractId || !newBillingDate) return err400("id, contractId et newBillingDate requis pour reschedule");
        url = `${APPSTLE_BASE}/subscription-billing-attempts/reschedule-order/${id}?contractId=${contractId}&newBillingDate=${newBillingDate}&rescheduleAllUpcoming=${rescheduleAllUpcoming ?? false}`;
        break;

      case "order-now":
        if (!id) return err400("id requis pour order-now");
        url = `${APPSTLE_BASE}/subscription-billing-attempts/attempt-billing/${id}`;
        break;

      case "apply-discount":
        if (!contractId || !discountCode) return err400("contractId et discountCode requis pour apply-discount");
        url = `${APPSTLE_BASE}/subscription-contracts-apply-discount?contractId=${contractId}&discountCode=${encodeURIComponent(discountCode)}`;
        break;

      case "update-frequency":
        if (!contractId || !billingIntervalCount) return err400("contractId et billingIntervalCount requis pour update-frequency");
        const deliveryCount = deliveryIntervalCount ?? billingIntervalCount;
        url = `${APPSTLE_BASE}/subscription-contracts-update-billing-interval?contractId=${contractId}&billingIntervalCount=${billingIntervalCount}&deliveryIntervalCount=${deliveryCount}`;
        break;

      case "update-address":
        if (!contractId || !address) return err400("contractId et address requis pour update-address");
        url = `${APPSTLE_BASE}/subscription-contracts-update-shipping-address?contractId=${contractId}`;
        fetchOptions = { method: "PUT", headers: appstleHeaders, body: JSON.stringify(address) };
        break;

      default:
        return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`Action: ${action} | URL: ${url}`);
    const res = await fetch(url, fetchOptions);
    console.log("Appstle response:", res.status);

    if (!res.ok) {
      const errText = res.status !== 204 ? await res.text() : "";
      console.log("Appstle error:", errText.substring(0, 500));
      return new Response(JSON.stringify({ error: `Appstle ${action} failed`, status: res.status, raw: errText.substring(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("subscription-action error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function err400(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
