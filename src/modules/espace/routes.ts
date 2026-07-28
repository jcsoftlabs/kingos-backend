import type { FastifyInstance } from "fastify";
import { utilisateurDepuisJeton } from "../auth/service.js";
import { obtenirMesDonnees } from "./service.js";

function extraireJeton(requete: { headers: Record<string, unknown> }): string | undefined {
  const entete = requete.headers["x-jeton-session"];
  return typeof entete === "string" ? entete : undefined;
}

export async function routesEspace(app: FastifyInstance) {
  app.get("/api/espace/mes-donnees", async (requete) => {
    // N'importe quel utilisateur connecté (client ou staff) ne voit que SES
    // PROPRES commandes — la portée vient de l'e-mail de la session, jamais
    // d'un paramètre d'URL qui laisserait consulter le dossier d'un autre.
    const utilisateur = await utilisateurDepuisJeton(extraireJeton(requete));
    const donnees = await obtenirMesDonnees(utilisateur.email);
    return { succes: true, donnees };
  });
}
