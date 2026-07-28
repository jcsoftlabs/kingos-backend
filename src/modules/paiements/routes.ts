import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schemaPaiementManuel, enregistrerPaiementManuel, encaisserCheque, rejeterCheque } from "./service.js";

export async function routesPaiements(app: FastifyInstance) {
  app.post("/api/paiements/manuel", async (requete) => {
    const entree = schemaPaiementManuel.parse(requete.body);
    const paiement = await enregistrerPaiementManuel(entree);
    return { succes: true, donnees: paiement };
  });

  app.post<{ Params: { id: string } }>("/api/paiements/:id/encaisser", async (requete) => {
    const paiement = await encaisserCheque(requete.params.id);
    return { succes: true, donnees: paiement };
  });

  const schemaRejet = z.object({ motif: z.string().min(1) });

  app.post<{ Params: { id: string } }>("/api/paiements/:id/rejeter", async (requete) => {
    const { motif } = schemaRejet.parse(requete.body);
    const paiement = await rejeterCheque(requete.params.id, motif);
    return { succes: true, donnees: paiement };
  });
}
