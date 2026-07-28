import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurConflit, ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { verifierTransition } from "../commandes/machine-etats.js";
import { envoyerPaiementConfirme } from "../../core/email.js";
import { formaterHTG } from "../../core/formatage.js";
import { genererBufferPdfFacture } from "../documents/service.js";

/** Hors transaction — récupère commande + facture pour la confirmation par e-mail. */
async function notifierPaiementConfirme(commandeId: string, factureId: string, montantCents: bigint) {
  const [commande, facture] = await Promise.all([
    db.commande.findUnique({ where: { id: commandeId } }),
    db.facture.findUnique({ where: { id: factureId } }),
  ]);
  if (!commande || !facture) return;
  // Facture intégralement payée : le client reçoit le PDF tamponné "PAYÉ" en
  // pièce jointe, pas seulement un e-mail de confirmation sans justificatif.
  const pdf = facture.statut === "PAYEE" ? await genererBufferPdfFacture(facture.id) : undefined;
  await envoyerPaiementConfirme({
    destinataire: commande.emailContact,
    numeroFacture: facture.numero,
    nomContact: commande.nomContact,
    montantFormate: formaterHTG(montantCents),
    pdf,
  });
}

export const schemaPaiementManuel = z.object({
  factureId: z.string().uuid(),
  fournisseur: z.enum(["ESPECES", "VIREMENT", "CHEQUE"]),
  montantCents: z.coerce.bigint().positive(),
  banqueEmettrice: z.string().optional(),
  numeroCheque: z.string().optional(),
  dateCheque: z.coerce.date().optional(),
  dateEncaissementPrevue: z.coerce.date().optional(),
  saisiParId: z.string().uuid().optional(),
});

export type EntreePaiementManuel = z.infer<typeof schemaPaiementManuel>;

/**
 * Recalcule le statut d'une facture depuis la somme de ses paiements REUSSI —
 * jamais incrémenté à la main (plan §2.1 règle 5, §8.6). Un chèque en
 * A_ENCAISSER ne compte pas tant qu'il n'est pas confirmé.
 */
async function recalculerFacture(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], factureId: string) {
  const facture = await tx.facture.findUniqueOrThrow({ where: { id: factureId } });
  const paiements = await tx.paiement.findMany({ where: { factureId, statut: "REUSSI" } });
  const payeCents = paiements.reduce((acc, p) => acc + p.montantCents, 0n);

  const statut = payeCents >= facture.totalCents ? "PAYEE" : payeCents > 0n ? "PARTIELLEMENT_PAYEE" : "EMISE";
  // Le PDF déjà généré (avant paiement complet) ne porte pas le tampon PAYÉ —
  // on invalide le cache Cloudinary pour qu'il soit régénéré avec le tampon
  // au prochain téléchargement (voir modules/documents/pdf.ts).
  const nouvellementPayee = statut === "PAYEE" && facture.statut !== "PAYEE";

  const misAJour = await tx.facture.update({
    where: { id: factureId },
    data: {
      payeCents,
      statut,
      payeeLe: statut === "PAYEE" ? new Date() : facture.payeeLe,
      ...(nouvellementPayee ? { pdfPublicId: null } : {}),
    },
  });

  if (statut === "PAYEE") {
    const commande = await tx.commande.findUniqueOrThrow({ where: { id: facture.commandeId } });
    if (commande.statut !== "PAYEE") {
      verifierTransition(commande.statut, "PAYEE");
      await tx.commande.update({ where: { id: facture.commandeId }, data: { statut: "PAYEE" } });
      await tx.evenementCommande.create({
        data: {
          commandeId: facture.commandeId,
          type: "COMMANDE_PAYEE",
          ancienStatut: commande.statut,
          nouveauStatut: "PAYEE",
          message: `Facture ${facture.numero} intégralement payée`,
        },
      });
    }
  }

  return misAJour;
}

/**
 * Enregistrement d'un encaissement hors ligne (plan §8.4). Espèces et
 * virement créditent immédiatement ; un chèque part en A_ENCAISSER — ce
 * n'est PAS un paiement tant qu'il n'est pas confirmé, et ne doit jamais
 * faire passer une facture à PAYEE tout seul.
 */
