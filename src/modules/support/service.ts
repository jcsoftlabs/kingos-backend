import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { ROLES_BACK_OFFICE } from "../../core/portee.js";

export const schemaCreationConversation = z.object({
  nomContact: z.string().min(1),
  emailContact: z.string().email(),
  telContact: z.string().optional(),
  message: z.string().min(1).max(2000),
});

export const schemaMessage = z.object({
  contenu: z.string().min(1).max(2000),
});

/** Au moins un compte back-office actif a basculé "disponible pour le chat". */
export async function estAgentDisponible(): Promise<boolean> {
  const compte = await db.utilisateur.count({
    where: { actif: true, disponibleSupport: true, role: { in: ROLES_BACK_OFFICE } },
  });
  return compte > 0;
}

/**
 * Crée une conversation depuis le widget public. Si aucun agent n'est
 * disponible au moment de l'envoi, `origineSansAgent` le signale — la
 * conversation reste identique en base, seul l'affichage staff en tient
 * compte (message laissé pour suivi, pas un client qui attend en direct).
 */
export async function creerConversation(entree: z.infer<typeof schemaCreationConversation>) {
  const disponible = await estAgentDisponible();
  const conversation = await db.conversationSupport.create({
    data: {
      nomContact: entree.nomContact,
      emailContact: entree.emailContact,
      telContact: entree.telContact,
      origineSansAgent: !disponible,
      messages: { create: { expediteur: "CLIENT", contenu: entree.message } },
    },
    include: { messages: true },
  });
  return { conversation, agentDisponible: disponible };
}

/** Vue publique — le visiteur n'a que l'UUID de sa conversation comme clé d'accès, jamais authentifié. */
export async function obtenirConversationPublique(id: string) {
  const conversation = await db.conversationSupport.findUnique({
    where: { id },
    include: { messages: { orderBy: { creeLe: "asc" } } },
  });
  if (!conversation) throw new ErreurNonTrouve("Conversation", id);
  return conversation;
}

export async function ajouterMessageClient(conversationId: string, contenu: string) {
  const conversation = await db.conversationSupport.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new ErreurNonTrouve("Conversation", conversationId);

  const disponible = await estAgentDisponible();
  await db.conversationSupport.update({
    where: { id: conversationId },
    data: {
      derniereActiviteLe: new Date(),
      // Le client revient sur une conversation déjà fermée par le staff — on
      // la rouvre plutôt que de le laisser écrire dans le vide.
      statut: "OUVERTE",
      origineSansAgent: conversation.origineSansAgent && !disponible,
    },
  });
  return db.messageSupport.create({ data: { conversationId, expediteur: "CLIENT", contenu } });
}

const MONTANTS_TRI = { statut: "asc" as const, derniereActiviteLe: "desc" as const };

export async function listerConversationsAdmin() {
  const conversations = await db.conversationSupport.findMany({
    orderBy: [{ statut: MONTANTS_TRI.statut }, { derniereActiviteLe: MONTANTS_TRI.derniereActiviteLe }],
    include: {
      messages: { orderBy: { creeLe: "desc" }, take: 1 },
      _count: { select: { messages: { where: { expediteur: "CLIENT", luParStaffLe: null } } } },
    },
  });
  return conversations.map((c) => ({
    id: c.id,
    nomContact: c.nomContact,
    emailContact: c.emailContact,
    telContact: c.telContact,
    statut: c.statut,
    origineSansAgent: c.origineSansAgent,
    derniereActiviteLe: c.derniereActiviteLe,
    dernierMessage: c.messages[0] ?? null,
    nbNonLus: c._count.messages,
  }));
}

export async function obtenirConversationAdmin(id: string) {
  const conversation = await db.conversationSupport.findUnique({
    where: { id },
    include: { messages: { orderBy: { creeLe: "asc" } } },
  });
  if (!conversation) throw new ErreurNonTrouve("Conversation", id);

  await db.messageSupport.updateMany({
    where: { conversationId: id, expediteur: "CLIENT", luParStaffLe: null },
    data: { luParStaffLe: new Date() },
  });

  return conversation;
}

export async function ajouterMessageStaff(conversationId: string, contenu: string, auteurId: string) {
  const conversation = await db.conversationSupport.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new ErreurNonTrouve("Conversation", conversationId);

  await db.conversationSupport.update({ where: { id: conversationId }, data: { derniereActiviteLe: new Date() } });
  return db.messageSupport.create({ data: { conversationId, expediteur: "STAFF", auteurId, contenu } });
}

export async function fermerConversation(id: string) {
  const conversation = await db.conversationSupport.findUnique({ where: { id } });
  if (!conversation) throw new ErreurNonTrouve("Conversation", id);
  return db.conversationSupport.update({ where: { id }, data: { statut: "FERMEE" } });
}

export async function definirDisponibilite(utilisateurId: string, disponible: boolean) {
  return db.utilisateur.update({ where: { id: utilisateurId }, data: { disponibleSupport: disponible } });
}

export function validerMessage(corps: unknown): string {
  const { contenu } = schemaMessage.parse(corps);
  return contenu;
}

// Réexporté pour lisibilité des routes — évite d'importer ErreurValidation
// dans routes.ts juste pour ce garde-fou.
export function exigerUuid(valeur: string, champ: string): string {
  const schema = z.string().uuid();
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) throw new ErreurValidation(`${champ} invalide`);
  return resultat.data;
}
