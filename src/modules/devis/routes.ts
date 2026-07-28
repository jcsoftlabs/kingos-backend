import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exigerBackOffice, utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, masquerContenuSiNecessaire, masquerMontantsSiNecessaire } from "../../core/portee.js";

const CHAMPS_MONTANTS_DEVIS = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents"] as const;
import {
  genererDevisDepuisCommande,
  obtenirDevisParNumero,
  accepterDevis,
  refuserDevis,
} from "./service.js";

// Émettre/accepter/refuser un devis reste, pour l'instant, une action du
// staff au nom du client (téléphone, e-mail) — il n'existe pas encore de
// portail self-service avec lien d'accès par jeton. Restreint à
// SUPER_ADMIN/ADMIN/COMMERCIAL : PRODUCTION et LECTURE n'ont rien à faire
// sur un acte commercial.
const ROLES_COMMERCIAUX = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;

export async function routesDevis(app: FastifyInstance) {
  // Reste public : le devis est chiffré automatiquement depuis le catalogue
  // au moment de la commande (configurateur instantané, plan §6.1) — ce
  // n'est pas un jugement commercial, et l'id de commande (UUID) n'est pas
  // énumérable. Appelé juste après POST /api/commandes par le front public.
  app.post<{ Params: { id: string } }>("/api/commandes/:id/devis", async (requete) => {
    const devis = await genererDevisDepuisCommande(requete.params.id);
    return { succes: true, donnees: devis };
  });

  // Pas de portail client : verrouillé back-office pour empêcher l'énumération
  // du carnet de devis par numéro séquentiel (montants, coordonnées client).
  app.get<{ Params: { numero: string } }>("/api/devis/:numero", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const devis = await obtenirDevisParNumero(requete.params.numero);
    const masque = masquerMontantsSiNecessaire(utilisateur, devis, [...CHAMPS_MONTANTS_DEVIS]);
    return { succes: true, donnees: { ...masque, contenu: masquerContenuSiNecessaire(utilisateur, devis.contenu as Record<string, unknown>) } };
  });

  app.post<{ Params: { id: string } }>("/api/devis/:id/accepter", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_COMMERCIAUX]);
    const devis = await accepterDevis(requete.params.id);
    return { succes: true, donnees: devis };
  });

  const schemaRefus = z.object({ motif: z.string().optional() });

  app.post<{ Params: { id: string } }>("/api/devis/:id/refuser", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_COMMERCIAUX]);
    const { motif } = schemaRefus.parse(requete.body ?? {});
    const devis = await refuserDevis(requete.params.id, motif);
    return { succes: true, donnees: devis };
  });
}
