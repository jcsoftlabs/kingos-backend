import { db } from "../../core/db.js";

/** Statuts qui ne représentent pas de l'activité réelle (exclus des agrégats). */
const STATUTS_MORTS = ["ANNULEE", "BROUILLON"] as const;

function debutDuMois(decalageMois = 0): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - decalageMois);
  return d;
}

/**
 * Agrégats du tableau de bord (plan §10.2). Tout est calculé en base plutôt
 * qu'en mémoire : le back-office doit rester lisible avec plusieurs milliers
 * de commandes, pas seulement sur le jeu de démonstration.
 */
export async function calculerTableauDeBord() {
  const debutMoisCourant = debutDuMois(0);
  const debutMoisPrecedent = debutDuMois(1);
  const debutFenetre12Mois = debutDuMois(11);
  const ilYA30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    commandesParStatut,
    devisEnAttente,
    devisEnvoyes,
    devisAcceptes,
    facturesImpayees,
    facturesImpayeesDetail,
    chequesEnAttente,
    facturesPayees12Mois,
    lignesParService,
    commandes30j,
    clients30j,
    evenementsRecents,
  ] = await Promise.all([
    db.commande.groupBy({ by: ["statut"], _count: { _all: true } }),
    db.devis.count({ where: { statut: "ENVOYE", expireLe: { gt: new Date() } } }),
    db.devis.count({ where: { statut: { in: ["ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"] } } }),
    db.devis.count({ where: { statut: "ACCEPTE" } }),
    db.facture.count({ where: { statut: { in: ["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] } } }),
    // Détail plutôt qu'un simple _sum : le total de l'impayé ne dit pas s'il
    // s'agit de factures récentes (normal) ou de créances qui traînent —
    // c'est l'ancienneté qui distingue les deux (balance âgée ci-dessous).
    db.facture.findMany({
      where: { statut: { in: ["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] } },
      select: { totalCents: true, payeCents: true, envoyeeLe: true, creeLe: true, echeanceLe: true },
    }),
    // Encaissé sur le papier, pas encore en banque — ni dans le CA, ni dans
    // l'impayé, donc invisible partout ailleurs sur ce tableau de bord.
    db.paiement.aggregate({
      where: { statut: "A_ENCAISSER" },
      _sum: { montantCents: true },
      _count: { _all: true },
    }),
    // Sert à la fois au CA du mois, au mois précédent et à la courbe 12 mois.
    db.facture.findMany({
      where: { statut: "PAYEE", payeeLe: { gte: debutFenetre12Mois } },
      select: { totalCents: true, payeeLe: true },
    }),
    db.ligneCommande.groupBy({
      by: ["serviceNom"],
      where: { commande: { statut: { notIn: [...STATUTS_MORTS] } } },
      _sum: { totalCents: true, quantite: true },
      _count: { _all: true },
    }),
    db.commande.findMany({
      where: { creeLe: { gte: ilYA30Jours }, statut: { notIn: [...STATUTS_MORTS] } },
      select: { totalCents: true },
    }),
    // Un « nouveau client » = un e-mail de contact vu pour la première fois.
    db.commande.findMany({
      where: { creeLe: { gte: ilYA30Jours } },
      select: { emailContact: true, creeLe: true },
    }),
    db.evenementCommande.findMany({
      orderBy: { creeLe: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        message: true,
        creeLe: true,
        nouveauStatut: true,
        commande: { select: { numero: true, nomContact: true } },
      },
    }),
  ]);

  // ─── CA par mois (12 derniers) ───
  const parMois = new Map<string, bigint>();
  for (let i = 11; i >= 0; i--) {
    const d = debutDuMois(i);
    parMois.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, 0n);
  }
  for (const f of facturesPayees12Mois) {
    if (!f.payeeLe) continue;
    const cle = `${f.payeeLe.getUTCFullYear()}-${String(f.payeeLe.getUTCMonth() + 1).padStart(2, "0")}`;
    if (parMois.has(cle)) parMois.set(cle, (parMois.get(cle) ?? 0n) + f.totalCents);
  }

  const caDuMois = facturesPayees12Mois
    .filter((f) => f.payeeLe && f.payeeLe >= debutMoisCourant)
    .reduce((acc, f) => acc + f.totalCents, 0n);
  const caMoisPrecedent = facturesPayees12Mois
    .filter((f) => f.payeeLe && f.payeeLe >= debutMoisPrecedent && f.payeeLe < debutMoisCourant)
    .reduce((acc, f) => acc + f.totalCents, 0n);

  // ─── Nouveaux clients sur 30 jours ───
  const premieresCommandes = new Set(clients30j.map((c) => c.emailContact));
  const dejaConnus = await db.commande.findMany({
    where: { emailContact: { in: [...premieresCommandes] }, creeLe: { lt: ilYA30Jours } },
    select: { emailContact: true },
    distinct: ["emailContact"],
  });
  const emailsConnus = new Set(dejaConnus.map((c) => c.emailContact));
  const nouveauxClients = [...premieresCommandes].filter((e) => !emailsConnus.has(e)).length;

  // ─── Panier moyen sur 30 jours ───
  const totalCommandes30j = commandes30j.reduce((acc, c) => acc + c.totalCents, 0n);
  const panierMoyenCents =
    commandes30j.length > 0 ? totalCommandes30j / BigInt(commandes30j.length) : 0n;

  const services = lignesParService
    .map((l) => ({
      serviceNom: l.serviceNom,
      caCents: l._sum.totalCents ?? 0n,
      quantite: l._sum.quantite ?? 0,
      commandes: l._count._all,
    }))
    .sort((a, b) => (b.caCents > a.caCents ? 1 : b.caCents < a.caCents ? -1 : 0));

  // ─── Balance âgée de l'impayé ───
  // Ancienneté comptée depuis l'émission de la facture (envoyeeLe, sinon
  // creeLe qui existe toujours). `enRetard` compte à part les factures dont
  // l'échéance convenue est dépassée — une facture de 70 jours avec 90 jours
  // d'échéance négociée n'est pas en retard, seulement ancienne.
  const maintenant = Date.now();
  const JOUR_MS = 24 * 60 * 60 * 1000;
  const anciennete = { recentCents: 0n, moyenCents: 0n, ancienCents: 0n, nbEnRetard: 0, montantEnRetardCents: 0n };

  for (const f of facturesImpayeesDetail) {
    const restant = f.totalCents - f.payeCents;
    if (restant <= 0n) continue;

    const jours = Math.floor((maintenant - (f.envoyeeLe ?? f.creeLe).getTime()) / JOUR_MS);
    if (jours <= 30) anciennete.recentCents += restant;
    else if (jours <= 60) anciennete.moyenCents += restant;
    else anciennete.ancienCents += restant;

    if (f.echeanceLe && f.echeanceLe.getTime() < maintenant) {
      anciennete.nbEnRetard++;
      anciennete.montantEnRetardCents += restant;
    }
  }

  const totalImpaye = anciennete.recentCents + anciennete.moyenCents + anciennete.ancienCents;

  return {
    commandesParStatut: commandesParStatut.map((c) => ({ statut: c.statut, total: c._count._all })),
    devisEnAttente,
    facturesImpayees,
    caDuMoisCents: caDuMois,
    caMoisPrecedentCents: caMoisPrecedent,
    montantImpayeCents: totalImpaye,
    anciennetteImpaye: {
      recentCents: anciennete.recentCents,
      moyenCents: anciennete.moyenCents,
      ancienCents: anciennete.ancienCents,
      nbEnRetard: anciennete.nbEnRetard,
      montantEnRetardCents: anciennete.montantEnRetardCents,
    },
    chequesEnAttente: chequesEnAttente._count._all,
    montantChequesEnAttenteCents: chequesEnAttente._sum.montantCents ?? 0n,
    panierMoyenCents,
    nouveauxClients30j: nouveauxClients,
    commandes30j: commandes30j.length,
    tauxConversionPct: devisEnvoyes > 0 ? Math.round((devisAcceptes / devisEnvoyes) * 100) : null,
    caParMois: [...parMois.entries()].map(([mois, cents]) => ({ mois, caCents: cents })),
    topServices: services.slice(0, 6),
    activiteRecente: evenementsRecents.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      creeLe: e.creeLe,
      nouveauStatut: e.nouveauStatut,
      commandeNumero: e.commande?.numero ?? null,
      nomContact: e.commande?.nomContact ?? null,
    })),
  };
}
