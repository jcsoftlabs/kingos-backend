import type { FastifyInstance } from "fastify";
import { exigerBackOffice, utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import {
  schemaCreationCategorie,
  schemaCreationService,
  schemaModificationService,
  schemaCreationAttribut,
  schemaCreationOption,
  listerCatalogueAdmin,
  creerCategorie,
  creerService,
  modifierService,
  retirerService,
  creerAttribut,
  creerOption,
} from "./catalogue-service.js";

// Le catalogue est modifiable par SUPER_ADMIN/ADMIN uniquement — un compte
// COMMERCIAL a un accès back-office mais reste en lecture seule sur les
// tarifs (plan §10.1), pour éviter qu'un changement de prix parte sans
// validation par la direction.
const ROLES_ECRITURE_CATALOGUE = ["SUPER_ADMIN", "ADMIN"] as const;

export async function routesAdminCatalogue(app: FastifyInstance) {
  app.get("/api/admin/catalogue", async (requete) => {
    await exigerBackOffice(requete);
    const categories = await listerCatalogueAdmin();
    return { succes: true, donnees: categories };
  });

  app.post("/api/admin/catalogue/categories", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const entree = schemaCreationCategorie.parse(requete.body);
    const categorie = await creerCategorie(entree);
    return { succes: true, donnees: categorie };
  });

  app.post("/api/admin/catalogue/services", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const entree = schemaCreationService.parse(requete.body);
    const service = await creerService(entree);
    return { succes: true, donnees: service };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/catalogue/services/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const entree = schemaModificationService.parse(requete.body);
    const service = await modifierService(requete.params.id, entree);
    return { succes: true, donnees: service };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/catalogue/services/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const service = await retirerService(requete.params.id);
    return { succes: true, donnees: service };
  });

  app.post<{ Params: { id: string } }>("/api/admin/catalogue/services/:id/attributs", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const entree = schemaCreationAttribut.parse(requete.body);
    const attribut = await creerAttribut(requete.params.id, entree);
    return { succes: true, donnees: attribut };
  });

  app.post<{ Params: { id: string } }>("/api/admin/catalogue/attributs/:id/options", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE_CATALOGUE]);
    const entree = schemaCreationOption.parse(requete.body);
    const option = await creerOption(requete.params.id, entree);
    return { succes: true, donnees: option };
  });
}
