import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import {
  schemaCreationContrat,
  schemaModificationContrat,
  listerContrats,
  obtenirContrat,
  listerContratsActifsDuClient,
  creerContrat,
  modifierContrat,
  changerStatutContrat,
} from "./service.js";

const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesContrats(app: FastifyInstance) {
  app.get<{ Querystring: { statut?: string; emailClient?: string } }>("/api/admin/contrats", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    if (requete.query.emailClient) {
      return { succes: true, donnees: await listerContratsActifsDuClient(requete.query.emailClient) };
    }
    return { succes: true, donnees: await listerContrats({ statut: requete.query.statut }) };
  });

  app.get<{ Params: { id: string } }>("/api/admin/contrats/:id", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    return { succes: true, donnees: await obtenirContrat(requete.params.id) };
  });

  app.post("/api/admin/contrats", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaCreationContrat.parse(requete.body);
    return { succes: true, donnees: await creerContrat(entree) };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/contrats/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationContrat.parse(requete.body);
    return { succes: true, donnees: await modifierContrat(requete.params.id, entree) };
  });

  app.post<{ Params: { id: string }; Body: { statut: "ACTIF" | "SUSPENDU" | "RESILIE" | "EXPIRE" } }>(
    "/api/admin/contrats/:id/statut",
    async (requete) => {
      const utilisateur = await utilisateurDeLaRequete(requete);
      exigeRole(utilisateur, [...ROLES_ECRITURE]);
      return { succes: true, donnees: await changerStatutContrat(requete.params.id, requete.body.statut) };
    },
  );
}
