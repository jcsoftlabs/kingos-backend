import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exigerBackOffice, utilisateurDeLaRequete } from "../../core/auth-requete.js";
import { peutVoirMontants, masquerMontantsSiNecessaire, exigeRole } from "../../core/portee.js";
import { listerClients, obtenirClient, modifierClient, creerClient, schemaModificationClient, schemaCreationClient } from "./service.js";
import { importerClientsCsv } from "./import.js";

const MONTANTS_CLIENT = ["caRegleCents", "impayeCents"] as const;
const ROLES_ECRITURE = ["SUPER_ADMIN", "ADMIN", "COMMERCIAL"] as const;
const schemaImport = z.object({ csv: z.string().min(1) });

export async function routesClients(app: FastifyInstance) {
  app.get<{ Querystring: { recherche?: string; page?: string } }>("/api/admin/clients", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const { clients, meta } = await listerClients({
      recherche: requete.query.recherche,
      page: Number(requete.query.page) || 1,
    });

    const donnees = clients.map((c) => masquerMontantsSiNecessaire(utilisateur, c, [...MONTANTS_CLIENT]));
    return { succes: true, donnees, meta };
  });

  app.get<{ Params: { email: string } }>("/api/admin/clients/:email", async (requete) => {
    const utilisateur = await exigerBackOffice(requete);
    const client = await obtenirClient(decodeURIComponent(requete.params.email));

    if (peutVoirMontants(utilisateur)) return { succes: true, donnees: client };

    // PRODUCTION : la fiche client reste utile (coordonnées, historique,
    // statuts) mais sans aucun montant, ici comme dans les listes imbriquées.
    return {
      succes: true,
      donnees: {
        ...client,
        stats: { ...client.stats, caRegleCents: null, impayeCents: null, panierMoyenCents: null },
        commandes: client.commandes.map(({ totalCents: _t, ...reste }) => reste),
        factures: client.factures.map(({ totalCents: _t, payeCents: _p, ...reste }) => reste),
        devis: client.devis.map(({ totalCents: _t, ...reste }) => reste),
      },
    };
  });

  app.patch<{ Params: { email: string } }>("/api/admin/clients/:email", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaModificationClient.parse(requete.body);
    const client = await modifierClient(decodeURIComponent(requete.params.email), entree, utilisateur);
    return { succes: true, donnees: client };
  });

  // Entrer un client en base sans commande — migration d'une liste client
  // existante avant le CRM.
  app.post("/api/admin/clients", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const entree = schemaCreationClient.parse(requete.body);
    const client = await creerClient(entree, utilisateur);
    return { succes: true, donnees: client };
  });

  app.post("/api/admin/clients/import", async (requete) => {
    const utilisateur = await utilisateurDeLaRequete(requete);
    exigeRole(utilisateur, [...ROLES_ECRITURE]);
    const { csv } = schemaImport.parse(requete.body);
    const resultat = await importerClientsCsv(csv);
    return { succes: true, donnees: resultat };
  });
}
