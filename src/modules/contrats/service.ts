import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";
import { prochainNumero } from "../../core/numerotation.js";

export const schemaCreationContrat = z.object({
  emailClient: z.string().email(),
  nomClient: z.string().min(1),
  entreprise: z.string().optional().nullable(),
  objet: z.string().min(1),
  dateDebut: z.coerce.date(),
  dateFin: z.coerce.date().optional().nullable(),
  remisePct: z.number().min(0).max(100).optional().nullable(),
  delaiPaiementJours: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const schemaModificationContrat = schemaCreationContrat.partial();

export async function listerContrats(filtre: { statut?: string } = {}) {
  return db.contrat.findMany({
    where: filtre.statut ? { statut: filtre.statut as never } : {},
    orderBy: { creeLe: "desc" },
    include: { _count: { select: { commandes: true } } },
  });
}

export async function obtenirContrat(id: string) {
  const contrat = await db.contrat.findUnique({
    where: { id },
    include: {
      commandes: {
        orderBy: { creeLe: "desc" },
        select: { id: true, numero: true, statut: true, totalCents: true, creeLe: true },
      },
    },
  });
  if (!contrat) throw new ErreurNonTrouve("Contrat", id);
  return contrat;
}

/** Contrats actifs d'un client — utilisé pour proposer le rattachement à la création d'une commande. */
export async function listerContratsActifsDuClient(email: string) {
  return db.contrat.findMany({
    where: { emailClient: email, statut: "ACTIF" },
    orderBy: { creeLe: "desc" },
  });
}

export async function creerContrat(entree: z.infer<typeof schemaCreationContrat>) {
  const numero = await prochainNumero("CTR");
  return db.contrat.create({
    data: {
      numero,
      emailClient: entree.emailClient,
      nomClient: entree.nomClient,
      entreprise: entree.entreprise ?? null,
      objet: entree.objet,
      dateDebut: entree.dateDebut,
      dateFin: entree.dateFin ?? null,
      remisePct: entree.remisePct ?? null,
      delaiPaiementJours: entree.delaiPaiementJours ?? null,
      notes: entree.notes ?? null,
    },
  });
}

export async function modifierContrat(id: string, entree: z.infer<typeof schemaModificationContrat>) {
  const contrat = await db.contrat.findUnique({ where: { id } });
  if (!contrat) throw new ErreurNonTrouve("Contrat", id);
  return db.contrat.update({ where: { id }, data: entree });
}

export async function changerStatutContrat(id: string, statut: "ACTIF" | "SUSPENDU" | "RESILIE" | "EXPIRE") {
  const contrat = await db.contrat.findUnique({ where: { id } });
  if (!contrat) throw new ErreurNonTrouve("Contrat", id);
  return db.contrat.update({ where: { id }, data: { statut } });
}
