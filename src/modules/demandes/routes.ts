import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import {
  schemaCreationDemande,
  schemaModificationDemande,
  creerDemande,
  listerDemandes,
  obtenirDemande,
  modifierDemande,
} from "./service.js";

const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesDemandes(app: FastifyInstance) {
  app.post(
    "/api/demandes",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, // formulaire public, anti-spam
    async (requete) => {
      const entree = schemaCreationDemande.parse(requete.body);
      const demande = await creerDemande(entree);
      return { succes: true, donnees: { id: demande.id } };
    },
  );

  app.get<{ Querystring: { statut?: string } }>("/api/admin/demandes", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    return { succes: true, donnees: await listerDemandes({ statut: requete.query.statut }) };
  });

  app.get<{ Params: { id: string } }>("/api/admin/demandes/:id", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    return { succes: true, donnees: await obtenirDemande(requete.params.id) };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/demandes/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationDemande.parse(requete.body);
    return { succes: true, donnees: await modifierDemande(requete.params.id, entree) };
  });
}
