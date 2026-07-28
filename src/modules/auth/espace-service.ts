import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurMetier } from "../../core/erreurs.js";
import { genererJeton, hasherJeton, expirationSession } from "../../core/session.js";
import { envoyerCodeConnexionEspace } from "../../core/email.js";

const DUREE_CODE_MINUTES = 10;
const TENTATIVES_MAX = 5;
const DELAI_RENVOI_SECONDES = 60;

export const schemaDemandeCode = z.object({ email: z.string().email() });
export const schemaVerificationCode = z.object({ email: z.string().email(), code: z.string().length(4) });

/**
 * Connexion espace client sans mot de passe (§ demandé par le propriétaire) :
 * un code à 4 chiffres envoyé par e-mail, valable 10 minutes, 5 essais max.
 * Comme pour la connexion staff (auth/service.ts), la réponse est identique
 * que l'e-mail corresponde à un client existant ou non — jamais de moyen de
 * deviner quels e-mails sont enregistrés.
 */
export async function demanderCodeConnexion(email: string) {
  // Un « client » est reconnu par au moins une commande ou un compte
  // existant à cet e-mail (voir clients/service.ts) — sans ça, envoyer un
  // code créerait un compte fantôme pour n'importe quelle adresse tapée.
  const [commande, utilisateur] = await Promise.all([
    db.commande.findFirst({ where: { emailContact: email } }),
    db.utilisateur.findUnique({ where: { email } }),
  ]);
  if (!commande && !utilisateur) return;

  const dernierCode = await db.codeConnexionEspace.findFirst({ where: { email }, orderBy: { creeLe: "desc" } });
  if (dernierCode && Date.now() - dernierCode.creeLe.getTime() < DELAI_RENVOI_SECONDES * 1000) {
    return; // déjà un code récent en circulation — pas de renvoi immédiat (anti-spam)
  }

  const code = randomInt(0, 10000).toString().padStart(4, "0");
  const expireLe = new Date(Date.now() + DUREE_CODE_MINUTES * 60 * 1000);

  await db.codeConnexionEspace.create({
    data: { email, codeHash: hasherJeton(code), expireLe },
  });

  await envoyerCodeConnexionEspace({ destinataire: email, code });
}

const MESSAGE_GENERIQUE = "Code invalide ou expiré";

export async function verifierCodeConnexion(email: string, code: string, contexte: { adresseIp?: string; agentUtil?: string }) {
  const entree = await db.codeConnexionEspace.findFirst({
    where: { email, utiliseLe: null, expireLe: { gt: new Date() } },
    orderBy: { creeLe: "desc" },
  });
  if (!entree) throw new ErreurMetier("CODE_INVALIDE", MESSAGE_GENERIQUE, 401);

  if (entree.tentatives >= TENTATIVES_MAX) {
    await db.codeConnexionEspace.update({ where: { id: entree.id }, data: { utiliseLe: new Date() } });
    throw new ErreurMetier("TROP_TENTATIVES", "Trop de tentatives — demandez un nouveau code", 429);
  }

  if (hasherJeton(code) !== entree.codeHash) {
    await db.codeConnexionEspace.update({ where: { id: entree.id }, data: { tentatives: { increment: 1 } } });
    throw new ErreurMetier("CODE_INVALIDE", MESSAGE_GENERIQUE, 401);
  }

  await db.codeConnexionEspace.update({ where: { id: entree.id }, data: { utiliseLe: new Date() } });

  // Première connexion : provisionne un compte CLIENT sans mot de passe,
  // à partir de l'identité connue via la commande la plus récente à cet
  // e-mail (même logique que clients/service.ts pour rester cohérent).
  let utilisateur = await db.utilisateur.findUnique({ where: { email } });
  if (!utilisateur) {
    const derniereCommande = await db.commande.findFirst({ where: { emailContact: email }, orderBy: { creeLe: "desc" } });
    utilisateur = await db.utilisateur.create({
      data: {
        email,
        nom: derniereCommande?.nomContact ?? email,
        telephone: derniereCommande?.telContact,
        entreprise: derniereCommande?.entreprise,
        role: "CLIENT",
        actif: true,
        emailVerifie: new Date(),
      },
    });
  }
  if (!utilisateur.actif) throw new ErreurMetier("COMPTE_DESACTIVE", "Ce compte est désactivé", 403);

  const jetonBrut = genererJeton();
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
  ]);

  const { motDePasseHash: _mdp, ...utilisateurSansMotDePasse } = utilisateur;
  return { utilisateur: utilisateurSansMotDePasse, jeton: jetonBrut };
}
