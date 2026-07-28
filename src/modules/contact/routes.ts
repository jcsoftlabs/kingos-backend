import type { FastifyInstance } from "fastify";
import { schemaMessageContact, enregistrerMessageContact } from "./service.js";

export async function routesContact(app: FastifyInstance) {
  app.post(
    "/api/contact",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, // formulaire public, anti-spam
    async (requete) => {
      const entree = schemaMessageContact.parse(requete.body);
      const message = await enregistrerMessageContact(entree);
      return { succes: true, donnees: { id: message.id } };
    },
  );
}
