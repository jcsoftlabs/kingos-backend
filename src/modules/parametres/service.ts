import { z } from "zod";
import { db } from "../../core/db.js";

// Même forme que celle consommée par modules/documents/pdf.ts et injectée
// telle quelle dans le contenu figé du devis/facture (voir modules/devis/service.ts).
const schemaBanque = z.object({
  banque: z.string().min(1),
  titulaire: z.string().min(1),
  numeroCompte: z.string().min(1),
  type: z.string().optional(),
});

export const schemaModificationParametres = z.object({
  raisonSociale: z.string().min(1).optional(),
  adresse: z.string().min(1).optional(),
  ville: z.string().min(1).optional(),
  telephone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  siteWeb: z.string().url().optional().nullable(),
  nif: z.string().optional().nullable(),
  banques: z.array(schemaBanque).optional(),
  moncashNumero: z.string().optional().nullable(),
  natcashNumero: z.string().optional().nullable(),
  conditionsDevis: z.string().min(1).optional(),
  conditionsFacture: z.string().min(1).optional(),
  tauxTaxePct: z.number().min(0).max(100).optional(),
  tauxChangeUSD: z.number().positive().optional().nullable(),
});

/** Singleton (id=1) — voir prisma/seed.ts. Créé si absent, pour ne jamais 404 en admin. */
export async function obtenirParametresEntreprise() {
  return db.parametresEntreprise.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      raisonSociale: "Kingo's",
      adresse: "À compléter",
      ville: "Port-au-Prince",
      telephone: "+509 0000 0000",
      email: "contact@kingos.ht",
      banques: [],
      conditionsDevis: "Devis valable 15 jours à compter de la date d'émission.",
      conditionsFacture: "Paiement à réception, sauf modalités convenues.",
      tauxTaxePct: 0,
    },
  });
}

export async function modifierParametresEntreprise(entree: z.infer<typeof schemaModificationParametres>) {
  await obtenirParametresEntreprise(); // garantit l'existence de la ligne id=1
  return db.parametresEntreprise.update({
    where: { id: 1 },
    data: entree,
  });
}
