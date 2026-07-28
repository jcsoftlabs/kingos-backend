import type { FastifyInstance } from "fastify";
import { db } from "../../core/db.js";
import { exigerBackOffice } from "../../core/auth-requete.js";
import { peutVoirMontants, masquerMontantsSiNecessaire } from "../../core/portee.js";
import { calculerTableauDeBord } from "./tableau-de-bord-service.js";

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
        // `contenu` (JSON figé) exclu explicitement : il répète tous les
        // montants ligne par ligne, ce qui rendait le masquage PRODUCTION
        // ci-dessous inopérant (trouvé lors de l'audit RBAC).
        select: {
          id: true,
          numero: true,
          statut: true,
          sousTotalCents: true,
          remiseCents: true,
          taxeCents: true,
          totalCents: true,
          expireLe: true,
          creeLe: true,
          commande: { select: { numero: true, nomContact: true, emailContact: true } },
        },
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
        // `contenu` exclu — voir le commentaire équivalent sur /api/admin/devis.
        select: {
          id: true,
          numero: true,
          statut: true,
          sousTotalCents: true,
          remiseCents: true,
          taxeCents: true,
          totalCents: true,
          payeCents: true,
          echeanceLe: true,
          creeLe: true,
          commande: { select: { numero: true, nomContact: true, emailContact: true } },
        },
      }),
      db.facture.count({ where: requete.query.statut ? { statut: requete.query.statut as never } : undefined }),
    ]);

    const donnees = factures.map((f) => masquerMontantsSiNecessaire(utilisateur, f, [...CHAMPS_MONTANTS_FACTURE]));
    return { succes: true, donnees, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
  });

  app.get("/api/admin/tableau-de-bord", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const tableau = await calculerTableauDeBord();

    // PRODUCTION voit l'activité mais aucun montant (plan §10.1) : on annule
    // chaque champ monétaire, y compris ceux nichés dans les séries.
    if (!peutVoirMontants(utilisateur)) {
      return {
        succes: true,
        donnees: {
          ...tableau,
          caDuMoisCents: null,
          caMoisPrecedentCents: null,
          montantImpayeCents: null,
          panierMoyenCents: null,
          caParMois: tableau.caParMois.map((m) => ({ mois: m.mois, caCents: null })),
          topServices: tableau.topServices.map((s) => ({ ...s, caCents: null })),
        },
      };
    }

    return { succes: true, donnees: tableau };
  });
}
