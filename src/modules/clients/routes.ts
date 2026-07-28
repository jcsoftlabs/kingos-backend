import type { FastifyInstance } from "fastify";
import { exigerBackOffice } from "../../core/auth-requete.js";
import { peutVoirMontants, masquerMontantsSiNecessaire } from "../../core/portee.js";
import { listerClients, obtenirClient } from "./service.js";

const MONTANTS_CLIENT = ["caRegleCents", "impayeCents"] as const;

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
}
