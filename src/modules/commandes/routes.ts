import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ErreurValidation } from "../../core/erreurs.js";
import {
  schemaCreationCommande,
  creerCommande,
  obtenirCommandeParNumero,
  changerStatutCommande,
} from "./service.js";

export async function routesCommandes(app: FastifyInstance) {
  // Idempotence : voir plan §2.1 règle 8. Un double-clic ou un retry réseau
  // sur "Commander" ne doit jamais créer deux commandes.
  app.post("/api/commandes", async (requete) => {
    const cleIdempotence = requete.headers["idempotency-key"];
    if (cleIdempotence !== undefined && typeof cleIdempotence !== "string") {
      throw new ErreurValidation("En-tête Idempotency-Key invalide");
    }

    const entree = schemaCreationCommande.parse(requete.body);
    const commande = await creerCommande(entree, cleIdempotence);
    return { succes: true, donnees: commande };
  });

  app.get<{ Params: { numero: string } }>("/api/commandes/:numero", async (requete) => {
    const commande = await obtenirCommandeParNumero(requete.params.numero);
    return { succes: true, donnees: commande };
  });

  const schemaStatut = z.object({
    nouveauStatut: z.enum([
      "BROUILLON", "DEVIS_DEMANDE", "DEVIS_ENVOYE", "DEVIS_ACCEPTE", "DEVIS_REFUSE",
      "EN_ATTENTE_PAIEMENT", "PAYEE", "FICHIERS_A_VERIFIER", "BAT_EN_ATTENTE", "BAT_VALIDE",
      "EN_PRODUCTION", "PRETE", "LIVREE", "CLOTUREE", "ANNULEE",
    ]),
    message: z.string().min(1),
  });

  app.patch<{ Params: { id: string } }>("/api/commandes/:id/statut", async (requete) => {
    const entree = schemaStatut.parse(requete.body);
    const commande = await changerStatutCommande({
      commandeId: requete.params.id,
      nouveauStatut: entree.nouveauStatut,
      message: entree.message,
    });
    return { succes: true, donnees: commande };
  });
}
