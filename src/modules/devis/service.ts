import { db } from "../../core/db.js";
import { ErreurConflit, ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { verifierTransition } from "../commandes/machine-etats.js";
import { envoyerDevisEmis } from "../../core/email.js";
import { formaterHTG, formaterDate } from "../../core/formatage.js";
import { genererBufferPdfDevis } from "../documents/service.js";

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
      tauxChangeUSD: parametres.tauxChangeUSD?.toString() ?? null,
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

  const devis = await db.$transaction(async (tx) => {
    const numero = await prochainNumero("DEV");

    const devisCree = await tx.devis.create({
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

    return devisCree;
  });

  // Le PDF est généré ici, dans le même flux, plutôt que différé au premier
  // clic sur "télécharger" — le client reçoit immédiatement le document
  // formel en pièce jointe, pas juste un lien à suivre plus tard.
  const pdf = await genererBufferPdfDevis(devis.id).catch(() => undefined);

  await envoyerDevisEmis({
    destinataire: commande.emailContact,
    numero: devis.numero,
    nomContact: commande.nomContact,
    totalFormate: formaterHTG(devis.totalCents),
    expireLe: formaterDate(devis.expireLe),
    pdf,
  });

  return devis;
}

export async function obtenirDevisParNumero(numero: string) {
  const devis = await db.devis.findUnique({ where: { numero } });
  if (!devis) throw new ErreurNonTrouve("Devis", numero);
  return devis;
}

/**
 * Acceptation/refus par le client (plan §7.5). Un devis expiré ne peut plus
 * être accepté — la validité affichée sur le PDF doit rester vraie.
 */
export async function accepterDevis(devisId: string) {
  return db.$transaction(async (tx) => {
    const devis = await tx.devis.findUnique({ where: { id: devisId }, include: { commande: true } });
    if (!devis) throw new ErreurNonTrouve("Devis", devisId);
    if (devis.statut !== "ENVOYE") throw new ErreurConflit(`Devis ${devis.numero} n'est pas en attente d'acceptation`);
    if (devis.expireLe < new Date()) {
      await tx.devis.update({ where: { id: devisId }, data: { statut: "EXPIRE" } });
      throw new ErreurConflit(`Devis ${devis.numero} a expiré le ${devis.expireLe.toISOString().slice(0, 10)}`);
    }

    verifierTransition(devis.commande.statut, "DEVIS_ACCEPTE");

    const misAJour = await tx.devis.update({
      where: { id: devisId },
      data: { statut: "ACCEPTE", accepteLe: new Date() },
    });

    await tx.commande.update({ where: { id: devis.commandeId }, data: { statut: "DEVIS_ACCEPTE" } });
    await tx.evenementCommande.create({
      data: {
        commandeId: devis.commandeId,
        type: "DEVIS_ACCEPTE",
        ancienStatut: devis.commande.statut,
        nouveauStatut: "DEVIS_ACCEPTE",
        message: `Devis ${devis.numero} accepté par le client`,
      },
    });

    return misAJour;
  });
}

export async function refuserDevis(devisId: string, motif?: string) {
  return db.$transaction(async (tx) => {
    const devis = await tx.devis.findUnique({ where: { id: devisId }, include: { commande: true } });
    if (!devis) throw new ErreurNonTrouve("Devis", devisId);
    if (devis.statut !== "ENVOYE") throw new ErreurConflit(`Devis ${devis.numero} n'est pas en attente d'une réponse`);

    verifierTransition(devis.commande.statut, "DEVIS_REFUSE");

    const misAJour = await tx.devis.update({
      where: { id: devisId },
      data: { statut: "REFUSE", refuseLe: new Date(), motifRefus: motif },
    });

    await tx.commande.update({ where: { id: devis.commandeId }, data: { statut: "DEVIS_REFUSE" } });
    await tx.evenementCommande.create({
      data: {
        commandeId: devis.commandeId,
        type: "DEVIS_REFUSE",
        ancienStatut: devis.commande.statut,
        nouveauStatut: "DEVIS_REFUSE",
        message: motif ? `Devis ${devis.numero} refusé — ${motif}` : `Devis ${devis.numero} refusé`,
      },
    });

    return misAJour;
  });
}
