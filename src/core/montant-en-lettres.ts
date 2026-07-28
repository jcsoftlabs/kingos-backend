const UNITES = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
// dix (0) à dix-neuf (9) — un seul tableau complet plutôt que deux cas se
// chevauchant à moitié (bug trouvé par les tests : la plage 90-99 utilisait
// un tableau qui s'arrêtait à seize).
const DIX_A_DIX_NEUF = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

/**
 * @param suffixeSuit — true quand ce nombre sert de multiplicateur devant
 * "mille"/"million"/"milliard" (ex. le "cinq cent" de "cinq cent mille") :
 * dans ce cas "cent" et "vingt" ne prennent jamais le "s" du pluriel, même
 * sans reste, parce qu'un mot les suit dans le nombre complet. Piège
 * classique de l'orthographe des nombres en français.
 */
function centaineEnLettres(n: number, suffixeSuit = false): string {
  if (n === 0) return "";
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let mot = "";

  if (c > 0) {
    mot += c === 1 ? "cent" : `${UNITES[c]} cent`;
    if (c > 1 && reste === 0 && !suffixeSuit) mot += "s";
    if (reste > 0) mot += " ";
  }

  if (reste > 0) {
    if (reste < 10) {
      mot += UNITES[reste];
    } else if (reste < 20) {
      mot += DIX_A_DIX_NEUF[reste - 10];
    } else {
      const d = Math.floor(reste / 10);
      const u = reste % 10;
      if (d === 7 || d === 9) {
        // soixante-onze/-douze... prennent "et" uniquement au premier cran
        // (71 : "soixante et onze") ; quatre-vingt-onze n'a jamais de "et".
        const liaison = d === 7 && u === 1 ? "-et-" : "-";
        mot += `${DIZAINES[d]}${liaison}${DIX_A_DIX_NEUF[u]}`;
      } else {
        mot += DIZAINES[d];
        if (u === 1 && d !== 8) mot += "-et-un";
        else if (u > 0) mot += `-${UNITES[u]}`;
        else if (d === 8 && !suffixeSuit) mot += "s"; // quatre-vingts, sauf si suivi de mille/million
      }
    }
  }

  return mot;
}

/**
 * Montant en toutes lettres, requis sur les devis/factures par la pratique
 * commerciale locale (plan §7.4). Gère jusqu'au milliard — largement
 * suffisant pour un montant en gourdes.
 */
export function montantEnLettres(entier: number): string {
  if (entier === 0) return "zéro";
  if (entier < 0) return `moins ${montantEnLettres(-entier)}`;

  const tranches: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
    [1_000, "mille", "mille"],
  ];

  let reste = entier;
  const parties: string[] = [];

  for (const [valeur, singulier, pluriel] of tranches) {
    const compte = Math.floor(reste / valeur);
    if (compte > 0) {
      if (valeur === 1000 && compte === 1) {
        parties.push("mille");
      } else {
        parties.push(`${centaineEnLettres(compte, true)} ${compte > 1 ? pluriel : singulier}`);
      }
      reste %= valeur;
    }
  }

  if (reste > 0) parties.push(centaineEnLettres(reste));

  return parties.join(" ").replace(/\s+/g, " ").trim();
}

export function montantHTGEnLettres(centimes: bigint): string {
  const gourdes = Math.floor(Number(centimes) / 100);
  const reste = Number(centimes % 100n);
  const enLettres = `${montantEnLettres(gourdes)} gourde${gourdes > 1 ? "s" : ""}`;
  // Les centimes doivent apparaître : sinon le montant en toutes lettres
  // (tronqué) contredit le total affiché (arrondi) sur la même facture —
  // 169 812,50 s'écrivait « ... huit cent douze gourdes » sous un total
  // imprimé « 169 813 HTG ».
  if (reste === 0) return enLettres;
  return `${enLettres} et ${montantEnLettres(reste)} centime${reste > 1 ? "s" : ""}`;
}
