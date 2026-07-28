import type { FastifyInstance } from "fastify";
import { exigerBackOffice } from "../../core/auth-requete.js";
import { obtenirUrlPdfDevis, obtenirUrlPdfFacture } from "./service.js";

// Pas de portail client : verrouillé back-office, comme les routes
// GET .../:numero correspondantes (devis/routes.ts, factures/routes.ts).
export async function routesDocuments(app: FastifyInstance) {
  app.get<{ Params: { numero: string } }>("/api/devis/:numero/pdf", async (requete) => {
    await exigerBackOffice(requete);
    const url = await obtenirUrlPdfDevis(requete.params.numero);
    return { succes: true, donnees: { url } };
  });

  app.get<{ Params: { numero: string } }>("/api/factures/:numero/pdf", async (requete) => {
    await exigerBackOffice(requete);
    const url = await obtenirUrlPdfFacture(requete.params.numero);
    return { succes: true, donnees: { url } };
  });
}
