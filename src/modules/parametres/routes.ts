import type { FastifyInstance } from "fastify";
import { utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { exigeRole, ROLES_BACK_OFFICE } from "../../core/portee.js";
import { schemaModificationParametres, obtenirParametresEntreprise, modifierParametresEntreprise } from "./service.js";

// Coordonnées de l'entreprise (adresse, téléphone, banques…) affichées sur
// devis/factures/reçus — modifiables par SUPER_ADMIN/ADMIN uniquement, comme
// le catalogue (plan §10.1).
const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN"] as const;

export async function routesParametres(app: FastifyInstance) {
  // Sous-ensemble public — les pages légales (mentions, CGV) et le pied de
  // page affichent l'adresse/téléphone/NIF réels sans jamais exposer les
  // coordonnées bancaires ou MonCash de /api/admin/parametres.
  app.get("/api/parametres-publics", async () => {
    const p = await obtenirParametresEntreprise();
    return {
      succes: true,
      donnees: {
        raisonSociale: p.raisonSociale,
        adresse: p.adresse,
        ville: p.ville,
        telephone: p.telephone,
        email: p.email,
        nif: p.nif,
      },
    };
  });

  app.get("/api/admin/parametres", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, ROLES_BACK_OFFICE);
    const donnees = await obtenirParametresEntreprise();
    return { succes: true, donnees };
  });

  app.patch("/api/admin/parametres", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationParametres.parse(requete.body);
    const donnees = await modifierParametresEntreprise(entree, utilisateur);
    return { succes: true, donnees };
  });
}
