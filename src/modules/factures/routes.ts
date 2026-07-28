import type { FastifyInstance } from "fastify";
import { convertirDevisEnFacture, obtenirFactureParNumero } from "./service.js";

export async function routesFactures(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/devis/:id/convertir", async (requete) => {
    const facture = await convertirDevisEnFacture(requete.params.id);
    return { succes: true, donnees: facture };
  });

  app.get<{ Params: { numero: string } }>("/api/factures/:numero", async (requete) => {
    const facture = await obtenirFactureParNumero(requete.params.numero);
    return { succes: true, donnees: facture };
  });
}
