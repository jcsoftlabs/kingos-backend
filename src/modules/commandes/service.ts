import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";
import { simulerPrixAvecService } from "../catalogue/simulation.js";
import { verifierTransition } from "./machine-etats.js";
import { envoyerConfirmationCommande } from "../../core/email.js";
import type { StatutCommande } from "@prisma/client";

const schemaLigne = z.object({
  serviceSlug: z.string(),
  quantite: z.number().int().positive(),
  largeurPouces: z.number().positive().optional(),
  hauteurPouces: z.number().positive().optional(),
  optionsChoisies: z.record(z.string(), z.string()).default({}),
});

export const schemaCreationCommande = z.object({
  utilisateurId: z.string().uuid().optional(),
  emailContact: z.string().email(),
  nomContact: z.string().min(1),
  telContact: z.string().min(1),
  entreprise: z.string().optional(),
  modeLivraison: z.enum(["RETRAIT_ATELIER", "LIVRAISON_PORT_AU_PRINCE", "LIVRAISON_PROVINCE"]).default("RETRAIT_ATELIER"),
  adresseLivraison: z.string().optional(),
  notesClient: z.string().optional(),
  lignes: z.array(schemaLigne).min(1),
});

export type EntreeCreationCommande = z.infer<typeof schemaCreationCommande>;

/**
 * Crée une commande en BROUILLON avec toutes ses lignes déjà chiffrées.
 * Idempotente : un même en-tête Idempotency-Key renvoie la commande déjà
 * créée au lieu d'en insérer une seconde (plan §2.1 règle 8, §6.4).
 */
export async function creerCommande(entree: EntreeCreationCommande, cleIdempotence?: string) {
  if (cleIdempotence) {
    const existante = await db.commande.findUnique({ where: { cleIdempotence } });
    if (existante) return existante;
  }

  // Le chiffrage de chaque ligne se fait hors transaction (lectures seules,
  // pas de contention), la transaction ne couvre que les écritures.
  const lignesChiffrees = await Promise.all(
    entree.lignes.map(async (ligne) => {
      const { service, resultat, surfaceFt2 } = await simulerPrixAvecService(ligne);
      return { ligne, service, resultat, surfaceFt2 };
    }),
  );

  const sousTotalCents = lignesChiffrees.reduce((acc, l) => acc + l.resultat.totalCents, 0n);

  const commande = await db.$transaction(async (tx) => {
    const numero = await prochainNumero("CMD");

    const creee = await tx.commande.create({
      data: {
        numero,
        utilisateurId: entree.utilisateurId,
        emailContact: entree.emailContact,
        nomContact: entree.nomContact,
        telContact: entree.telContact,
        entreprise: entree.entreprise,
        modeLivraison: entree.modeLivraison,
        adresseLivraison: entree.adresseLivraison,
        notesClient: entree.notesClient,
        cleIdempotence,
        sousTotalCents,
        totalCents: sousTotalCents, // taxe/remise/livraison : appliquées en §7 (devis), pas à la création
        lignes: {
          create: lignesChiffrees.map(({ ligne, service, resultat, surfaceFt2 }) => ({
            serviceId: service.id,
            serviceNom: service.nom,
            specifications: {
              quantite: ligne.quantite,
              largeurPouces: ligne.largeurPouces ?? null,
              hauteurPouces: ligne.hauteurPouces ?? null,
              optionsChoisies: ligne.optionsChoisies,
            },
            detailPrix: JSON.parse(
              JSON.stringify(resultat, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
            ),
            quantite: ligne.quantite,
            surfaceFt2,
            prixUnitaireCents: resultat.prixUnitaireCents,
            totalCents: resultat.totalCents,
          })),
        },
      },
      include: { lignes: true },
    });

    await tx.evenementCommande.create({
      data: {
        commandeId: creee.id,
        type: "COMMANDE_CREEE",
        nouveauStatut: "BROUILLON",
        message: "Commande créée",
      },
    });

    return creee;
  });

  // Hors transaction — un échec d'envoi ne doit jamais annuler la commande
  // (envoyerEmail avale déjà ses propres erreurs, plan §13).
  await envoyerConfirmationCommande({
    destinataire: commande.emailContact,
    numero: commande.numero,
    nomContact: commande.nomContact,
  });

  return commande;
}

export async function obtenirCommandeParNumero(numero: string) {
  const commande = await db.commande.findUnique({
    where: { numero },
    include: { lignes: true, evenements: { orderBy: { creeLe: "asc" } }, fichiers: true },
  });
  if (!commande) throw new ErreurNonTrouve("Commande", numero);
  return commande;
}

export async function listerCommandes(filtre: { statut?: StatutCommande; utilisateurId?: string }) {
  return db.commande.findMany({
    where: { statut: filtre.statut, utilisateurId: filtre.utilisateurId },
    orderBy: { creeLe: "desc" },
    include: { lignes: true },
  });
}

/**
 * Changement de statut : vérifie la transition, écrit l'événement (timeline
 * client, plan §6.3) et la ligne d'audit dans la même transaction.
 */
export async function changerStatutCommande(params: {
  commandeId: string;
  nouveauStatut: StatutCommande;
  message: string;
  auteurId?: string;
  visibleClient?: boolean;
}) {
  return db.$transaction(async (tx) => {
    const commande = await tx.commande.findUnique({ where: { id: params.commandeId } });
    if (!commande) throw new ErreurNonTrouve("Commande", params.commandeId);

    verifierTransition(commande.statut, params.nouveauStatut);

    const misAJour = await tx.commande.update({
      where: { id: params.commandeId },
      data: { statut: params.nouveauStatut },
    });

    await tx.evenementCommande.create({
      data: {
        commandeId: params.commandeId,
        type: "STATUT_CHANGE",
        ancienStatut: commande.statut,
        nouveauStatut: params.nouveauStatut,
        message: params.message,
        visibleClient: params.visibleClient ?? true,
        auteurId: params.auteurId,
      },
    });

    await tx.journalAudit.create({
      data: {
        acteurId: params.auteurId,
        action: "COMMANDE_STATUT_MODIFIE",
        entite: "Commande",
        entiteId: params.commandeId,
        avant: { statut: commande.statut },
        apres: { statut: params.nouveauStatut },
      },
    });

    return misAJour;
  });
}
