import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurConflit } from "../../core/erreurs.js";

// Le super admin crée des comptes staff — jamais CLIENT, qui s'inscrit lui-même
// via le parcours devis/commande. Ouvrir CLIENT ici court-circuiterait ce parcours.
export const ROLES_CREABLES = ["ADMIN", "COMMERCIAL", "PRODUCTION", "LECTURE"] as const;

export const schemaCreationUtilisateur = z.object({
  email: z.string().email(),
  nom: z.string().min(1),
  prenom: z.string().min(1).optional(),
  role: z.enum(ROLES_CREABLES),
});

export async function listerUtilisateursBackOffice() {
  return db.utilisateur.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN", "COMMERCIAL", "PRODUCTION", "LECTURE"] } },
    select: { id: true, email: true, nom: true, prenom: true, role: true, actif: true, derniereConnexion: true, creeLe: true },
    orderBy: { creeLe: "desc" },
  });
}

/** Crée un compte staff avec un mot de passe temporaire généré (à transmettre au titulaire). */
export async function creerUtilisateurBackOffice(entree: z.infer<typeof schemaCreationUtilisateur>) {
  const existant = await db.utilisateur.findUnique({ where: { email: entree.email } });
  if (existant) throw new ErreurConflit("Un compte existe déjà avec cet e-mail");

  const motDePasseTemporaire = randomBytes(9).toString("base64url");
  // Mêmes paramètres que prisma/seed-admin.ts (plan §11.1).
  const motDePasseHash = await hash(motDePasseTemporaire, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const utilisateur = await db.utilisateur.create({
    data: {
      email: entree.email,
      nom: entree.nom,
      prenom: entree.prenom,
      role: entree.role,
      motDePasseHash,
      emailVerifie: new Date(),
      actif: true,
    },
    select: { id: true, email: true, nom: true, prenom: true, role: true, actif: true, creeLe: true },
  });

  return { utilisateur, motDePasseTemporaire };
}

export async function desactiverUtilisateurBackOffice(id: string) {
  await db.utilisateur.update({ where: { id }, data: { actif: false } });
}

export async function reactiverUtilisateurBackOffice(id: string) {
  await db.utilisateur.update({ where: { id }, data: { actif: true } });
}
