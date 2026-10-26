import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Événement analytics (entonnoir de connexion, stats admin). Ne doit jamais
// faire échouer la connexion : toute erreur est avalée.
async function track(
  supabase: SupabaseClient,
  name: string,
  properties: Record<string, unknown> = {},
  userId: string | null = null,
) {
  try {
    await supabase.from("analytics_events").insert({ source: "server", name, properties, user_id: userId });
  } catch (_) { /* analytics best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Client dédié à l'auth : verifyOtp y installe la session de l'utilisateur.
  // Sur le client principal, les requêtes suivantes partiraient alors avec le
  // JWT de l'utilisateur (et non plus le service role) → écritures refusées
  // par la RLS (ex: analytics_events source 'server').
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { email, action, token } = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail?.includes("@")) {
      return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const emailDomain = normalizedEmail.split("@")[1];

    // VERIFY — vérifie le code OTP tapé par l'utilisateur
    if (action === "verify") {
      const { data, error } = await authClient.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "email",
      });
      if (error || !data.session) {
        await track(supabase, "auth_otp_failed", { email_domain: emailDomain, reason: error?.code ?? error?.message ?? "no_session" });
        return new Response(JSON.stringify({ error: "Code invalide ou expiré" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // À ce stade le compte auth + le profil (créé par handle_new_user)
      // existent. Pour un premier login, le profil n'avait pas de
      // customer_id (le profil n'existait pas encore lors de l'envoi du
      // code) : on le rattache ici par user_id. Sans lui, sync-orders
      // échoue. On n'appelle Shopify que si le customer_id manque encore.
      const { data: profile } = await supabase
        .from("profiles").select("shopify_customer_id").eq("id", data.user.id).single();
      if (!profile?.shopify_customer_id) {
        const { customerId } = await shopifyCustomerExists(normalizedEmail);
        if (customerId) {
          await supabase.from("profiles").update({ shopify_customer_id: customerId }).eq("id", data.user.id);
        }
      }

      await track(supabase, "auth_otp_verified", { email_domain: emailDomain, first_login: !profile?.shopify_customer_id }, data.user?.id ?? null);

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
      // Email complet conservé (lecture admin uniquement) : prospects à recontacter.
      await track(supabase, "auth_otp_unknown_email", { email: normalizedEmail, email_domain: emailDomain });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // On rattache le customer_id Shopify au profil s'il existe déjà.
    // Pour un premier login, le profil n'existe pas encore (créé par le
    // trigger handle_new_user à la création du compte auth ci-dessous) —
    // le customer_id sera alors resynchronisé au premier appel sync-*.
    await supabase.from("profiles").update({ shopify_customer_id: customerId }).eq("email", normalizedEmail);

    // shouldCreateUser: true — le compte auth est créé au premier login.
    // La sécurité "clients Puure uniquement" est déjà garantie par le
    // check Shopify ci-dessus : on n'atteint jamais cette ligne pour un
    // email non-client.
    const { error } = await authClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });

    if (error) throw new Error(error.message);

    await track(supabase, "auth_otp_requested", { email_domain: emailDomain });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Error:", err);
    await track(supabase, "function_error", { function: "magic-link", message: String(err).slice(0, 300) });
    return new Response(JSON.stringify({ error: "Une erreur est survenue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
