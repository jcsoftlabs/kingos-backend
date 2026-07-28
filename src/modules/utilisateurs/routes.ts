import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import {
  schemaCreationUtilisateur,
  listerUtilisateursBackOffice,
  creerUtilisateurBackOffice,
  desactiverUtilisateurBackOffice,
  reactiverUtilisateurBackOffice,
} from "./service.js";

// Gestion des comptes staff (ADMIN/COMMERCIAL/PRODUCTION/LECTURE) — réservée au
// SUPER_ADMIN. Les comptes CLIENT ne passent jamais par ces routes.
async function exigerSuperAdmin(requete: Parameters<typeof utilisateurDeLaRequete>[0]) {
  const utilisateur = await utilisateurDeLaRequete(requete);
  exigeRole(utilisateur, ["SUPER_ADMIN"]);
  return utilisateur;
}

export async function routesUtilisateurs(app: FastifyInstance) {
  app.get("/api/admin/utilisateurs", async (requete) => {
    await exigerSuperAdmin(requete);
    const donnees = await listerUtilisateursBackOffice();
    return { succes: true, donnees };
  });

  app.post("/api/admin/utilisateurs", async (requete) => {
    const admin = await exigerSuperAdmin(requete);
    const entree = schemaCreationUtilisateur.parse(requete.body);
    const { utilisateur, motDePasseTemporaire } = await creerUtilisateurBackOffice(entree, admin);
    // Le mot de passe temporaire n'est renvoyé qu'une seule fois, dans cette
    // réponse — jamais stocké en clair, jamais rejoué par une autre route.
    return { succes: true, donnees: { utilisateur, motDePasseTemporaire } };
  });

  app.patch<{ Params: { id: string }; Body: { actif: boolean } }>("/api/admin/utilisateurs/:id", async (requete) => {
    const admin = await exigerSuperAdmin(requete);
    const { actif } = requete.body;
    if (requete.params.id === admin.id) {
      return { succes: false, erreur: { code: "ACTION_INVALIDE", message: "Impossible de modifier votre propre compte" } };
    }
    if (actif) await reactiverUtilisateurBackOffice(requete.params.id, admin);
    else await desactiverUtilisateurBackOffice(requete.params.id, admin);
    return { succes: true, donnees: null };
  });
}
