const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 17track Shopify API — discovered from puurefilters.com/apps/order-tracking widget
const TRACK_API = "https://shopify-t.17track.net/track/shopify";
const PAGE_ID = "7434837943903511547"; // Puure Filters 17track page_id

const CHINESE_REPLACEMENTS = [
  "Guangzhou", "Shenzhen", "Beijing", "Shanghai", "Hong Kong",
  "Chengdu", "Wuhan", "Tianjin", "Hangzhou", "Nanjing",
  "Dongguan", "Foshan", "Suzhou", "Qingdao", "Ningbo",
  "Kunming", "Harbin", "Dalian", "Xiamen", "Fuzhou",
  "China", "CN", "PRC",
  "Linehaul Agent", "Linehaul", "Line haul",
];

function cleanText(text: string | null): string | null {
  if (!text) return null;
  let cleaned = text;
  for (const word of CHINESE_REPLACEMENTS) {
    cleaned = cleaned.replace(new RegExp(word, "gi"), "").trim();
  }
  cleaned = cleaned.replace(/\s+/g, " ").replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
  return cleaned || null;
}

function cleanLocation(location: string | null): string | null {
  const cleaned = cleanText(location);
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tracking_number } = await req.json();

    if (!tracking_number) {
      return new Response(JSON.stringify({ error: "tracking_number requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Tracking:", tracking_number);

    const res = await fetch(TRACK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://puurefilters.com",
        "Referer": "https://puurefilters.com/apps/order-tracking",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      body: JSON.stringify({
        data: [{ num: tracking_number, fc: null, sc: null }],
        guid: "",
        g: PAGE_ID,
        lang: "fr",
        timeZoneOffset: -120,
      }),
    });

    console.log("17track status:", res.status);

    if (!res.ok) {
      const raw = await res.text();
      console.log("17track error:", raw.substring(0, 300));
      return new Response(JSON.stringify({ error: "17track API error", status: res.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const shipment = data?.shipments?.[0];

    if (!shipment || shipment.code !== 200) {
      return new Response(JSON.stringify({ error: "Colis introuvable", code: shipment?.code ?? null }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const s = shipment.shipment;

    // Extract milestone events
    const milestones: any[] = s?.milestone ?? [];

    // Extract full event list from tracking providers
    const providers: any[] = s?.tracking?.providers ?? [];
    const rawEvents: { time: string | null; description: string | null; location: string | null }[] = [];
    for (const provider of providers) {
      for (const event of provider.events ?? []) {
        rawEvents.push({
          time: event.time_iso ?? event.time_raw?.date ?? null,
          description: event.description ?? null,
          location: event.address?.city ?? event.location ?? null,
        });
      }
    }

    // Clean Chinese references from all events (keep all events)
    const cleanedEvents = rawEvents.map(e => ({
      ...e,
      description: cleanText(e.description),
      location: cleanLocation(e.location),
    }));

    const filteredMilestones = milestones.map((m: any) => ({
      stage: m.key_stage,
      time: m.time_iso ?? null,
    }));

    // Clean latest_event location too
    const rawLatest = s?.latest_event ?? null;
    const latestEvent = rawLatest ? {
      time: rawLatest.time_iso ?? null,
      description: cleanText(rawLatest.description ?? null),
      location: cleanLocation(rawLatest.address?.city ?? rawLatest.location ?? null),
    } : null;

    const result = {
      tracking_number,
      carrier: data.id ?? null,
      status: s?.latest_status?.status ?? null,
      sub_status: s?.latest_status?.sub_status ?? null,
      latest_event: latestEvent,
      origin_country: s?.shipping_info?.shipper_address?.country ?? null,
      destination_country: s?.shipping_info?.recipient_address?.country ?? null,
      days_of_transit: s?.time_metrics?.days_of_transit ?? null,
      estimated_delivery: s?.time_metrics?.estimated_delivery_date?.from ?? null,
      milestones: filteredMilestones,
      events: cleanedEvents,
    };

    console.log("Status:", result.status, "| Events:", cleanedEvents.length, "| Milestones:", filteredMilestones.length);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("scrape-tracking error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
