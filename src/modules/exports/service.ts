import { db } from "../../core/db.js";

/** Échappement CSV minimal — RFC 4180 : guillemets doublés, champ entre guillemets si nécessaire. */
function champCsv(valeur: unknown): string {
  const texte = valeur === null || valeur === undefined ? "" : String(valeur);
  if (/[",\n]/.test(texte)) return `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

function ligneCsv(champs: unknown[]): string {
  return champs.map(champCsv).join(",") + "\r\n";
}

function centimesEnGourdes(cents: bigint | number): string {
  return (Number(cents) / 100).toFixed(2);
}

/**
 * Export comptable des factures (plan — demandé par le propriétaire pour la
 * familiarisation du système). Un centime affiché en gourdes décimales, pas
 * en centimes bruts : c'est ce qu'un comptable colle directement dans un tableur.
 */
export async function exporterFacturesCsv(): Promise<string> {
  const factures = await db.facture.findMany({
    orderBy: { creeLe: "asc" },
    include: { commande: { select: { numero: true, nomContact: true, entreprise: true, emailContact: true, typeClient: true } } },
  });

  let csv = ligneCsv([
    "Numéro facture", "Numéro commande", "Client", "Type client", "E-mail", "Statut",
    "Sous-total (HTG)", "Remise (HTG)", "Taxe (HTG)", "Total (HTG)", "Payé (HTG)", "Solde (HTG)",
    "Émise le", "Échéance", "Payée le",
  ]);

  for (const f of factures) {
    csv += ligneCsv([
      f.numero,
      f.commande.numero,
      f.commande.entreprise || f.commande.nomContact,
      f.commande.typeClient,
      f.commande.emailContact,
      f.statut,
      centimesEnGourdes(f.sousTotalCents),
      centimesEnGourdes(f.remiseCents),
      centimesEnGourdes(f.taxeCents),
      centimesEnGourdes(f.totalCents),
      centimesEnGourdes(f.payeCents),
      centimesEnGourdes(f.totalCents - f.payeCents),
      f.envoyeeLe?.toISOString().slice(0, 10) ?? "",
      f.echeanceLe?.toISOString().slice(0, 10) ?? "",
      f.payeeLe?.toISOString().slice(0, 10) ?? "",
    ]);
  }

  return csv;
}

export async function exporterPaiementsCsv(): Promise<string> {
  const paiements = await db.paiement.findMany({
    orderBy: { creeLe: "asc" },
    include: {
      commande: { select: { numero: true, nomContact: true, entreprise: true } },
      facture: { select: { numero: true } },
    },
  });

  // saisiParId n'est pas une relation Prisma déclarée (comme LigneCommande.serviceId) —
  // jointure manuelle plutôt qu'un `include` impossible.
  const idsSaisisPar = [...new Set(paiements.map((p) => p.saisiParId).filter((id): id is string => !!id))];
  const utilisateurs = idsSaisisPar.length
    ? await db.utilisateur.findMany({ where: { id: { in: idsSaisisPar } }, select: { id: true, email: true } })
    : [];
  const emailParId = new Map(utilisateurs.map((u) => [u.id, u.email]));

  let csv = ligneCsv([
    "Date", "Facture", "Commande", "Client", "Moyen", "Statut",
    "Montant (HTG)", "N° chèque", "Banque émettrice", "Saisi par", "Confirmé le",
  ]);

  for (const p of paiements) {
    csv += ligneCsv([
      p.creeLe.toISOString().slice(0, 10),
      p.facture?.numero ?? "",
      p.commande.numero,
      p.commande.entreprise || p.commande.nomContact,
      p.fournisseur,
      p.statut,
      centimesEnGourdes(p.montantCents),
      p.numeroCheque ?? "",
      p.banqueEmettrice ?? "",
      p.saisiParId ? (emailParId.get(p.saisiParId) ?? "(compte supprimé)") : "",
      p.confirmeLe?.toISOString().slice(0, 10) ?? "",
    ]);
  }

  return csv;
}
