import { Decimal } from "decimal.js";

/**
 * Moteur de tarification — cœur du système (plan §4).
 * Pas de dépendance à la base ni au réseau : testable en isolation.
 * Tout calcul intermédiaire est en Decimal ; l'arrondi en centimes n'intervient
 * qu'une seule fois, sur le prix unitaire, en ROUND_HALF_UP.
 */

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type ModeTarification = "SURFACE" | "QUANTITE" | "FORFAIT" | "SUR_DEVIS";

export interface OptionChoisie {
  cle: string; // ex. "materiau"
  valeur: string; // ex. "vinyle-13oz"
  libelle: string;
  coefficient?: string | null; // Decimal sérialisé
  supplementCents?: bigint | null;
  supplementParUniteCents?: bigint | null;
}

export interface PalierApplicable {
  quantiteMin: number;
  quantiteMax: number | null;
  remisePct?: string | null;
  prixUnitaireCents?: bigint | null;
}

export interface EntreeCalculSurface {
  mode: "SURFACE";
  largeurPouces: number;
  hauteurPouces: number;
  quantite: number;
  prixBaseCents: bigint; // par ft²
  prixMinCents: bigint;
  surfaceMinFt2?: string | null;
  options: OptionChoisie[];
  palier?: PalierApplicable | null;
}

export interface EntreeCalculQuantite {
  mode: "QUANTITE";
  quantite: number;
  prixBaseCents: bigint; // par pièce
  prixMinCents: bigint;
  options: OptionChoisie[];
  palier?: PalierApplicable | null;
}

export interface EntreeCalculForfait {
  mode: "FORFAIT";
  quantite: number;
  prixBaseCents: bigint;
}

export type EntreeCalcul = EntreeCalculSurface | EntreeCalculQuantite | EntreeCalculForfait;

export interface EtapeCalcul {
  libelle: string;
  valeur: string;
}

export interface ResultatCalcul {
  mode: ModeTarification;
  etapes: EtapeCalcul[];
  prixUnitaireCents: bigint;
  totalCents: bigint;
}

function centsToDecimal(v: bigint) {
  return new Decimal(v.toString());
}

function decimalToCentsBigInt(d: Decimal) {
  return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString());
}

function appliquerOptions(prixBase: Decimal, options: OptionChoisie[], surfaceFt2?: Decimal) {
  let prix = prixBase;
  const etapes: EtapeCalcul[] = [];

  for (const opt of options) {
    if (opt.coefficient) {
      const coef = new Decimal(opt.coefficient);
      prix = prix.mul(coef);
      etapes.push({ libelle: `Coefficient ${opt.libelle}`, valeur: `×${coef.toString()}` });
    }
    if (opt.supplementCents) {
      const supp = centsToDecimal(opt.supplementCents);
      prix = prix.add(supp);
      etapes.push({ libelle: `Supplément ${opt.libelle}`, valeur: `+${supp.toString()} c` });
    }
    if (opt.supplementParUniteCents && surfaceFt2) {
      const supp = centsToDecimal(opt.supplementParUniteCents).mul(surfaceFt2);
      prix = prix.add(supp);
      etapes.push({ libelle: `Supplément ${opt.libelle} (par ft²)`, valeur: `+${supp.toString()} c` });
    }
  }

  return { prix, etapes };
}

function appliquerPalier(totalAvant: Decimal, palier?: PalierApplicable | null) {
  if (!palier) return { total: totalAvant, etape: null as EtapeCalcul | null };
  if (palier.remisePct) {
    const remise = new Decimal(palier.remisePct).div(100);
    const total = totalAvant.mul(new Decimal(1).sub(remise));
    return {
      total,
      etape: { libelle: `Remise palier (${palier.quantiteMin}+)`, valeur: `-${palier.remisePct}%` },
    };
  }
  return { total: totalAvant, etape: null };
}

