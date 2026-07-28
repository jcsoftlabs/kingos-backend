import type { FastifyRequest } from "fastify";
import { utilisateurDepuisJeton } from "../modules/auth/service.js";
import { exigeRole, ROLES_BACK_OFFICE, type UtilisateurCourant } from "./portee.js";

/** Résout l'utilisateur depuis X-Jeton-Session, ou lève ErreurNonAutorise. */
export async function utilisateurDeLaRequete(requete: FastifyRequest): Promise<UtilisateurCourant> {
  const jeton = requete.headers["x-jeton-session"];
  return utilisateurDepuisJeton(typeof jeton === "string" ? jeton : undefined);
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
