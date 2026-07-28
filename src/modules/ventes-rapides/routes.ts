import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import { schemaVenteRapide, creerVenteRapide } from "./service.js";

const ROLES_FINANCE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesVentesRapides(app: FastifyInstance) {
  app.post("/api/admin/ventes-rapides", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const entree = schemaVenteRapide.parse(requete.body);
    const facture = await creerVenteRapide(entree, utilisateur);
    return { succes: true, donnees: facture };
  });
}
