import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";

export const schemaCreationDemande = z.object({
  nomContact: z.string().min(1),
  emailContact: z.string().email(),
  telContact: z.string().optional(),
  description: z.string().min(1).max(4000),
});

export const schemaModificationDemande = z.object({
  statut: z.enum(["NOUVELLE", "EN_COURS", "TRAITEE", "REJETEE"]).optional(),
  notesInternes: z.string().optional().nullable(),
});

export async function creerDemande(entree: z.infer<typeof schemaCreationDemande>) {
  return db.demandeSpeciale.create({
    data: {
      nomContact: entree.nomContact,
      emailContact: entree.emailContact,
      telContact: entree.telContact ?? null,
      description: entree.description,
    },
  });
}

export async function listerDemandes(filtre: { statut?: string } = {}) {
  return db.demandeSpeciale.findMany({
    where: filtre.statut ? { statut: filtre.statut as never } : {},
    orderBy: { creeLe: "desc" },
  });
}

export async function obtenirDemande(id: string) {
  const demande = await db.demandeSpeciale.findUnique({ where: { id } });
  if (!demande) throw new ErreurNonTrouve("Demande", id);
  return demande;
}

export async function modifierDemande(id: string, entree: z.infer<typeof schemaModificationDemande>) {
  const demande = await db.demandeSpeciale.findUnique({ where: { id } });
  if (!demande) throw new ErreurNonTrouve("Demande", id);

  const traiteeLe =
    entree.statut && entree.statut !== "NOUVELLE" && entree.statut !== "EN_COURS" && !demande.traiteeLe
      ? new Date()
      : demande.traiteeLe;

  return db.demandeSpeciale.update({ where: { id }, data: { ...entree, traiteeLe } });
}
