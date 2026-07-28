export function formaterHTG(centimes: bigint | number): string {
  const montant = Number(centimes) / 100;
  // Les centimes ne sont affichés que s'il y en a : arrondir systématiquement
  // faisait diverger le total imprimé du montant en toutes lettres.
  // Intl affiche "G" comme symbole CLDR de la gourde — on veut "HTG" en clair.
  const decimales = Number(centimes) % 100 === 0 ? 0 : 2;
  return `${new Intl.NumberFormat("fr-HT", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(montant)} HTG`;
}

export function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-HT", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
