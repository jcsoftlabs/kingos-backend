import type { StatutCommande } from "@prisma/client";
import { ErreurConflit } from "../../core/erreurs.js";

/**
 * Transitions autorisées (plan §6.4). Toute transition non déclarée ici est
 * refusée par l'API, y compris pour un administrateur — c'est la garantie
 * qu'une commande ne saute jamais un état (ex. passer directement de
 * BROUILLON à LIVREE sans paiement).
 */
const TRANSITIONS: Record<StatutCommande, StatutCommande[]> = {
  BROUILLON: ["DEVIS_DEMANDE", "DEVIS_ENVOYE", "EN_ATTENTE_PAIEMENT", "ANNULEE"],
  DEVIS_DEMANDE: ["DEVIS_ENVOYE", "ANNULEE"],
  DEVIS_ENVOYE: ["DEVIS_ACCEPTE", "DEVIS_REFUSE", "ANNULEE"],
  DEVIS_ACCEPTE: ["EN_ATTENTE_PAIEMENT", "ANNULEE"],
  DEVIS_REFUSE: ["ANNULEE"],
  EN_ATTENTE_PAIEMENT: ["PAYEE", "ANNULEE"],
  PAYEE: ["FICHIERS_A_VERIFIER", "EN_PRODUCTION", "ANNULEE"],
  FICHIERS_A_VERIFIER: ["BAT_EN_ATTENTE", "EN_PRODUCTION", "ANNULEE"],
  BAT_EN_ATTENTE: ["BAT_VALIDE", "ANNULEE"],
  BAT_VALIDE: ["EN_PRODUCTION"],
  EN_PRODUCTION: ["PRETE"],
  PRETE: ["LIVREE"],
  LIVREE: ["CLOTUREE"],
  CLOTUREE: [],
  ANNULEE: [],
};

export function verifierTransition(actuel: StatutCommande, cible: StatutCommande) {
  if (actuel === cible) return;
  const autorisees = TRANSITIONS[actuel];
  if (!autorisees.includes(cible)) {
    throw new ErreurConflit(`Transition refusée : ${actuel} → ${cible}`);
  }
}
