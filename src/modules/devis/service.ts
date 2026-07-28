import { db } from "../../core/db.js";
import { ErreurConflit, ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { verifierTransition } from "../commandes/machine-etats.js";

const VALIDITE_JOURS_DEFAUT = 15;

/**
 * Génère un devis depuis une commande — instantané complet dans `contenu`
 * (plan §7.1) : émetteur, client, lignes, totaux, conditions, coordonnées
 * bancaires. Un devis émis reste explicable même si le catalogue change
 * ensuite, puisqu'il ne relit jamais le catalogue une fois créé.
 */
export async function genererDevisDepuisCommande(commandeId: string) {
  const commande = await db.commande.findUnique({
    where: { id: commandeId },
    include: { lignes: true },
  });
  if (!commande) throw new ErreurNonTrouve("Commande", commandeId);
  if (commande.lignes.length === 0) throw new ErreurValidation("La commande n'a aucune ligne à chiffrer");

  const devisExistant = await db.devis.findFirst({
    where: { commandeId, statut: { notIn: ["ANNULE", "EXPIRE", "REFUSE"] } },
  });
  if (devisExistant) throw new ErreurConflit(`Un devis actif existe déjà pour cette commande (${devisExistant.numero})`);

  const parametres = await db.parametresEntreprise.findUnique({ where: { id: 1 } });
  if (!parametres) throw new ErreurValidation("Paramètres entreprise non configurés — voir /admin/parametres");

  const sousTotalCents = commande.lignes.reduce((acc, l) => acc + l.totalCents, 0n);
  const taxeTauxPct = parametres.tauxTaxePct;
  const taxeCents = (sousTotalCents * BigInt(Math.round(Number(taxeTauxPct) * 100))) / 10000n;
  const totalCents = sousTotalCents + taxeCents + commande.fraisLivraisonCents - commande.remiseCents;

  const expireLe = new Date();
  expireLe.setUTCDate(expireLe.getUTCDate() + VALIDITE_JOURS_DEFAUT);

  const contenu = {
    emetteur: {
      raisonSociale: parametres.raisonSociale,
      adresse: parametres.adresse,
      ville: parametres.ville,
      telephone: parametres.telephone,
      email: parametres.email,
      nif: parametres.nif,
      banques: parametres.banques,
      moncashNumero: parametres.moncashNumero,
    },
    client: {
      nom: commande.nomContact,
      email: commande.emailContact,
      telephone: commande.telContact,
      entreprise: commande.entreprise,
    },
    lignes: commande.lignes.map((l) => ({
      serviceNom: l.serviceNom,
      specifications: l.specifications,
      quantite: l.quantite,
      prixUnitaireCents: l.prixUnitaireCents.toString(),
      totalCents: l.totalCents.toString(),
    })),
    sousTotalCents: sousTotalCents.toString(),
    remiseCents: commande.remiseCents.toString(),
    fraisLivraisonCents: commande.fraisLivraisonCents.toString(),
    taxeTauxPct: taxeTauxPct.toString(),
    taxeCents: taxeCents.toString(),
    totalCents: totalCents.toString(),
    conditions: parametres.conditionsDevis,
  };

  verifierTransition(commande.statut, "DEVIS_ENVOYE");

  return db.$transaction(async (tx) => {
    const numero = await prochainNumero("DEV");

    const devis = await tx.devis.create({
      data: {
        numero,
        commandeId,
        statut: "ENVOYE",
        contenu,
        sousTotalCents,
        remiseCents: commande.remiseCents,
        taxeTauxPct,
        taxeCents,
        totalCents,
        validiteJours: VALIDITE_JOURS_DEFAUT,
        expireLe,
        envoyeLe: new Date(),
      },
    });

    await tx.commande.update({ where: { id: commandeId }, data: { statut: "DEVIS_ENVOYE" } });

    await tx.evenementCommande.create({
      data: {
        commandeId,
        type: "DEVIS_ENVOYE",
        ancienStatut: commande.statut,
        nouveauStatut: "DEVIS_ENVOYE",
        message: `Devis ${numero} généré`,
      },
    });

    return devis;
  });
}

export async function obtenirDevisParNumero(numero: string) {
  const devis = await db.devis.findUnique({ where: { numero } });
  if (!devis) throw new ErreurNonTrouve("Devis", numero);
  return devis;
}
