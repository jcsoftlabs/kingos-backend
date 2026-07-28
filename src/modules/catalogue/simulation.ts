import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { calculerPrix, type OptionChoisie } from "./tarification.js";

export const schemaSimulation = z.object({
  serviceSlug: z.string(),
  quantite: z.number().int().positive(),
  largeurPouces: z.number().positive().optional(),
  hauteurPouces: z.number().positive().optional(),
  optionsChoisies: z.record(z.string(), z.string()).default({}), // { cle: valeur }
});

export type EntreeSimulation = z.infer<typeof schemaSimulation>;

/**
 * Simulation de prix — appelée par le configurateur public en debounce (plan §4.4).
 * Seule source de vérité : aucun calcul de prix ne doit exister côté navigateur.
 */
export async function simulerPrix(entree: EntreeSimulation) {
  const { resultat } = await simulerPrixAvecService(entree);
  return resultat;
}

/**
 * Variante utilisée par le module commandes : renvoie aussi le service chargé,
 * pour construire une LigneCommande (nom figé, surface, etc.) sans recharger
 * deux fois le catalogue.
 */
export async function simulerPrixAvecService(entree: EntreeSimulation) {
  const service = await db.service.findUnique({
    where: { slug: entree.serviceSlug },
    include: { attributs: { include: { options: true } }, paliers: { orderBy: { quantiteMin: "asc" } } },
  });
  if (!service || !service.visible) throw new ErreurNonTrouve("Service", entree.serviceSlug);

  const options: OptionChoisie[] = [];
  for (const attribut of service.attributs) {
    const valeurChoisie = entree.optionsChoisies[attribut.cle];
    if (!valeurChoisie) {
      if (attribut.obligatoire && attribut.type === "CHOIX") {
        throw new ErreurValidation(`L'attribut « ${attribut.libelle} » est obligatoire`);
      }
      continue;
    }
    const option = attribut.options.find((o) => o.valeur === valeurChoisie);
    if (!option) throw new ErreurValidation(`Option invalide pour « ${attribut.libelle} »`);
    options.push({
      cle: attribut.cle,
      valeur: option.valeur,
      libelle: option.libelle,
      coefficient: option.coefficient?.toString() ?? null,
      supplementCents: option.supplementCents,
      supplementParUniteCents: option.supplementParUniteCents,
    });
  }

  const palier =
    service.paliers.find(
      (p) => entree.quantite >= p.quantiteMin && (p.quantiteMax === null || entree.quantite <= p.quantiteMax),
    ) ?? null;

  if (service.mode === "SURFACE") {
    if (!entree.largeurPouces || !entree.hauteurPouces) {
      throw new ErreurValidation("Largeur et hauteur requises pour ce service");
    }
    const resultat = calculerPrix({
      mode: "SURFACE",
      largeurPouces: entree.largeurPouces,
      hauteurPouces: entree.hauteurPouces,
      quantite: entree.quantite,
      prixBaseCents: service.prixBaseCents,
      prixMinCents: service.prixMinCents,
      surfaceMinFt2: service.surfaceMinFt2?.toString() ?? null,
      options,
      palier: palier
        ? {
            quantiteMin: palier.quantiteMin,
            quantiteMax: palier.quantiteMax,
            remisePct: palier.remisePct?.toString() ?? null,
            prixUnitaireCents: palier.prixUnitaireCents,
          }
        : null,
    });
    const surfaceFt2 = (entree.largeurPouces * entree.hauteurPouces) / 144;
    return { service, resultat, surfaceFt2 };
  }

  if (service.mode === "QUANTITE") {
    const resultat = calculerPrix({
      mode: "QUANTITE",
      quantite: entree.quantite,
      prixBaseCents: service.prixBaseCents,
      prixMinCents: service.prixMinCents,
      options,
      palier: palier
        ? {
            quantiteMin: palier.quantiteMin,
            quantiteMax: palier.quantiteMax,
            remisePct: palier.remisePct?.toString() ?? null,
            prixUnitaireCents: palier.prixUnitaireCents,
          }
        : null,
    });
    return { service, resultat, surfaceFt2: null };
  }

  if (service.mode === "FORFAIT") {
    const resultat = calculerPrix({ mode: "FORFAIT", quantite: entree.quantite, prixBaseCents: service.prixBaseCents });
    return { service, resultat, surfaceFt2: null };
  }

  // SUR_DEVIS : aucun calcul automatique — le client doit demander un devis manuel.
  throw new ErreurValidation(
    "Ce service ne peut pas être chiffré automatiquement — demandez un devis, un commercial vous répondra.",
  );
}
