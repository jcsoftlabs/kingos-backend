import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import { listerJournalAudit } from "./service.js";

// Le journal d'audit expose qui a fait quoi (paiements, comptes staff,
// paramètres…) — réservé au SUPER_ADMIN, comme la gestion des utilisateurs.
export async function routesJournal(app: FastifyInstance) {
  app.get<{ Querystring: { page?: string; action?: string } }>("/api/admin/journal", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ["SUPER_ADMIN"]);
    const { entrees, meta } = await listerJournalAudit({
      page: Number(requete.query.page) || 1,
      action: requete.query.action,
    });
    return { succes: true, donnees: entrees, meta };
  });
}
