import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import {
  schemaCreationArticle,
  schemaModificationArticle,
  schemaMouvement,
  listerArticles,
  obtenirArticle,
  creerArticle,
  modifierArticle,
  supprimerArticle,
  enregistrerMouvement,
} from "./service.js";

const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN", "PRODUCTION"] as const;

export async function routesInventaire(app: FastifyInstance) {
  app.get("/api/admin/inventaire/articles", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    return { succes: true, donnees: await listerArticles() };
  });

  app.get<{ Params: { id: string } }>("/api/admin/inventaire/articles/:id", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    return { succes: true, donnees: await obtenirArticle(requete.params.id) };
  });

  app.post("/api/admin/inventaire/articles", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaCreationArticle.parse(requete.body);
    return { succes: true, donnees: await creerArticle(entree) };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/inventaire/articles/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationArticle.parse(requete.body);
    return { succes: true, donnees: await modifierArticle(requete.params.id, entree) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/inventaire/articles/:id", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    await supprimerArticle(requete.params.id);
    return { succes: true, donnees: null };
  });

  app.post<{ Params: { id: string } }>("/api/admin/inventaire/articles/:id/mouvements", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaMouvement.parse(requete.body);
    const mouvement = await enregistrerMouvement(requete.params.id, entree, { auteurId: utilisateur.id });
    return { succes: true, donnees: mouvement };
  });
}
