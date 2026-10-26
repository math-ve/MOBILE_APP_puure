// Textes des notifications envoyées par le serveur, dans la langue du client
// (profiles.language). Repli sur l'anglais, comme l'app.

type Lang = "fr" | "en" | "de";
type Params = Record<string, string>;

const MESSAGES: Record<string, Record<Lang, { title: string; body: string }>> = {
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
