import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurConflit, ErreurNonTrouve } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { verifierTransition } from "../commandes/machine-etats.js";
import { envoyerFactureEmise } from "../../core/email.js";
import { formaterHTG } from "../../core/formatage.js";
import { genererBufferPdfFacture } from "../documents/service.js";

/**
 * Conversion devis → facture « en un clic » (plan §7.3). Idempotente au sens
 * métier : `Devis.factureId` est unique en base, donc une seconde tentative
 * sur le même devis échoue proprement plutôt que de produire une deuxième
 * facture pour la même commande.
 *
 * @param echeanceLe échéance de paiement — par défaut aucune (paiement à
 * réception), mais le staff peut en fixer une explicitement (ex. client
 * institutionnel avec un délai de règlement contractuel de 30/60 jours).
 */
export async function convertirDevisEnFacture(devisId: string, auteurId?: string, echeanceLe?: Date) {
  const resultat = await db.$transaction(async (tx) => {
    const devis = await tx.devis.findUnique({ where: { id: devisId }, include: { commande: true } });
    if (!devis) throw new ErreurNonTrouve("Devis", devisId);
    if (devis.statut !== "ACCEPTE") {
      throw new ErreurConflit(`Devis ${devis.numero} doit être accepté avant conversion (statut actuel : ${devis.statut})`);
    }
    if (devis.factureId) {
      const factureExistante = await tx.facture.findUnique({ where: { id: devis.factureId } });
      throw new ErreurConflit(`Devis ${devis.numero} déjà converti en facture ${factureExistante?.numero ?? devis.factureId}`);
    }

    verifierTransition(devis.commande.statut, "EN_ATTENTE_PAIEMENT");

    const numero = await prochainNumero("FAC");

    const facture = await tx.facture.create({
      data: {
        numero,
        commandeId: devis.commandeId,
        devisOrigineId: devis.id,
        statut: "EMISE",
        contenu: devis.contenu as object,
        sousTotalCents: devis.sousTotalCents,
        remiseCents: devis.remiseCents,
        taxeTauxPct: devis.taxeTauxPct,
        taxeCents: devis.taxeCents,
        totalCents: devis.totalCents,
        devise: devis.devise,
        echeanceLe,
        envoyeeLe: new Date(),
      },
    });

    await tx.devis.update({ where: { id: devisId }, data: { factureId: facture.id } });
    await tx.commande.update({ where: { id: devis.commandeId }, data: { statut: "EN_ATTENTE_PAIEMENT" } });

    await tx.evenementCommande.create({
      data: {
        commandeId: devis.commandeId,
        type: "FACTURE_EMISE",
        ancienStatut: devis.commande.statut,
        nouveauStatut: "EN_ATTENTE_PAIEMENT",
        message: `Facture ${numero} émise depuis le devis ${devis.numero}`,
      },
    });

    await tx.journalAudit.create({
      data: {
        acteurId: auteurId,
        action: "FACTURE_EMISE",
        entite: "Facture",
        entiteId: facture.id,
        apres: { numero: facture.numero, totalCents: facture.totalCents.toString(), echeanceLe },
      },
    });

    return { facture, commande: devis.commande };
  });

  const pdf = await genererBufferPdfFacture(resultat.facture.id).catch(() => undefined);

  await envoyerFactureEmise({
    destinataire: resultat.commande.emailContact,
    numero: resultat.facture.numero,
    nomContact: resultat.commande.nomContact,
    totalFormate: formaterHTG(resultat.facture.totalCents),
    pdf,
  });

  return resultat.facture;
}

export async function obtenirFactureParNumero(numero: string) {
  const facture = await db.facture.findUnique({ where: { numero } });
  if (!facture) throw new ErreurNonTrouve("Facture", numero);
  return facture;
}

export const schemaModificationEcheance = z.object({
  echeanceLe: z.coerce.date().nullable(),
});

/** Fixe ou efface manuellement l'échéance d'une facture émise. */
export async function modifierEcheanceFacture(factureId: string, echeanceLe: Date | null, auteurId: string) {
  const avant = await db.facture.findUniqueOrThrow({ where: { id: factureId } });

  const [facture] = await db.$transaction([
    // Invalide le PDF déjà généré (voir paiements/service.ts pour le même
    // principe côté PAYÉ) : sinon un changement d'échéance après coup reste
    // invisible tant que personne ne re-déclenche une régénération.
    db.facture.update({ where: { id: factureId }, data: { echeanceLe, pdfPublicId: null } }),
    db.journalAudit.create({
      data: {
        acteurId: auteurId,
        action: "FACTURE_ECHEANCE_MODIFIEE",
        entite: "Facture",
        entiteId: factureId,
        avant: { echeanceLe: avant.echeanceLe },
        apres: { echeanceLe },
      },
    }),
  ]);

  return facture;
}
