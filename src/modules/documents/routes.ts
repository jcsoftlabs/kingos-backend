import type { FastifyInstance } from "fastify";
import { db } from "../../core/db.js";
import { exigerBackOfficeOuProprietaire } from "../../core/auth-requete.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";
import { obtenirUrlPdfDevis, obtenirUrlPdfFacture } from "./service.js";

// Le staff voit tous les PDF ; un client ne voit que les siens (son e-mail
// de session doit correspondre à celui de la commande d'origine) — sinon
// les numéros séquentiels rendraient tout le carnet de documents lisible
// par n'importe quel compte client (plan « prévisualiser mes devis/factures »).
export async function routesDocuments(app: FastifyInstance) {
  app.get<{ Params: { numero: string } }>("/api/devis/:numero/pdf", async (requete) => {
    const devis = await db.devis.findUnique({
      where: { numero: requete.params.numero },
      select: { commande: { select: { emailContact: true } } },
    });
    if (!devis) throw new ErreurNonTrouve("Devis", requete.params.numero);
    await exigerBackOfficeOuProprietaire(requete, devis.commande.emailContact);

    const url = await obtenirUrlPdfDevis(requete.params.numero);
    return { succes: true, donnees: { url } };
  });

  app.get<{ Params: { numero: string } }>("/api/factures/:numero/pdf", async (requete) => {
    const facture = await db.facture.findUnique({
      where: { numero: requete.params.numero },
      select: { commande: { select: { emailContact: true } } },
    });
    if (!facture) throw new ErreurNonTrouve("Facture", requete.params.numero);
    await exigerBackOfficeOuProprietaire(requete, facture.commande.emailContact);

    const url = await obtenirUrlPdfFacture(requete.params.numero);
    return { succes: true, donnees: { url } };
  });
}
