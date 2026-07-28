import type { FastifyInstance } from "fastify";
import { exigerBackOffice, utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import {
  schemaCreationRealisation,
  schemaModificationRealisation,
  listerRealisationsAdmin,
  creerRealisation,
  modifierRealisation,
  retirerRealisation,
  listerCategoriesRessources,
  schemaCreationRessource,
  schemaModificationRessource,
  listerRessourcesAdmin,
  creerRessource,
  modifierRessource,
  retirerRessource,
  schemaSignatureContenu,
  signerUploadContenu,
} from "./contenu-service.js";

// Contenu vitrine (portfolio, bibliothèque de ressources) — même règle
// d'écriture que le catalogue (plan §10.1) : SUPER_ADMIN/ADMIN uniquement.
const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN"] as const;

export async function routesAdminContenu(app: FastifyInstance) {
  app.post("/api/admin/contenu/signature", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaSignatureContenu.parse(requete.body);
    const signature = signerUploadContenu(entree);
    return { succes: true, donnees: signature };
  });

  app.get("/api/admin/realisations", async (requete) => {
    await exigerBackOffice(requete);
    const donnees = await listerRealisationsAdmin();
    return { succes: true, donnees };
  });

  app.post("/api/admin/realisations", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaCreationRealisation.parse(requete.body);
    const realisation = await creerRealisation(entree);
    return { succes: true, donnees: realisation };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/realisations/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationRealisation.parse(requete.body);
    const realisation = await modifierRealisation(requete.params.id, entree);
    return { succes: true, donnees: realisation };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/realisations/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const realisation = await retirerRealisation(requete.params.id);
    return { succes: true, donnees: realisation };
  });

  app.get("/api/admin/ressources/categories", async (requete) => {
    await exigerBackOffice(requete);
    const donnees = await listerCategoriesRessources();
    return { succes: true, donnees };
  });

  app.get("/api/admin/ressources", async (requete) => {
    await exigerBackOffice(requete);
    const donnees = await listerRessourcesAdmin();
    return { succes: true, donnees };
  });

  app.post("/api/admin/ressources", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaCreationRessource.parse(requete.body);
    const ressource = await creerRessource(entree);
    return { succes: true, donnees: ressource };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/ressources/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationRessource.parse(requete.body);
    const ressource = await modifierRessource(requete.params.id, entree);
    return { succes: true, donnees: ressource };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/ressources/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const ressource = await retirerRessource(requete.params.id);
    return { succes: true, donnees: ressource };
  });
}
