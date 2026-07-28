import type { FastifyInstance } from "fastify";
import { schemaConnexion, connecter, deconnecter, utilisateurDepuisJeton } from "./service.js";
import { schemaDemandeCode, schemaVerificationCode, demanderCodeConnexion, verifierCodeConnexion } from "./espace-service.js";

function extraireJeton(requete: { headers: Record<string, unknown> }): string | undefined {
  const entete = requete.headers["x-jeton-session"];
  return typeof entete === "string" ? entete : undefined;
}

export async function routesAuth(app: FastifyInstance) {
  app.post(
    "/api/auth/connexion",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, // plan §11.2 : freinage sur les routes d'auth
    async (requete) => {
      const { email, motDePasse } = schemaConnexion.parse(requete.body);
      const resultat = await connecter(email, motDePasse, {
        adresseIp: requete.ip,
        agentUtil: typeof requete.headers["user-agent"] === "string" ? requete.headers["user-agent"] : undefined,
      });
      return { succes: true, donnees: resultat };
    },
  );

  app.post(
    "/api/auth/espace/code",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, // déclenche un envoi d'e-mail — freinage plus strict
    async (requete) => {
      const { email } = schemaDemandeCode.parse(requete.body);
      await demanderCodeConnexion(email);
      // Toujours succès, que l'e-mail corresponde à un client connu ou non
      // (voir espace-service.ts) — jamais de moyen de deviner les comptes existants.
      return { succes: true, donnees: null };
    },
  );

  app.post(
    "/api/auth/espace/verifier",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (requete) => {
      const { email, code } = schemaVerificationCode.parse(requete.body);
      const resultat = await verifierCodeConnexion(email, code, {
        adresseIp: requete.ip,
        agentUtil: typeof requete.headers["user-agent"] === "string" ? requete.headers["user-agent"] : undefined,
      });
      return { succes: true, donnees: resultat };
    },
  );

  app.post("/api/auth/deconnexion", async (requete) => {
    const jeton = extraireJeton(requete);
    if (jeton) await deconnecter(jeton);
    return { succes: true, donnees: null };
  });

  app.get("/api/auth/moi", async (requete) => {
    const utilisateur = await utilisateurDepuisJeton(extraireJeton(requete));
    return { succes: true, donnees: utilisateur };
  });
}
