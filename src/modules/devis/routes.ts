import type { FastifyInstance } from "fastify";
import { genererDevisDepuisCommande, obtenirDevisParNumero } from "./service.js";

export async function routesDevis(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/commandes/:id/devis", async (requete) => {
    const devis = await genererDevisDepuisCommande(requete.params.id);
    return { succes: true, donnees: devis };
  });

  app.get<{ Params: { numero: string } }>("/api/devis/:numero", async (requete) => {
    const devis = await obtenirDevisParNumero(requete.params.numero);
    return { succes: true, donnees: devis };
  });
}
