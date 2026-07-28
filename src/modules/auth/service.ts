import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurMetier, ErreurNonAutorise } from "../../core/erreurs.js";
import { genererJeton, hasherJeton, expirationSession } from "../../core/session.js";
import { ROLES_BACK_OFFICE } from "../../core/portee.js";

export const schemaConnexion = z.object({
  email: z.string().email(),
  motDePasse: z.string().min(1),
});

const MESSAGE_GENERIQUE = "E-mail ou mot de passe incorrect";

/**
 * Connexion — réponses et délais identiques que l'e-mail existe ou non
 * (plan §11.2, contre l'énumération de comptes) : toujours le même message
 * générique, jamais "compte introuvable" vs "mot de passe incorrect".
 */
export async function connecter(
  email: string,
  motDePasse: string,
  contexte: { adresseIp?: string; agentUtil?: string },
) {
  const utilisateur = await db.utilisateur.findUnique({ where: { email } });

  if (!utilisateur || !utilisateur.motDePasseHash || !utilisateur.actif) {
    // Fait quand même tourner argon2 sur un hash factice : évite qu'un
    // e-mail inexistant réponde plus vite qu'un mauvais mot de passe.
    await verify("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$AAAAAAAAAAAAAAAAAAAAAA", motDePasse).catch(() => false);
    throw new ErreurMetier("IDENTIFIANTS_INVALIDES", MESSAGE_GENERIQUE, 401);
  }

  const motDePasseValide = await verify(utilisateur.motDePasseHash, motDePasse).catch(() => false);
  if (!motDePasseValide) {
    throw new ErreurMetier("IDENTIFIANTS_INVALIDES", MESSAGE_GENERIQUE, 401);
  }

  const jetonBrut = genererJeton();

  // Le journal d'audit ne trace que les connexions back-office : un client
  // qui se connecte n'est pas un événement sensible, ça noierait le journal.
  const estBackOffice = ROLES_BACK_OFFICE.includes(utilisateur.role);

  await db.$transaction([
    db.session.create({
      data: {
        utilisateurId: utilisateur.id,
        jetonHash: hasherJeton(jetonBrut),
        adresseIp: contexte.adresseIp,
        agentUtil: contexte.agentUtil,
        expireLe: expirationSession(),
      },
    }),
    db.utilisateur.update({ where: { id: utilisateur.id }, data: { derniereConnexion: new Date() } }),
    ...(estBackOffice
      ? [
          db.journalAudit.create({
            data: {
              acteurId: utilisateur.id,
              acteurRole: utilisateur.role,
              action: "CONNEXION",
              entite: "Utilisateur",
              entiteId: utilisateur.id,
              adresseIp: contexte.adresseIp,
            },
          }),
        ]
      : []),
  ]);

  const { motDePasseHash: _mdp, ...utilisateurSansMotDePasse } = utilisateur;
  return { utilisateur: utilisateurSansMotDePasse, jeton: jetonBrut };
}

export async function deconnecter(jetonBrut: string) {
  await db.session.updateMany({
    where: { jetonHash: hasherJeton(jetonBrut), revoqueeLe: null },
    data: { revoqueeLe: new Date() },
  });
}

/** Résout un jeton de session en utilisateur, ou lève si absent/expiré/révoqué. */
export async function utilisateurDepuisJeton(jetonBrut: string | undefined) {
  if (!jetonBrut) throw new ErreurNonAutorise();

  const session = await db.session.findUnique({
    where: { jetonHash: hasherJeton(jetonBrut) },
    include: { utilisateur: true },
  });

  if (!session || session.revoqueeLe || session.expireLe < new Date() || !session.utilisateur.actif) {
    throw new ErreurNonAutorise();
  }

  const { motDePasseHash: _mdp, ...utilisateurSansMotDePasse } = session.utilisateur;
  return utilisateurSansMotDePasse;
}