export async function enregistrerPaiementManuel(entree: EntreePaiementManuel) {
  const paiement = await db.$transaction(async (tx) => {
    const facture = await tx.facture.findUnique({ where: { id: entree.factureId } });
    if (!facture) throw new ErreurNonTrouve("Facture", entree.factureId);
    if (facture.statut === "ANNULEE") throw new ErreurConflit(`Facture ${facture.numero} est annulée`);
    if (facture.statut === "PAYEE") throw new ErreurConflit(`Facture ${facture.numero} est déjà intégralement payée`);

    const soldeRestant = facture.totalCents - facture.payeCents;
    if (entree.montantCents > soldeRestant) {
      throw new ErreurValidation(
        `Montant (${entree.montantCents}) supérieur au solde restant (${soldeRestant}) sur la facture ${facture.numero}`,
      );
    }

    if (entree.fournisseur === "CHEQUE" && !entree.numeroCheque) {
      throw new ErreurValidation("Le numéro de chèque est requis");
    }

    const reference = `PAY-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const estImmediat = entree.fournisseur !== "CHEQUE";

    const intention = await tx.intentionPaiement.create({
      data: {
        reference,
        commandeId: facture.commandeId,
        factureId: facture.id,
        fournisseur: entree.fournisseur,
        montantCents: entree.montantCents,
        statut: estImmediat ? "REUSSI" : "A_ENCAISSER",
        cleIdempotence: randomUUID(),
        expireLe: entree.dateEncaissementPrevue ?? new Date(),
      },
    });

    const paiement = await tx.paiement.create({
      data: {
        intentionId: intention.id,
        commandeId: facture.commandeId,
        factureId: facture.id,
        fournisseur: entree.fournisseur,
        statut: estImmediat ? "REUSSI" : "A_ENCAISSER",
        montantCents: entree.montantCents,
        refFournisseur: reference,
        banqueEmettrice: entree.banqueEmettrice,
        numeroCheque: entree.numeroCheque,
        dateCheque: entree.dateCheque,
        dateEncaissementPrevue: entree.dateEncaissementPrevue,
        saisiParId: entree.saisiParId,
        confirmeLe: estImmediat ? new Date() : null,
      },
    });

    await tx.evenementCommande.create({
      data: {
        commandeId: facture.commandeId,
        type: "PAIEMENT_ENREGISTRE",
        message: estImmediat
          ? `Paiement ${entree.fournisseur} de ${entree.montantCents} c reçu sur la facture ${facture.numero}`
          : `Chèque n°${entree.numeroCheque} de ${entree.montantCents} c reçu sur la facture ${facture.numero}, en attente d'encaissement`,
      },
    });

    if (estImmediat) {
      await recalculerFacture(tx, facture.id);
    }

    return paiement;
  });

  if (paiement.statut === "REUSSI") {
    await notifierPaiementConfirme(paiement.commandeId, entree.factureId, paiement.montantCents);
  }

  return paiement;
}

export async function encaisserCheque(paiementId: string, valideParId?: string) {
  const { facture, paiement } = await db.$transaction(async (tx) => {
    const paiementTrouve = await tx.paiement.findUnique({ where: { id: paiementId } });
    if (!paiementTrouve) throw new ErreurNonTrouve("Paiement", paiementId);
    if (paiementTrouve.statut !== "A_ENCAISSER") throw new ErreurConflit(`Paiement ${paiementTrouve.refFournisseur} n'est pas en attente d'encaissement`);
    if (!paiementTrouve.factureId) throw new ErreurValidation("Paiement sans facture associée");

    await tx.paiement.update({
      where: { id: paiementId },
      data: { statut: "REUSSI", confirmeLe: new Date(), valideParId },
    });

    await tx.evenementCommande.create({
      data: {
        commandeId: paiementTrouve.commandeId,
        type: "CHEQUE_ENCAISSE",
        message: `Chèque n°${paiementTrouve.numeroCheque} encaissé`,
      },
    });

    const factureMiseAJour = await recalculerFacture(tx, paiementTrouve.factureId);
    return { facture: factureMiseAJour, paiement: paiementTrouve };
  });

  await notifierPaiementConfirme(paiement.commandeId, facture.id, paiement.montantCents);

  return facture;
}

export async function rejeterCheque(paiementId: string, motif: string) {
  return db.$transaction(async (tx) => {
    const paiement = await tx.paiement.findUnique({ where: { id: paiementId } });
    if (!paiement) throw new ErreurNonTrouve("Paiement", paiementId);
    if (paiement.statut !== "A_ENCAISSER") throw new ErreurConflit(`Paiement ${paiement.refFournisseur} n'est pas en attente d'encaissement`);

    const misAJour = await tx.paiement.update({
      where: { id: paiementId },
      data: { statut: "REJETE", motifRejet: motif },
    });

    await tx.evenementCommande.create({
      data: {
        commandeId: paiement.commandeId,
        type: "CHEQUE_REJETE",
        message: `Chèque n°${paiement.numeroCheque} rejeté — ${motif}`,
      },
    });

    return misAJour;
  });
}
