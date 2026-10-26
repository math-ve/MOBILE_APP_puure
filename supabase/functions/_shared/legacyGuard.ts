// Garde des anciennes fonctions d'abonnement (encore appelées par les versions
// 1.0.0 / 1.0.1 de l'app). Avant ce garde, elles faisaient confiance au
// user_id / customerId envoyé dans le corps : n'importe qui pouvait agir sur
// le contrat d'un autre client avec la seule clé publique.
//
// Règles :
//  - clé de service (appels internes, webhooks) : corps pris tel quel ;
//  - sinon session client obligatoire ; user_id du corps remplacé par celui
//    de la session ; contrat vérifié comme appartenant au client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./http.ts";
import { fetchBillingAttempts, getShopifyCustomerId, userOwnsContract } from "./appstle.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export type Caller = { service: true; userId: null } | { service: false; userId: string };

function deny(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export async function identify(req: Request): Promise<Caller | Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) return { service: true, userId: null };
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return deny(401, "Session invalide");
  return { service: false, userId: data.user.id };
}

/** Vérifie que le contrat appartient au client (sans effet pour la clé de service). */
export async function ownsContract(caller: Caller, contractId: unknown): Promise<Response | null> {
  if (caller.service) return null;
  const id = String(contractId ?? "");
  if (!/^\d+$/.test(id)) return deny(400, "contractId invalide");
  if (!(await userOwnsContract(supabase, caller.userId, id))) {
    console.warn(`Accès refusé : user ${caller.userId} → contrat ${id}`);
    return deny(404, "Abonnement introuvable");
  }
  return null;
}

/** Vérifie que la livraison (billing attempt) appartient bien au contrat. */
export async function attemptBelongs(caller: Caller, contractId: unknown, attemptId: unknown): Promise<Response | null> {
  if (caller.service) return null;
  const { upcoming } = await fetchBillingAttempts(String(contractId));
  return upcoming.some((o) => String(o.id) === String(attemptId)) ? null : deny(404, "Livraison introuvable");
}

export async function ownCustomerId(caller: Caller): Promise<string | null> {
  return caller.service ? null : await getShopifyCustomerId(supabase, caller.userId);
}
