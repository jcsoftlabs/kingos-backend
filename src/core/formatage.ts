export function formaterHTG(centimes: bigint | number): string {
  const montant = Number(centimes) / 100;
  // Intl affiche "G" comme symbole CLDR de la gourde — on veut "HTG" en toutes lettres.
  return `${new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 0 }).format(montant)} HTG`;
}

export function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-HT", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
