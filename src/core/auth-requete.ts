import type { FastifyRequest } from "fastify";
import { utilisateurDepuisJeton } from "../modules/auth/service.js";
import { exigeRole, ROLES_BACK_OFFICE, type UtilisateurCourant } from "./portee.js";
import { ErreurAccesRefuse } from "./erreurs.js";

function extraireJetonSession(requete: FastifyRequest): string | undefined {
  const jeton = requete.headers["x-jeton-session"];
  return typeof jeton === "string" ? jeton : undefined;
}

/** Résout l'utilisateur depuis X-Jeton-Session, ou lève ErreurNonAutorise. */
export async function utilisateurDeLaRequete(requete: FastifyRequest): Promise<UtilisateurCourant> {
  return utilisateurDepuisJeton(extraireJetonSession(requete));
}

/**
 * Autorise le back-office (tout rôle) OU le client propriétaire du document
 * (session dont l'e-mail correspond à celui du destinataire) — pour les
 * routes documents/devis/facture consultées à la fois par le staff et par
 * le client depuis son espace (plan « prévisualiser mes devis/factures »).
 */
export async function exigerBackOfficeOuProprietaire(requete: FastifyRequest, emailProprietaire: string) {
  const utilisateur = await utilisateurDepuisJeton(extraireJetonSession(requete));
  if (ROLES_BACK_OFFICE.includes(utilisateur.role)) return utilisateur;
  if (utilisateur.email === emailProprietaire) return utilisateur;
  throw new ErreurAccesRefuse();
}

/** À appeler en première ligne de chaque route admin — lève si pas back-office. */
export async function exigerBackOffice(requete: FastifyRequest): Promise<UtilisateurCourant> {
  const utilisateur = await utilisateurDeLaRequete(requete);
  exigeRole(utilisateur, ROLES_BACK_OFFICE);
  return utilisateur;
}

/**
 * Résout l'utilisateur si une session valide est présente, sans jamais lever
 * — pour les routes publiques (ex. création de commande) qui acceptent aussi
 * bien un visiteur anonyme qu'un client déjà connecté.
 */
export async function utilisateurOptionnel(requete: FastifyRequest): Promise<UtilisateurCourant | undefined> {
  try {
    return await utilisateurDeLaRequete(requete);
  } catch {
    return undefined;
  }
}
