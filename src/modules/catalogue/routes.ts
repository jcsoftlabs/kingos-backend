import type { FastifyInstance } from "fastify";
import { listerCategoriesVisibles, obtenirServiceParSlug } from "./service.js";
import { schemaSimulation, simulerPrix } from "./simulation.js";

export async function routesCatalogue(app: FastifyInstance) {
  app.get("/api/catalogue/categories", async () => {
    const categories = await listerCategoriesVisibles();
    return { succes: true, donnees: categories };
  });

  app.get<{ Params: { slug: string } }>("/api/catalogue/services/:slug", async (requete) => {
    const service = await obtenirServiceParSlug(requete.params.slug);
    return { succes: true, donnees: service };
  });

  // Débit limité spécifiquement : route publique, sans authentification, appelée
  // en debounce par le configurateur (plan §4.4).
  app.post(
    "/api/devis/simuler",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (requete) => {
      const entree = schemaSimulation.parse(requete.body);
      const resultat = await simulerPrix(entree);
      return { succes: true, donnees: resultat };
    },
  );
}
