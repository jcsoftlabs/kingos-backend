export function formaterHTG(centimes: bigint | number): string {
  const montant = Number(centimes) / 100;
  return new Intl.NumberFormat("fr-HT", { style: "currency", currency: "HTG", maximumFractionDigits: 0 }).format(montant);
}

export function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-HT", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
