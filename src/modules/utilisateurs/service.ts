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
export async function creerUtilisateurBackOffice(entree: z.infer<typeof schemaCreationUtilisateur>, acteur: { id: string; role: string }) {
  const existant = await db.utilisateur.findUnique({ where: { email: entree.email } });
  if (existant) throw new ErreurConflit("Un compte existe déjà avec cet e-mail");

  const motDePasseTemporaire = randomBytes(9).toString("base64url");
  // Mêmes paramètres que prisma/seed-admin.ts (plan §11.1).
  const motDePasseHash = await hash(motDePasseTemporaire, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const [utilisateur] = await db.$transaction([
    db.utilisateur.create({
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
    }),
  ]);

  await db.journalAudit.create({
    data: {
      acteurId: acteur.id,
      acteurRole: acteur.role as never,
      action: "UTILISATEUR_CREE",
      entite: "Utilisateur",
      entiteId: utilisateur.id,
      apres: { email: utilisateur.email, role: utilisateur.role },
    },
  });

  return { utilisateur, motDePasseTemporaire };
}

export async function desactiverUtilisateurBackOffice(id: string, acteur: { id: string; role: string }) {
  await db.$transaction([
    db.utilisateur.update({ where: { id }, data: { actif: false } }),
    db.journalAudit.create({
      data: { acteurId: acteur.id, acteurRole: acteur.role as never, action: "UTILISATEUR_DESACTIVE", entite: "Utilisateur", entiteId: id },
    }),
  ]);
}

export async function reactiverUtilisateurBackOffice(id: string, acteur: { id: string; role: string }) {
  await db.$transaction([
    db.utilisateur.update({ where: { id }, data: { actif: true } }),
    db.journalAudit.create({
      data: { acteurId: acteur.id, acteurRole: acteur.role as never, action: "UTILISATEUR_REACTIVE", entite: "Utilisateur", entiteId: id },
    }),
  ]);
}

export const schemaModificationRole = z.object({
  role: z.enum(ROLES_CREABLES),
});

/** Change le rôle d'un compte staff existant — jamais vers/depuis SUPER_ADMIN par cette route. */
export async function modifierRoleUtilisateur(id: string, role: (typeof ROLES_CREABLES)[number], acteur: { id: string; role: string }) {
  const avant = await db.utilisateur.findUniqueOrThrow({ where: { id } });
  if (avant.role === "SUPER_ADMIN") throw new ErreurConflit("Le rôle d'un super administrateur ne se change pas ici");

  const [utilisateur] = await db.$transaction([
    db.utilisateur.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, nom: true, prenom: true, role: true, actif: true, creeLe: true },
    }),
    db.journalAudit.create({
      data: {
        acteurId: acteur.id,
        acteurRole: acteur.role as never,
        action: "UTILISATEUR_ROLE_MODIFIE",
        entite: "Utilisateur",
        entiteId: id,
        avant: { role: avant.role },
        apres: { role },
      },
    }),
  ]);

  return utilisateur;
}

/** Génère un nouveau mot de passe temporaire pour un compte staff (perte du précédent, oubli...). */
export async function reinitialiserMotDePasse(id: string, acteur: { id: string; role: string }) {
  const motDePasseTemporaire = randomBytes(9).toString("base64url");
  const motDePasseHash = await hash(motDePasseTemporaire, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  await db.$transaction([
    db.utilisateur.update({ where: { id }, data: { motDePasseHash } }),
    // Un mot de passe réinitialisé invalide les sessions déjà ouvertes —
    // sinon un ancien mot de passe compromis laisserait quand même une
    // session active utilisable jusqu'à son expiration naturelle.
    db.session.updateMany({ where: { utilisateurId: id, revoqueeLe: null }, data: { revoqueeLe: new Date() } }),
    db.journalAudit.create({
      data: { acteurId: acteur.id, acteurRole: acteur.role as never, action: "UTILISATEUR_MOT_DE_PASSE_REINITIALISE", entite: "Utilisateur", entiteId: id },
    }),
  ]);

  return motDePasseTemporaire;
}
