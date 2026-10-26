// Textes des notifications envoyées par le serveur, dans la langue du client
// (profiles.language). Repli sur l'anglais, comme l'app.

type Lang = "fr" | "en" | "de";
type Params = Record<string, string>;

const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", de: "de-DE" };

const MESSAGES: Record<string, Record<Lang, { title: string; body: string }>> = {
  renewalSoon: {
    fr: {
      title: "Prochaine commande dans 3 jours",
      body: "{product} part le {date} : {price} seront prélevés. Besoin de plus de temps ? Décalez la livraison.",
    },
    en: {
      title: "Next order in 3 days",
      body: "{product} ships on {date}: {price} will be charged. Need more time? Reschedule the delivery.",
    },
    de: {
      title: "Nächste Bestellung in 3 Tagen",
      body: "{product} wird am {date} versendet: {price} werden abgebucht. Mehr Zeit nötig? Verschiebe die Lieferung.",
    },
  },
  paymentFailed: {
    fr: {
      title: "Paiement refusé",
      body: "Vos cartouches sont en attente. Mettez à jour votre carte pour les recevoir.",
    },
    en: {
      title: "Payment declined",
      body: "Your cartridges are on hold. Update your card to receive them.",
    },
    de: {
      title: "Zahlung abgelehnt",
      body: "Deine Kartuschen sind zurückgestellt. Aktualisiere deine Karte, um sie zu erhalten.",
    },
  },
};

export function lang(value: string | null | undefined): Lang {
  return value === "fr" || value === "de" ? value : "en";
}

export function localized(language: string | null | undefined, key: keyof typeof MESSAGES | string, params: Params = {}) {
  const l = lang(language);
  const m = MESSAGES[key][l];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "").replace(/\s+/g, " ").trim();
  return { title: fill(m.title), body: fill(m.body) };
}

export function formatDateFor(language: string | null | undefined, iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALES[lang(language)], { day: "numeric", month: "long" });
}

export function formatPriceFor(language: string | null | undefined, amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALES[lang(language)], {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
  }).format(amount);
}
