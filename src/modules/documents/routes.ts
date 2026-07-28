import type { FastifyInstance } from "fastify";
import { obtenirUrlPdfDevis, obtenirUrlPdfFacture } from "./service.js";

export async function routesDocuments(app: FastifyInstance) {
  app.get<{ Params: { numero: string } }>("/api/devis/:numero/pdf", async (requete) => {
    const url = await obtenirUrlPdfDevis(requete.params.numero);
    return { succes: true, donnees: { url } };
  });

  app.get<{ Params: { numero: string } }>("/api/factures/:numero/pdf", async (requete) => {
    const url = await obtenirUrlPdfFacture(requete.params.numero);
    return { succes: true, donnees: { url } };
  });
}
