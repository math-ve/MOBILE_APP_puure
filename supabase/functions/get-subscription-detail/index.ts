const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APPSTLE_BASE = "https://subscription-admin.appstle.com/api/external/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { contractId, customerId } = await req.json();

    if (!contractId) {
      return new Response(JSON.stringify({ error: "contractId requis" }), {
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

    const id = String(contractId);
    const cid = customerId ? String(customerId) : null;
    console.log("Fetching contract detail + billing attempts for:", id, "customer:", cid);

    const pmFetch = cid
      ? fetch(`${APPSTLE_BASE}/subscription-contract-details/shopify/customer/${cid}/payment-methods`, { headers: appstleHeaders })
      : Promise.resolve(null);

    const [upcomingRes, pastRes, contractRes, pmRes] = await Promise.all([
      fetch(`${APPSTLE_BASE}/subscription-billing-attempts/top-orders?contractId=${id}`, { headers: appstleHeaders }),
      fetch(`${APPSTLE_BASE}/subscription-billing-attempts/past-orders?contractId=${id}`, { headers: appstleHeaders }),
      fetch(`${APPSTLE_BASE}/subscription-contracts/contract-external/${id}`, { headers: appstleHeaders }),
      pmFetch,
    ]);

    console.log("Upcoming:", upcomingRes.status, "| Past:", pastRes.status, "| Contract:", contractRes.status, "| PM:", pmRes?.status ?? "skipped");

    const parseList = async (res: Response): Promise<any[]> => {
      if (!res.ok) {
        const t = await res.text();
        console.log("Non-ok list response:", res.status, t.substring(0, 300));
        return [];
      }
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return [];
      try {
        const data = JSON.parse(text);
        return data.content ?? (Array.isArray(data) ? data : []);
      } catch {
        return [];
      }
    };

    const parseJSON = async (res: Response | null): Promise<any> => {
      if (!res) return null;
      if (!res.ok) {
        const t = await res.text();
        console.log("Non-ok JSON response:", res.status, t.substring(0, 300));
        return null;
      }
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return null;
      try { return JSON.parse(text); } catch { return null; }
    };

    const [upcomingOrders, pastOrders, contractData, pmData] = await Promise.all([
      parseList(upcomingRes),
      parseList(pastRes),
      parseJSON(contractRes),
      parseJSON(pmRes),
    ]);

    console.log("Upcoming:", upcomingOrders.length, "| Past:", pastOrders.length, "| Contract:", !!contractData, "| PM nodes:", pmData?.nodes?.length ?? 0);

    // Strip noisy GraphQL meta-fields from shipping address
    const rawAddr = contractData?.deliveryMethod?.address ?? null;
    const addr = rawAddr ? (({ __typename, countryCodeV2, ...rest }) => rest)(rawAddr) : null;

    // Prefer non-revocable (primary) card, fall back to first non-revoked
    const nodes: any[] = pmData?.nodes ?? [];
    const activeNode =
      nodes.find((n: any) => n.revokedAt === null && n.instrument?.revocable === false) ??
      nodes.find((n: any) => n.revokedAt === null) ??
      null;
    const instrument = activeNode?.instrument ?? null;
    const paymentMethod = instrument ? {
      brand: instrument.brand ?? null,
      lastDigits: instrument.lastDigits ?? null,
      maskedNumber: instrument.maskedNumber ?? null,
      expiryMonth: instrument.expiryMonth ?? null,
      expiryYear: instrument.expiryYear ?? null,
      cardHolderName: instrument.name ?? null,
    } : null;

    return new Response(JSON.stringify({ upcomingOrders, pastOrders, shippingAddress: addr, paymentMethod }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("get-subscription-detail error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
