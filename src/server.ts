import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./core/env.js";
import { journal } from "./core/journalisation.js";
import { db } from "./core/db.js";
import { ErreurMetier } from "./core/erreurs.js";
import { routesCatalogue } from "./modules/catalogue/routes.js";
import { routesFichiers } from "./modules/fichiers/routes.js";
import { routesCommandes } from "./modules/commandes/routes.js";
import { routesDevis } from "./modules/devis/routes.js";

// Fastify (via JSON.stringify) ne sait pas sérialiser BigInt nativement, et les
// montants sont des BigInt partout (plan §2.1 règle 2). Un BigInt.prototype.toJSON
// est la façon la plus sûre de le couvrir sans réécrire chaque route.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({
  loggerInstance: journal,
  trustProxy: true, // Railway est derrière un proxy inverse
});

await app.register(helmet, { contentSecurityPolicy: false }); // CSP gérée côté Vercel pour les pages
await app.register(cors, {
  origin: [env.URL_FRONTEND],
  credentials: true,
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.setErrorHandler((erreur: FastifyError | ErreurMetier | ZodError, requete, reponse) => {
  if (erreur instanceof ErreurMetier) {
    return reponse.code(erreur.statut).send({
      succes: false,
      erreur: { code: erreur.code, message: erreur.message, details: erreur.details },
    });
  }

  if (erreur instanceof ZodError) {
    return reponse.code(422).send({
      succes: false,
      erreur: { code: "VALIDATION", message: "Requête invalide", details: erreur.flatten() },
    });
  }

  if (erreur.validation) {
    return reponse.code(422).send({
      succes: false,
      erreur: { code: "VALIDATION", message: "Requête invalide", details: erreur.validation },
    });
  }

  app.log.error(erreur);
  return reponse.code(500).send({
    succes: false,
    erreur: { code: "ERREUR_INTERNE", message: "Une erreur inattendue est survenue" },
  });
});

app.get("/sante", async () => {
  await db.$queryRaw`SELECT 1`;
  return { succes: true, donnees: { statut: "ok", horodatage: new Date().toISOString() } };
});

await app.register(routesCatalogue);
await app.register(routesFichiers);
await app.register(routesCommandes);
await app.register(routesDevis);

async function arretGracieux(signal: string) {
  app.log.info(`Signal ${signal} reçu — arrêt en cours`);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void arretGracieux("SIGTERM"));
process.on("SIGINT", () => void arretGracieux("SIGINT"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (erreur) {
  app.log.error(erreur);
  process.exit(1);
}
