// Réponses HTTP communes aux Edge Functions (CORS + JSON).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

/** Appel déclenché par pg_cron (x-cron-secret) ou par une autre fonction (service role). */
export function isTrustedCaller(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  const isService =
    (req.headers.get("authorization") ?? "") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  return isCron || isService;
}