function calculerSurface(e: EntreeCalculSurface): ResultatCalcul {
  const etapes: EtapeCalcul[] = [];

  const surfaceFt2 = new Decimal(e.largeurPouces).mul(e.hauteurPouces).div(144);
  etapes.push({ libelle: "Surface", valeur: `${surfaceFt2.toFixed(4)} ft²` });

  const surfaceMin = e.surfaceMinFt2 ? new Decimal(e.surfaceMinFt2) : new Decimal(0);
  const surfaceFacturee = Decimal.max(surfaceFt2, surfaceMin);
  if (surfaceFacturee.gt(surfaceFt2)) {
    etapes.push({ libelle: `Surface facturée (min. ${surfaceMin.toString()} ft²)`, valeur: `${surfaceFacturee.toFixed(4)} ft²` });
  }

  const prixBase = centsToDecimal(e.prixBaseCents).mul(surfaceFacturee);
  etapes.push({ libelle: "Prix de base", valeur: `${prixBase.toFixed(0)} c` });

  const { prix: prixAvecOptions, etapes: etapesOptions } = appliquerOptions(prixBase, e.options, surfaceFacturee);
  etapes.push(...etapesOptions);

  const prixMin = centsToDecimal(e.prixMinCents);
  const prixUnitaire = Decimal.max(prixAvecOptions, prixMin);
  etapes.push({ libelle: "Prix unitaire", valeur: `${prixUnitaire.toFixed(0)} c` });

  const prixUnitaireCents = decimalToCentsBigInt(prixUnitaire);
  const totalAvantPalier = centsToDecimal(prixUnitaireCents).mul(e.quantite);
  etapes.push({ libelle: "Quantité", valeur: `×${e.quantite}` });

  const { total, etape } = appliquerPalier(totalAvantPalier, e.palier);
  if (etape) etapes.push(etape);

  return {
    mode: "SURFACE",
    etapes,
    prixUnitaireCents,
    totalCents: decimalToCentsBigInt(total),
  };
}

function calculerQuantite(e: EntreeCalculQuantite): ResultatCalcul {
  const etapes: EtapeCalcul[] = [];

  const prixBase = e.palier?.prixUnitaireCents
    ? centsToDecimal(e.palier.prixUnitaireCents)
    : centsToDecimal(e.prixBaseCents);
  etapes.push({ libelle: "Prix de base", valeur: `${prixBase.toFixed(0)} c` });

  const { prix: prixAvecOptions, etapes: etapesOptions } = appliquerOptions(prixBase, e.options);
  etapes.push(...etapesOptions);

  const prixMin = centsToDecimal(e.prixMinCents);
  const prixUnitaire = Decimal.max(prixAvecOptions, prixMin);
  const prixUnitaireCents = decimalToCentsBigInt(prixUnitaire);
  etapes.push({ libelle: "Prix unitaire", valeur: `${prixUnitaireCents.toString()} c` });

  const totalAvantPalier = centsToDecimal(prixUnitaireCents).mul(e.quantite);
  etapes.push({ libelle: "Quantité", valeur: `×${e.quantite}` });

  const { total, etape } = appliquerPalier(totalAvantPalier, e.palier);
  if (etape) etapes.push(etape);

  return {
    mode: "QUANTITE",
    etapes,
    prixUnitaireCents,
    totalCents: decimalToCentsBigInt(total),
  };
}

function calculerForfait(e: EntreeCalculForfait): ResultatCalcul {
  const prixUnitaire = centsToDecimal(e.prixBaseCents);
  const total = prixUnitaire.mul(e.quantite);
  return {
    mode: "FORFAIT",
    etapes: [
      { libelle: "Prix forfaitaire", valeur: `${prixUnitaire.toFixed(0)} c` },
      { libelle: "Quantité", valeur: `×${e.quantite}` },
    ],
    prixUnitaireCents: e.prixBaseCents,
    totalCents: decimalToCentsBigInt(total),
  };
}

/**
 * Point d'entrée unique. SUR_DEVIS n'a pas de calcul automatique : la commande
 * part en DEVIS_DEMANDE et un commercial chiffre à la main (plan §4.1c).
 */
export function calculerPrix(entree: EntreeCalcul): ResultatCalcul {
  switch (entree.mode) {
    case "SURFACE":
      return calculerSurface(entree);
    case "QUANTITE":
      return calculerQuantite(entree);
    case "FORFAIT":
      return calculerForfait(entree);
  }
}
