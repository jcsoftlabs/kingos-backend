import { db } from "../../core/db.js";

/**
 * Données du client connecté pour son espace — jamais masquées (le masquage
 * de core/portee.ts protège des montants des CLIENTS des autres, pas des
 * montants d'un client sur SA PROPRE facture). La portée de sécurité ici
 * est l'e-mail de la session, jamais un id fourni par l'appelant.
 */
export async function obtenirMesDonnees(email: string) {
  const [commandes, devis, factures] = await Promise.all([
    db.commande.findMany({
      where: { emailContact: email },
      orderBy: { creeLe: "desc" },
      select: {
        id: true,
        numero: true,
        statut: true,
        totalCents: true,
        creeLe: true,
        lignes: { select: { serviceNom: true, quantite: true } },
      },
    }),
    db.devis.findMany({
      where: { commande: { emailContact: email } },
      orderBy: { creeLe: "desc" },
      select: { id: true, numero: true, statut: true, totalCents: true, creeLe: true, expireLe: true },
    }),
    db.facture.findMany({
      where: { commande: { emailContact: email } },
      orderBy: { creeLe: "desc" },
      select: { id: true, numero: true, statut: true, totalCents: true, payeCents: true, echeanceLe: true, creeLe: true },
    }),
  ]);

  return { commandes, devis, factures };
}
