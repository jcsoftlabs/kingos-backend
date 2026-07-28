import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  schemaListeRessources,
  listerRessources,
  obtenirRessourceParSlug,
  telechargerRessource,
  schemaNotation,
  noterRessource,
} from "./service.js";

export async function routesRessources(app: FastifyInstance) {
  app.get("/api/ressources", async (requete) => {
    const entree = schemaListeRessources.parse(requete.query);
    const { ressources, total } = await listerRessources(entree);
    return { succes: true, donnees: ressources, meta: { page: entree.page, total } };
  });

  app.get<{ Params: { slug: string } }>("/api/ressources/:slug", async (requete) => {
    const ressource = await obtenirRessourceParSlug(requete.params.slug);
    return { succes: true, donnees: ressource };
  });

  app.get<{ Params: { id: string }; Querystring: { format: string } }>(
    "/api/ressources/:id/telecharger",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, // plan §9.3
    async (requete) => {
      const { url } = await telechargerRessource({
        ressourceId: requete.params.id,
        format: requete.query.format,
        ip: requete.ip,
      });
      return { succes: true, donnees: { url } };
    },
  );

  app.post<{ Params: { id: string } }>("/api/ressources/:id/noter", async (requete) => {
    const { note } = schemaNotation.parse(requete.body);
    const ressource = await noterRessource({ ressourceId: requete.params.id, note, ip: requete.ip });
    return { succes: true, donnees: ressource };
  });
}
