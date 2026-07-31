import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ErreurValidation } from "../../core/erreurs.js";
import { exigerBackOffice, utilisateurOptionnel } from "../../core/auth-requete.js";
import { masquerMontantsSiNecessaire, ROLES_BACK_OFFICE } from "../../core/portee.js";
import {
  schemaCreationCommande,
  creerCommande,
  obtenirCommandeParNumero,
  changerStatutCommande,
} from "./service.js";

const CHAMPS_MONTANTS_COMMANDE = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents", "fraisLivraisonCents"] as const;
const CHAMPS_MONTANTS_LIGNE = ["prixUnitaireCents", "totalCents"] as const;

export async function routesCommandes(app: FastifyInstance) {
  // Route publique (plan §6.1) : un visiteur sans compte peut commander.
  // S'il est connecté, la commande est quand même rattachée à son compte —
  // utilisateurOptionnel ne lève jamais, contrairement à exigerBackOffice.
  app.post("/api/commandes", async (requete) => {
    const cleIdempotence = requete.headers["idempotency-key"];
    if (cleIdempotence !== undefined && typeof cleIdempotence !== "string") {
      throw new ErreurValidation("En-tête Idempotency-Key invalide");
    }

    const utilisateur = await utilisateurOptionnel(requete);
    const entree = schemaCreationCommande.parse(requete.body);
    const estBackOffice = !!utilisateur && ROLES_BACK_OFFICE.includes(utilisateur.role);
    const commande = await creerCommande(entree, cleIdempotence, utilisateur?.id, estBackOffice ? entree.contratId : undefined);
    return { succes: true, donnees: commande };
  });

  // Pas de portail client self-service pour l'instant (aucune page du site
  // n'appelle cette route) — back-office uniquement, pour ne pas laisser le
  // carnet de commandes énumérable par numéro séquentiel.
  app.get<{ Params: { numero: string } }>("/api/commandes/:numero", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const commande = await obtenirCommandeParNumero(requete.params.numero);
    const lignes = commande.lignes.map((l) => masquerMontantsSiNecessaire(utilisateur, l, [...CHAMPS_MONTANTS_LIGNE]));
    const devis = commande.devis.map((d) => masquerMontantsSiNecessaire(utilisateur, d, ["totalCents"]));
    const factures = commande.factures.map((f) => masquerMontantsSiNecessaire(utilisateur, f, ["totalCents", "payeCents"]));
    const masque = masquerMontantsSiNecessaire(utilisateur, commande, [...CHAMPS_MONTANTS_COMMANDE]);
    return { succes: true, donnees: { ...masque, lignes, devis, factures } };
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
    const utilisateur = await exigerBackOffice(requete);
    const entree = schemaStatut.parse(requete.body);
    const commande = await changerStatutCommande({
      commandeId: requete.params.id,
      nouveauStatut: entree.nouveauStatut,
      message: entree.message,
      auteurId: utilisateur.id,
      auteurRole: utilisateur.role,
    });
    return { succes: true, donnees: commande };
  });
}
