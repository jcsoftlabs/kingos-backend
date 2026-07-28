import type { Role } from "@prisma/client";
import { ErreurAccesRefuse } from "./erreurs.js";

/**
 * Filtrage centralisé par rôle (plan §11 / §10.1). Toute requête qui liste ou lit
 * des commandes, clients, montants doit passer par ces fonctions — jamais un
 * contrôle ad hoc route par route. C'est ce qui empêche un compte PRODUCTION de
 * voir un montant, ou un client de voir la commande d'un autre.
 */

export interface UtilisateurCourant {
  id: string;
  role: Role;
}

export const ROLES_VOIENT_MONTANTS: Role[] = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL", "LECTURE"];
export const ROLES_BACK_OFFICE: Role[] = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL", "PRODUCTION", "LECTURE"];

export function exigeRole(utilisateur: UtilisateurCourant | undefined, roles: Role[]): asserts utilisateur is UtilisateurCourant {
  if (!utilisateur || !roles.includes(utilisateur.role)) {
    throw new ErreurAccesRefuse();
  }
}

export function peutVoirMontants(utilisateur: UtilisateurCourant): boolean {
  return ROLES_VOIENT_MONTANTS.includes(utilisateur.role);
}

/** Clause Prisma `where` pour restreindre les commandes visibles par l'utilisateur courant. */
export function porteeCommandes(utilisateur: UtilisateurCourant) {
  if (ROLES_BACK_OFFICE.includes(utilisateur.role)) {
    return {}; // le back-office voit toutes les commandes ; les montants sont masqués côté sérialisation pour PRODUCTION
  }
  // un client ne voit que ses propres commandes
  return { utilisateurId: utilisateur.id };
}

/** Retire les champs monétaires d'un objet commande/facture avant de le renvoyer à un rôle qui n'y a pas droit. */
export function masquerMontantsSiNecessaire<T extends Record<string, unknown>>(
  utilisateur: UtilisateurCourant,
  objet: T,
  champs: (keyof T)[],
): T {
  if (peutVoirMontants(utilisateur)) return objet;
  const copie = { ...objet };
  for (const champ of champs) {
    delete copie[champ];
  }
  return copie;
}
