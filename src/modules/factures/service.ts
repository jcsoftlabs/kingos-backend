import { db } from "../../core/db.js";
import { ErreurConflit, ErreurNonTrouve } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { verifierTransition } from "../commandes/machine-etats.js";

/**
 * Conversion devis → facture « en un clic » (plan §7.3). Idempotente au sens
 * métier : `Devis.factureId` est unique en base, donc une seconde tentative
 * sur le même devis échoue proprement plutôt que de produire une deuxième
 * facture pour la même commande.
 */
export async function convertirDevisEnFacture(devisId: string) {
  return db.$transaction(async (tx) => {
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

    return facture;
  });
}

export async function obtenirFactureParNumero(numero: string) {
  const facture = await db.facture.findUnique({ where: { numero } });
  if (!facture) throw new ErreurNonTrouve("Facture", numero);
  return facture;
}
