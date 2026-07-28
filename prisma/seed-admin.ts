import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

/**
 * Crée (ou met à jour) un compte SUPER_ADMIN. Ne fait jamais partie de
 * `pnpm db:seed` (données de démo) — c'est une opération d'exploitation,
 * à lancer une fois par environnement (dev, staging, production).
 *
 * Usage :
 *   ADMIN_EMAIL=vous@kingos.ht ADMIN_PASSWORD=... pnpm db:seed-admin
 *   ADMIN_EMAIL=vous@kingos.ht pnpm db:seed-admin        (mot de passe généré)
 */
async function principal() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.error("ADMIN_EMAIL est requis. Exemple :");
    console.error("  ADMIN_EMAIL=vous@kingos.ht pnpm db:seed-admin");
    process.exit(1);
  }

  const motDePasseGenere = !process.env.ADMIN_PASSWORD;
  const motDePasse = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");

  // Mêmes paramètres qu'annoncés dans le plan (§11.1) : m=19456, t=2, p=1.
  const motDePasseHash = await hash(motDePasse, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const utilisateur = await db.utilisateur.upsert({
    where: { email },
    update: { motDePasseHash, role: "SUPER_ADMIN", actif: true },
    create: {
      email,
      motDePasseHash,
      role: "SUPER_ADMIN",
      nom: process.env.ADMIN_NOM ?? "Administrateur",
      emailVerifie: new Date(),
      actif: true,
    },
  });

  console.log("Compte SUPER_ADMIN prêt :", utilisateur.email);
  if (motDePasseGenere) {
    console.log("Mot de passe généré (à noter maintenant, non stocké en clair) :", motDePasse);
  }
  console.log(
    "\nATTENTION : aucune route de connexion n'existe encore côté API (module auth non implémenté).",
    "Ce compte est prêt en base mais inutilisable tant que /api/auth/connexion n'est pas construit.",
  );
}

principal()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
