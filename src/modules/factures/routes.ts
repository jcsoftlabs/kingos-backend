import type { FastifyInstance } from "fastify";
import { exigerBackOffice, utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, masquerContenuSiNecessaire, masquerMontantsSiNecessaire } from "../../core/portee.js";
import {
  convertirDevisEnFacture,
  obtenirFactureParNumero,
  modifierEcheanceFacture,
  schemaModificationEcheance,
  annulerFacture,
  schemaAnnulationFacture,
} from "./service.js";

// Émettre une facture est un acte commercial/financier — SUPER_ADMIN/ADMIN/
// COMMERCIAL uniquement, comme pour l'acceptation du devis (devis/routes.ts).
const ROLES_COMMERCIAUX = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;
const CHAMPS_MONTANTS_FACTURE = ["sousTotalCents", "remiseCents", "taxeCents", "totalCents", "payeCents"] as const;

export async function routesFactures(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/devis/:id/convertir", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_COMMERCIAUX]);
    const facture = await convertirDevisEnFacture(requete.params.id, utilisateur.id);
    return { succes: true, donnees: facture };
  });

  // Pas de portail client : verrouillé back-office (numéro séquentiel, voir devis/routes.ts).
  app.get<{ Params: { numero: string } }>("/api/factures/:numero", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const facture = await obtenirFactureParNumero(requete.params.numero);
    const masque = masquerMontantsSiNecessaire(utilisateur, facture, [...CHAMPS_MONTANTS_FACTURE]);
    return {
      succes: true,
      donnees: { ...masque, contenu: masquerContenuSiNecessaire(utilisateur, facture.contenu as Record<string, unknown>) },
    };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/factures/:id/echeance", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_COMMERCIAUX]);
    const entree = schemaModificationEcheance.parse(requete.body);
    const facture = await modifierEcheanceFacture(requete.params.id, entree.echeanceLe, utilisateur.id);
    return { succes: true, donnees: facture };
  });

  app.post<{ Params: { id: string } }>("/api/admin/factures/:id/annuler", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_COMMERCIAUX]);
    const { motif } = schemaAnnulationFacture.parse(requete.body);
    const facture = await annulerFacture(requete.params.id, motif, utilisateur);
    return { succes: true, donnees: facture };
  });
}
