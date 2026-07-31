import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole } from "../../core/portee.js";
import { ErreurValidation } from "../../core/erreurs.js";
import { schemaPaiementManuel, enregistrerPaiementManuel, encaisserCheque, rejeterCheque, listerChequesEnAttente } from "./service.js";

// Enregistrer/encaisser/rejeter un paiement déplace de l'argent réel — trouvé
// entièrement ouvert lors de l'audit RBAC (n'importe qui pouvait marquer une
// facture payée). Réservé à SUPER_ADMIN/ADMIN/COMMERCIAL : PRODUCTION et
// LECTURE n'ont pas à toucher aux encaissements.
const ROLES_FINANCE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesPaiements(app: FastifyInstance) {
  app.get("/api/admin/paiements/cheques-en-attente", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const donnees = await listerChequesEnAttente();
    return { succes: true, donnees };
  });

  app.post("/api/paiements/manuel", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    // Même convention que la création de commande : rejouer la requête avec
    // la même clé renvoie le paiement déjà enregistré au lieu d'en créer un
    // second (encaissement = opération non rejouable par nature).
    const cleIdempotence = requete.headers["idempotency-key"];
    if (cleIdempotence !== undefined && typeof cleIdempotence !== "string") {
      throw new ErreurValidation("En-tête Idempotency-Key invalide");
    }
    const entree = schemaPaiementManuel.parse(requete.body);
    const paiement = await enregistrerPaiementManuel(entree, utilisateur, cleIdempotence);
    return { succes: true, donnees: paiement };
  });

  app.post<{ Params: { id: string } }>("/api/paiements/:id/encaisser", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const paiement = await encaisserCheque(requete.params.id, utilisateur);
    return { succes: true, donnees: paiement };
  });

  const schemaRejet = z.object({ motif: z.string().min(1) });

  app.post<{ Params: { id: string } }>("/api/paiements/:id/rejeter", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_FINANCE]);
    const { motif } = schemaRejet.parse(requete.body);
    const paiement = await rejeterCheque(requete.params.id, motif, utilisateur);
    return { succes: true, donnees: paiement };
  });
}
