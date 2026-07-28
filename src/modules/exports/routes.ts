import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import { exporterFacturesCsv, exporterPaiementsCsv } from "./service.js";

// Données financières — export réservé aux mêmes rôles que la saisie des
// paiements (SUPER_ADMIN/ADMIN/COMMERCIAL).
const ROLES_FINANCE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesExports(app: FastifyInstance) {
  app.get("/api/admin/exports/factures.csv", async (requete, reponse) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const csv = await exporterFacturesCsv();
    reponse.header("Content-Type", "text/csv; charset=utf-8");
    reponse.header("Content-Disposition", `attachment; filename="factures-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reponse.send(csv);
  });

  app.get("/api/admin/exports/paiements.csv", async (requete, reponse) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const csv = await exporterPaiementsCsv();
    reponse.header("Content-Type", "text/csv; charset=utf-8");
    reponse.header("Content-Disposition", `attachment; filename="paiements-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reponse.send(csv);
  });
}
