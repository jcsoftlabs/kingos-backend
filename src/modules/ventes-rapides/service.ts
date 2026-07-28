import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurValidation } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { envoyerFactureEmise, envoyerPaiementConfirme } from "../../core/email.js";
import { formaterHTG } from "../../core/formatage.js";
import { genererBufferPdfFacture } from "../documents/service.js";

/**
 * Vente au guichet (plan §8 — "day to day" : un client vient imprimer 40
 * pages, payer sur place, repartir avec un reçu). Contrairement au parcours
 * devis→commande, il n'y a ici ni configurateur catalogue ni délai
 * d'acceptation : la commande, la facture et le paiement complet sont créés
 * dans le même geste, par le staff, au comptoir.
 */
const schemaLigneLibre = z.object({
  description: z.string().min(1),
  quantite: z.number().int().positive(),
  prixUnitaireCents: z.coerce.bigint().positive(),
});

export const schemaVenteRapide = z.object({
  nomContact: z.string().min(1),
  telContact: z.string().min(1),
  emailContact: z.string().email().optional(),
  entreprise: z.string().optional(),
  typeClient: z.enum(["PARTICULIER", "ENTREPRISE", "ONG", "INSTITUTION_ETATIQUE"]).default("PARTICULIER"),
  lignes: z.array(schemaLigneLibre).min(1),
  fournisseur: z.enum(["ESPECES", "VIREMENT", "CHEQUE"]),
  numeroCheque: z.string().optional(),
});

export type EntreeVenteRapide = z.infer<typeof schemaVenteRapide>;

export async function creerVenteRapide(entree: EntreeVenteRapide, acteur: { id: string; role: string }) {
  if (entree.fournisseur === "CHEQUE" && !entree.numeroCheque) {
    throw new ErreurValidation("Le numéro de chèque est requis");
  }

  const parametres = await db.parametresEntreprise.findUnique({ where: { id: 1 } });
  if (!parametres) throw new ErreurValidation("Paramètres entreprise non configurés — voir /admin/parametres");

  const sousTotalCents = entree.lignes.reduce((acc, l) => acc + l.prixUnitaireCents * BigInt(l.quantite), 0n);
  const taxeCents = (sousTotalCents * BigInt(Math.round(Number(parametres.tauxTaxePct) * 100))) / 10000n;
  const totalCents = sousTotalCents + taxeCents;

  const resultat = await db.$transaction(async (tx) => {
    const numeroCommande = await prochainNumero("CMD");
    // L'e-mail n'est pas toujours donné au comptoir — un placeholder unique
    // par vente évite de regrouper tous les clients de passage sous une
    // seule fiche dans /admin/clients (identité = e-mail, voir clients/service.ts).
    const emailContact = entree.emailContact ?? `guichet-${numeroCommande.toLowerCase()}@kingos.local`;

    const commande = await tx.commande.create({
      data: {
        numero: numeroCommande,
        utilisateurId: null,
        emailContact,
        nomContact: entree.nomContact,
        telContact: entree.telContact,
        entreprise: entree.entreprise,
        typeClient: entree.typeClient,
        statut: "PAYEE",
        sousTotalCents,
        taxeCents,
        totalCents,
        lignes: {
          create: entree.lignes.map((l) => ({
            serviceId: null,
            serviceNom: l.description,
            descriptionLibre: l.description,
            specifications: {},
            detailPrix: {},
            quantite: l.quantite,
            prixUnitaireCents: l.prixUnitaireCents,
            totalCents: l.prixUnitaireCents * BigInt(l.quantite),
          })),
        },
      },
    });

    await tx.evenementCommande.create({
      data: { commandeId: commande.id, type: "COMMANDE_CREEE", nouveauStatut: "PAYEE", message: "Vente rapide au guichet", auteurId: acteur.id },
    });

    const numeroFacture = await prochainNumero("FAC");
    const contenu = {
      emetteur: {
        raisonSociale: parametres.raisonSociale,
        adresse: parametres.adresse,
        ville: parametres.ville,
        telephone: parametres.telephone,
        email: parametres.email,
        nif: parametres.nif,
        banques: parametres.banques,
        moncashNumero: parametres.moncashNumero,
      },
      client: { nom: entree.nomContact, email: emailContact, telephone: entree.telContact, entreprise: entree.entreprise ?? null },
      lignes: entree.lignes.map((l) => ({
        serviceNom: l.description,
        specifications: {},
        quantite: l.quantite,
        prixUnitaireCents: l.prixUnitaireCents.toString(),
        totalCents: (l.prixUnitaireCents * BigInt(l.quantite)).toString(),
      })),
      sousTotalCents: sousTotalCents.toString(),
      remiseCents: "0",
      taxeTauxPct: parametres.tauxTaxePct.toString(),
      taxeCents: taxeCents.toString(),
      totalCents: totalCents.toString(),
      conditions: parametres.conditionsFacture,
    };

    const facture = await tx.facture.create({
      data: {
        numero: numeroFacture,
        commandeId: commande.id,
        statut: "PAYEE",
        contenu,
        sousTotalCents,
        taxeTauxPct: parametres.tauxTaxePct,
        taxeCents,
        totalCents,
        payeCents: totalCents,
        envoyeeLe: new Date(),
        payeeLe: new Date(),
      },
    });

    const reference = `PAY-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const intention = await tx.intentionPaiement.create({
      data: {
        reference,
        commandeId: commande.id,
        factureId: facture.id,
        fournisseur: entree.fournisseur,
        montantCents: totalCents,
        statut: "REUSSI",
        cleIdempotence: crypto.randomUUID(),
        expireLe: new Date(),
      },
    });

    await tx.paiement.create({
      data: {
        intentionId: intention.id,
        commandeId: commande.id,
        factureId: facture.id,
        fournisseur: entree.fournisseur,
        statut: "REUSSI",
        montantCents: totalCents,
        refFournisseur: reference,
        numeroCheque: entree.numeroCheque,
        saisiParId: acteur.id,
        confirmeLe: new Date(),
      },
    });

    await tx.journalAudit.create({
      data: {
        acteurId: acteur.id,
        acteurRole: acteur.role as never,
        action: "VENTE_RAPIDE_CREEE",
        entite: "Facture",
        entiteId: facture.id,
        apres: { numero: facture.numero, totalCents: totalCents.toString(), fournisseur: entree.fournisseur },
      },
    });

    return { commande, facture, emailReel: !!entree.emailContact, emailContact };
  });

  // Hors transaction, et seulement si un vrai e-mail a été saisi : pas
  // d'envoi vers l'adresse placeholder générée pour les ventes sans e-mail.
  if (resultat.emailReel) {
    const pdf = await genererBufferPdfFacture(resultat.facture.id).catch(() => undefined);
    await envoyerFactureEmise({
      destinataire: resultat.emailContact,
      numero: resultat.facture.numero,
      nomContact: entree.nomContact,
      totalFormate: formaterHTG(totalCents),
      pdf,
    });
    await envoyerPaiementConfirme({
      destinataire: resultat.emailContact,
      numeroFacture: resultat.facture.numero,
      nomContact: entree.nomContact,
      montantFormate: formaterHTG(totalCents),
      pdf,
    });
  }

  return resultat.facture;
}
