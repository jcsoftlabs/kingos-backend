import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import { schemaModificationParametres, obtenirParametresEntreprise, modifierParametresEntreprise } from "./service.js";

// Coordonnées de l'entreprise (adresse, téléphone, banques…) affichées sur
// devis/factures/reçus — modifiables par SUPER_ADMIN/ADMIN uniquement, comme
// le catalogue (plan §10.1).
const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN"] as const;

export async function routesParametres(app: FastifyInstance) {
  app.get("/api/admin/parametres", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ROLES_BACK_OFFICE);
    const donnees = await obtenirParametresEntreprise();
    return { succes: true, donnees };
  });

  app.patch("/api/admin/parametres", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationParametres.parse(requete.body);
    const donnees = await modifierParametresEntreprise(entree, utilisateur);
    return { succes: true, donnees };
  });
}
