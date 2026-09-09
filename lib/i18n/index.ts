import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import de from './locales/de.json'
import en from './locales/en.json'
import fr from './locales/fr.json'

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'de'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'fr'

// Clé AsyncStorage du choix manuel. Absente => on suit la langue de l'appareil.
const STORAGE_KEY = 'user_language'

const resources = {
  fr: fr as Record<string, object>,
  en: en as Record<string, object>,
  de: de as Record<string, object>,
}

function isSupported(lang: string | null | undefined): lang is Language {
  return !!lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)
}

/** Langue de l'appareil réduite à un code court (fr, en, de…). */
export function getDeviceLanguage(): Language {
  const detected = Localization.getLocales()[0]?.languageCode?.toLowerCase()
  return isSupported(detected) ? detected : DEFAULT_LANGUAGE
}

/**
 * Résout la langue initiale :
 * 1. choix manuel stocké
 * 2. langue de l'appareil (si supportée)
 * 3. français
 */
async function resolveInitialLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (isSupported(stored)) return stored
  } catch {
    // AsyncStorage indisponible : on retombe sur la détection
  }
  return getDeviceLanguage()
}

let initPromise: Promise<typeof i18n> | null = null

/** Initialise i18next une seule fois. Idempotent. */
export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise

  initPromise = resolveInitialLanguage().then((lng) =>
    i18n
      .use(initReactI18next)
      .init({
        resources,
        lng,
        fallbackLng: DEFAULT_LANGUAGE,
        defaultNS: 'common',
        ns: Object.keys(fr),
        interpolation: { escapeValue: false },
        returnNull: false,
      })
      .then(() => i18n),
  )

  return initPromise
}

/** Indique si l'utilisateur a fixé une langue manuellement. */
export async function hasManualLanguage(): Promise<boolean> {
  try {
    return isSupported(await AsyncStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

/**
 * Change la langue et persiste le choix manuel.
 * Le callback `onPersist` permet de répercuter la valeur ailleurs
 * (ex. profiles.language) sans coupler i18n à Supabase.
 */
export async function setLanguage(
  lang: Language,
  onPersist?: (lang: Language) => void | Promise<void>,
): Promise<void> {
  await i18n.changeLanguage(lang)
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // non bloquant
  }
  await onPersist?.(lang)
}

/**
 * Repasse en mode automatique : efface le choix manuel et applique
 * la langue de l'appareil.
 */
export async function useDeviceLanguage(
  onPersist?: (lang: Language) => void | Promise<void>,
): Promise<void> {
  const lang = getDeviceLanguage()
  await i18n.changeLanguage(lang)
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    // non bloquant
  }
  await onPersist?.(lang)
}

export { i18n }
export default i18n
