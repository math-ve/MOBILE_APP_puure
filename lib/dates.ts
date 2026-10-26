// Calculs de dates « calendrier » (jour local, sans décalage de fuseau).

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Ajoute des mois en restant sur le dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return d
}

/** AAAA-MM-JJ du jour local (et non UTC, qui peut décaler d'un jour). */
export function toLocalISODate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** Nombre de jours entiers entre aujourd'hui et `date` (négatif si passé). */
export function daysFromToday(date: Date): number {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}
