import { supabase } from './supabase'
import i18n from './i18n'
import { track } from './analytics'

// Envoi des demandes au support (Zendesk via le worker Cloudflare du site).
// Même format que le formulaire du site : catégorie machine + sujet en français.

export const SUPPORT_WORKER_URL = 'https://lively-sound-95c2.mathieu-vaneynde.workers.dev/'
export const SUPPORT_EMAIL = 'customercare@puurefilters.com'

// Durée de validité du lien vers la photo jointe au ticket (le support la consulte plus tard).
const PHOTO_LINK_TTL_S = 30 * 24 * 3600

export type SupportTicket = {
  /** Valeur de groupe Zendesk, ex. 'Order / Delivery' (non traduite). */
  group: string
  /** Sous-catégorie machine, ex. 'order_/_delivery__order_not_received'. */
  category: string
  message: string
  /** Contexte ajouté au message (commande, contrat…), lisible par l'agent. */
  context?: Record<string, string | null | undefined>
  /** Écran d'origine, pour les analytics. */
  source: string
}

async function currentEmail(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.email ?? null
}

/** Envoie le ticket. Renvoie l'e-mail auquel le support répondra. */
export async function sendSupportTicket(ticket: SupportTicket): Promise<string> {
  const email = await currentEmail()
  if (!email) throw new Error('session')

  const frSub = (i18n.getResource('fr', 'support', 'sub') as Record<string, string> | undefined)?.[ticket.category] ?? ticket.category
  const contextLines = Object.entries(ticket.context ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} : ${v}`)
  const message = [ticket.message.trim(), contextLines.length ? `\n— Envoyé depuis l'app Puure\n${contextLines.join('\n')}` : '']
    .filter(Boolean)
    .join('\n')

  const res = await fetch(SUPPORT_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      category: ticket.category,
      subject: `Contact via app — ${ticket.group} — ${frSub}`,
      message,
    }),
  })
  const ok = res.status === 201
  track('support_ticket_sent', { category: ticket.category, group: ticket.group, success: ok, source: ticket.source })
  if (!ok) throw new Error(`support ${res.status}`)
  return email
}

/**
 * Envoie une photo dans le stockage privé du client et renvoie un lien
 * temporaire à joindre au ticket. Le client ne peut écrire que dans son dossier.
 */
export async function uploadSupportPhoto(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('session')
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('heic') ? 'heic' : 'jpg'
  const path = `${session.user.id}/${Date.now()}.${ext}`

  const body = await (await fetch(uri)).arrayBuffer()
  const { error } = await supabase.storage.from('support-photos').upload(path, body, { contentType: mimeType })
  if (error) throw error

  const { data, error: signError } = await supabase.storage.from('support-photos').createSignedUrl(path, PHOTO_LINK_TTL_S)
  if (signError || !data?.signedUrl) throw signError ?? new Error('signed url')
  return data.signedUrl
}
