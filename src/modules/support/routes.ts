import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import {
  schemaCreationConversation,
  creerConversation,
  obtenirConversationPublique,
  ajouterMessageClient,
  ajouterMessageStaff,
  listerConversationsAdmin,
  obtenirConversationAdmin,
  fermerConversation,
  definirDisponibilite,
  disponibiliteDe,
  estAgentDisponible,
  validerMessage,
  exigerUuid,
} from "./service.js";

export async function routesSupport(app: FastifyInstance) {
  // ─── Public — widget de chat sur le site vitrine ───────────────────────
  app.get("/api/support/disponibilite", async () => {
    return { succes: true, donnees: { disponible: await estAgentDisponible() } };
  });

  app.post(
    "/api/support/conversations",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (requete) => {
      const entree = schemaCreationConversation.parse(requete.body);
      const { conversation, agentDisponible } = await creerConversation(entree);
      return { succes: true, donnees: { conversation, agentDisponible } };
    },
  );

  // L'UUID de la conversation fait office de clé d'accès — un visiteur non
  // authentifié ne prouve pas son identité autrement (même principe que les
  // liens de téléchargement à courte durée, mais sans expiration : un fil de
  // chat n'a pas la sensibilité d'un document financier).
  app.get<{ Params: { id: string } }>(
    "/api/support/conversations/:id",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (requete) => {
      const id = exigerUuid(requete.params.id, "id");
      const conversation = await obtenirConversationPublique(id);
      return { succes: true, donnees: conversation };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/support/conversations/:id/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (requete) => {
      const id = exigerUuid(requete.params.id, "id");
      const contenu = validerMessage(requete.body);
      const message = await ajouterMessageClient(id, contenu);
      return { succes: true, donnees: message };
    },
  );

  // ─── Admin — back-office ────────────────────────────────────────────────
  app.get("/api/admin/support/conversations", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    const conversations = await listerConversationsAdmin();
    return { succes: true, donnees: conversations };
  });

  app.get<{ Params: { id: string } }>("/api/admin/support/conversations/:id", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    const conversation = await obtenirConversationAdmin(requete.params.id);
    return { succes: true, donnees: conversation };
  });

  app.post<{ Params: { id: string } }>("/api/admin/support/conversations/:id/messages", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ROLES_BACK_OFFICE);
    const contenu = validerMessage(requete.body);
    const message = await ajouterMessageStaff(requete.params.id, contenu, utilisateur.id);
    return { succes: true, donnees: message };
  });

  app.post<{ Params: { id: string } }>("/api/admin/support/conversations/:id/fermer", async (requete) => {
    await utilisateurDeLaRequete(requete).then((u) => exigeRole(u, ROLES_BACK_OFFICE));
    const conversation = await fermerConversation(requete.params.id);
    return { succes: true, donnees: conversation };
  });

  app.get("/api/admin/support/disponibilite", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ROLES_BACK_OFFICE);
    const disponible = await disponibiliteDe(utilisateur.id);
    return { succes: true, donnees: { disponibleSupport: disponible } };
  });

  app.patch("/api/admin/support/disponibilite", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ROLES_BACK_OFFICE);
    const { disponible } = requete.body as { disponible: boolean };
    const compte = await definirDisponibilite(utilisateur.id, Boolean(disponible));
    return { succes: true, donnees: { disponibleSupport: compte.disponibleSupport } };
  });
}
