import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function shopifyCustomerExists(email: string): Promise<{ exists: boolean; customerId?: string; name?: string }> {
  const domain = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
  const token = Deno.env.get("SHOPIFY_ADMIN_TOKEN")!;
  const query = `query($email: String!) { customers(first: 1, query: $email) { edges { node { id firstName email } } } }`;
  const res = await fetch(`https://${domain}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables: { email: `email:${email}` } }),
  });
  if (!res.ok) throw new Error(`Shopify error: ${res.status}`);
  const data = await res.json();
  const edges = data?.data?.customers?.edges ?? [];
  if (edges.length === 0) return { exists: false };
  const customer = edges[0].node;
  if (customer.email.toLowerCase() !== email.toLowerCase()) return { exists: false };
  return { exists: true, customerId: customer.id, name: customer.firstName || "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, action, token } = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail?.includes("@")) {
      return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // VERIFY — vérifie le code OTP tapé par l'utilisateur
    if (action === "verify") {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "email",
      });
      if (error || !data.session) {
        return new Response(JSON.stringify({ error: "Code invalide ou expiré" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SEND — vérifie Shopify et envoie le code OTP via Supabase Auth
    const { exists, customerId } = await shopifyCustomerExists(normalizedEmail);
    if (!exists) {
      console.log(`Email inconnu: ${normalizedEmail}`);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("profiles").upsert({ email: normalizedEmail, shopify_customer_id: customerId }, { onConflict: "email" });

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Une erreur est survenue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});