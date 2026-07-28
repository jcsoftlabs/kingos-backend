import { timingSafeEqual } from "node:crypto";
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
import { routesAuth } from "./modules/auth/routes.js";
import { routesFactures } from "./modules/factures/routes.js";
import { routesPaiements } from "./modules/paiements/routes.js";
import { routesAdmin } from "./modules/admin/routes.js";
import { routesContact } from "./modules/contact/routes.js";
import { routesRessources } from "./modules/ressources/routes.js";
import { routesRealisations } from "./modules/realisations/routes.js";
import { routesDocuments } from "./modules/documents/routes.js";
import { routesAdminCatalogue } from "./modules/admin/catalogue-routes.js";
import { routesUtilisateurs } from "./modules/utilisateurs/routes.js";
import { routesParametres } from "./modules/parametres/routes.js";
import { routesClients } from "./modules/clients/routes.js";

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

// Capture le corps brut avant parsing JSON : la vérification de signature des
// webhooks (Cloudinary, futurs MonCash/Stripe) doit hacher exactement les
// octets reçus, pas une resérialisation de l'objet parsé qui peut différer
// par l'ordre des clés ou les espaces.
app.addContentTypeParser("application/json", { parseAs: "string" }, (requete, corps, fait) => {
  requete.rawBody = corps as string;
  try {
    fait(null, (corps as string).length ? JSON.parse(corps as string) : {});
  } catch (erreur) {
    fait(erreur as Error, undefined);
  }
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

  // Erreurs internes à Fastify/Node (corps JSON vide, payload trop lourd, JSON
  // malformé...) portent déjà un statusCode correct — ne pas l'écraser par un
  // 500 générique, sous peine de transformer une 400 légitime en fausse panne.
  const statutConnu = "statusCode" in erreur ? erreur.statusCode : undefined;
  if (statutConnu && statutConnu >= 400 && statutConnu < 500) {
    return reponse.code(statutConnu).send({
      succes: false,
      erreur: { code: erreur.code ?? "REQUETE_INVALIDE", message: erreur.message },
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

// Vérifie que la requête vient bien du BFF Next.js (plan §1.2) — sans ce
// contrôle, JETON_SERVICE n'était qu'une variable d'environnement lue mais
// jamais appliquée : n'importe qui pouvait appeler l'API Railway directement.
// /sante (sonde Railway) et les futurs webhooks fournisseurs (signature
// propre à chaque fournisseur, pas ce jeton) restent en dehors du contrôle.
const CHEMINS_SANS_JETON = new Set(["/sante"]);

app.addHook("preHandler", async (requete, reponse) => {
  if (CHEMINS_SANS_JETON.has(requete.url.split("?")[0]!) || requete.url.startsWith("/api/webhooks/")) {
    return;
  }

  const jetonRecu = requete.headers["x-jeton-service"];
  const attendu = Buffer.from(env.JETON_SERVICE);
  const recu = Buffer.from(typeof jetonRecu === "string" ? jetonRecu : "");

  const valide = attendu.length === recu.length && timingSafeEqual(attendu, recu);
  if (!valide) {
    return reponse.code(401).send({
      succes: false,
      erreur: { code: "NON_AUTORISE", message: "Jeton de service invalide" },
    });
  }
});

await app.register(routesCatalogue);
await app.register(routesFichiers);
await app.register(routesCommandes);
await app.register(routesDevis);
await app.register(routesAuth);
await app.register(routesFactures);
await app.register(routesPaiements);
await app.register(routesAdmin);
await app.register(routesContact);
await app.register(routesRessources);
await app.register(routesRealisations);
await app.register(routesDocuments);
await app.register(routesAdminCatalogue);
await app.register(routesUtilisateurs);
await app.register(routesParametres);
await app.register(routesClients);

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
