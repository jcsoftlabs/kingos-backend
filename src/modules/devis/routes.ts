import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  genererDevisDepuisCommande,
  obtenirDevisParNumero,
  accepterDevis,
  refuserDevis,
} from "./service.js";

export async function routesDevis(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/commandes/:id/devis", async (requete) => {
    const devis = await genererDevisDepuisCommande(requete.params.id);
    return { succes: true, donnees: devis };
  });

  app.get<{ Params: { numero: string } }>("/api/devis/:numero", async (requete) => {
    const devis = await obtenirDevisParNumero(requete.params.numero);
    return { succes: true, donnees: devis };
  });

  app.post<{ Params: { id: string } }>("/api/devis/:id/accepter", async (requete) => {
    const devis = await accepterDevis(requete.params.id);
    return { succes: true, donnees: devis };
  });

  const schemaRefus = z.object({ motif: z.string().optional() });

  app.post<{ Params: { id: string } }>("/api/devis/:id/refuser", async (requete) => {
    const { motif } = schemaRefus.parse(requete.body ?? {});
    const devis = await refuserDevis(requete.params.id, motif);
    return { succes: true, donnees: devis };
  });
}
