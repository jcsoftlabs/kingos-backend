import type { FastifyInstance } from "fastify";
import { db } from "../../core/db.js";
import { exigerBackOffice } from "../../core/auth-requete.js";
import { peutVoirMontants, masquerMontantsSiNecessaire } from "../../core/portee.js";

const CHAMPS_MONTANTS_COMMANDE = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents", "fraisLivraisonCents"] as const;
const CHAMPS_MONTANTS_FACTURE = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents", "payeCents"] as const;
const CHAMPS_MONTANTS_DEVIS = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents"] as const;

/**
 * Écrans de listing du back-office (plan §10). Chaque route exige un rôle
 * back-office et masque les montants pour PRODUCTION — le filtrage est
 * centralisé dans core/portee.ts, jamais un contrôle ad hoc par route
 * (c'est justement le défaut que le plan §1.6 identifiait comme bloquant).
 */
export async function routesAdmin(app: FastifyInstance) {
  app.get<{ Querystring: { statut?: string; page?: string } }>("/api/admin/commandes", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const page = Math.max(1, Number(requete.query.page) || 1);
    const taille = 25;

    const [commandes, total] = await Promise.all([
      db.commande.findMany({
        where: requete.query.statut ? { statut: requete.query.statut as never } : undefined,
        orderBy: { creeLe: "desc" },
        skip: (page - 1) * taille,
        take: taille,
        include: { lignes: { select: { serviceNom: true, quantite: true } } },
      }),
      db.commande.count({ where: requete.query.statut ? { statut: requete.query.statut as never } : undefined }),
    ]);

    const donnees = commandes.map((c) => masquerMontantsSiNecessaire(utilisateur, c, [...CHAMPS_MONTANTS_COMMANDE]));
    return { succes: true, donnees, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
  });

  app.get<{ Querystring: { statut?: string; page?: string } }>("/api/admin/devis", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const page = Math.max(1, Number(requete.query.page) || 1);
    const taille = 25;

    const [devis, total] = await Promise.all([
      db.devis.findMany({
        where: requete.query.statut ? { statut: requete.query.statut as never } : undefined,
        orderBy: { creeLe: "desc" },
        skip: (page - 1) * taille,
        take: taille,
        include: { commande: { select: { numero: true, nomContact: true, emailContact: true } } },
      }),
      db.devis.count({ where: requete.query.statut ? { statut: requete.query.statut as never } : undefined }),
    ]);

    const donnees = devis.map((d) => masquerMontantsSiNecessaire(utilisateur, d, [...CHAMPS_MONTANTS_DEVIS]));
    return { succes: true, donnees, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
  });

  app.get<{ Querystring: { statut?: string; page?: string } }>("/api/admin/factures", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const page = Math.max(1, Number(requete.query.page) || 1);
    const taille = 25;

    const [factures, total] = await Promise.all([
      db.facture.findMany({
        where: requete.query.statut ? { statut: requete.query.statut as never } : undefined,
        orderBy: { creeLe: "desc" },
        skip: (page - 1) * taille,
        take: taille,
        include: { commande: { select: { numero: true, nomContact: true, emailContact: true } } },
      }),
      db.facture.count({ where: requete.query.statut ? { statut: requete.query.statut as never } : undefined }),
    ]);

    const donnees = factures.map((f) => masquerMontantsSiNecessaire(utilisateur, f, [...CHAMPS_MONTANTS_FACTURE]));
    return { succes: true, donnees, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
  });

  app.get("/api/admin/tableau-de-bord", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);

    const debutMois = new Date();
    debutMois.setUTCDate(1);
    debutMois.setUTCHours(0, 0, 0, 0);

    const [
      commandesParStatut,
      devisEnAttente,
      facturesImpayees,
      facturesPayeesCeMois,
    ] = await Promise.all([
      db.commande.groupBy({ by: ["statut"], _count: { _all: true } }),
      db.devis.count({ where: { statut: "ENVOYE", expireLe: { gt: new Date() } } }),
      db.facture.count({ where: { statut: { in: ["EMISE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] } } }),
      db.facture.findMany({
        where: { statut: "PAYEE", payeeLe: { gte: debutMois } },
        select: { totalCents: true },
      }),
    ]);

    const caDuMois = facturesPayeesCeMois.reduce((acc, f) => acc + f.totalCents, 0n);

    const tableau = {
      commandesParStatut: commandesParStatut.map((c) => ({ statut: c.statut, total: c._count._all })),
      devisEnAttente,
      facturesImpayees,
      caDuMoisCents: peutVoirMontants(utilisateur) ? caDuMois : null,
    };

    return { succes: true, donnees: tableau };
  });
}
