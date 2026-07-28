import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";
import { dossiersCloudinary, signerUpload } from "../../core/cloudinary.js";

// ─── Réalisations (portfolio public) ───

export const schemaCreationRealisation = z.object({
  slug: z.string().min(1),
  titre: z.string().min(1),
  client: z.string().optional(),
  description: z.string().optional(),
  serviceIds: z.array(z.string().uuid()).default([]),
  publicIdPrincipal: z.string().min(1),
  dateProjet: z.coerce.date().optional(),
  miseEnAvant: z.boolean().default(false),
  ordre: z.number().int().default(0),
});

export const schemaModificationRealisation = schemaCreationRealisation.partial().extend({
  visible: z.boolean().optional(),
});

export async function listerRealisationsAdmin() {
  return db.realisation.findMany({ orderBy: [{ ordre: "asc" }, { creeLe: "desc" }] });
}

export async function creerRealisation(entree: z.infer<typeof schemaCreationRealisation>) {
  // galerie : gestion multi-image non incluse dans cette première version —
  // seule l'image principale est prise en charge, la galerie reste vide.
  return db.realisation.create({ data: { ...entree, galerie: [] } });
}

export async function modifierRealisation(id: string, entree: z.infer<typeof schemaModificationRealisation>) {
  const existante = await db.realisation.findUnique({ where: { id } });
  if (!existante) throw new ErreurNonTrouve("Réalisation", id);
  return db.realisation.update({ where: { id }, data: entree });
}

/** Suppression douce (visible: false) — cohérent avec le reste du catalogue/contenu. */
export async function retirerRealisation(id: string) {
  const existante = await db.realisation.findUnique({ where: { id } });
  if (!existante) throw new ErreurNonTrouve("Réalisation", id);
  return db.realisation.update({ where: { id }, data: { visible: false } });
}

// ─── Ressources (bibliothèque de fichiers téléchargeables) ───

export async function listerCategoriesRessources() {
  return db.categorieRessource.findMany({ orderBy: { ordre: "asc" } });
}

export const schemaCreationRessource = z.object({
  slug: z.string().min(1),
  categorieId: z.string().uuid(),
  titre: z.string().min(1),
  description: z.string().optional(),
  motsCles: z.array(z.string()).default([]),
  apercuPublicId: z.string().min(1),
  licence: z.string().default("GRATUIT_USAGE_LIBRE"),
  auteur: z.string().optional(),
  miseEnAvant: z.boolean().default(false),
  // Un seul fichier téléchargeable à la création — une ressource avec
  // plusieurs formats (PDF + AI, par ex.) s'étend plus tard si le besoin
  // se confirme ; pas construit ici pour rester dans le périmètre demandé.
  fichier: z.object({
    format: z.string().min(1),
    publicId: z.string().min(1),
    tailleOctets: z.number().int().positive(),
    resourceType: z.enum(["image", "raw"]),
  }),
});

export const schemaModificationRessource = schemaCreationRessource
  .omit({ fichier: true })
  .partial()
  .extend({ publiee: z.boolean().optional(), miseEnAvant: z.boolean().optional() });

export async function listerRessourcesAdmin() {
  return db.ressource.findMany({ orderBy: { creeLe: "desc" }, include: { categorie: { select: { nom: true } } } });
}

export async function creerRessource(entree: z.infer<typeof schemaCreationRessource>) {
  const { fichier, ...reste } = entree;
  return db.ressource.create({
    data: { ...reste, formats: [fichier], publiee: true, publieeLe: new Date() },
  });
}

export async function modifierRessource(id: string, entree: z.infer<typeof schemaModificationRessource>) {
  const existante = await db.ressource.findUnique({ where: { id } });
  if (!existante) throw new ErreurNonTrouve("Ressource", id);
  return db.ressource.update({ where: { id }, data: entree });
}

export async function retirerRessource(id: string) {
  const existante = await db.ressource.findUnique({ where: { id } });
  if (!existante) throw new ErreurNonTrouve("Ressource", id);
  return db.ressource.update({ where: { id }, data: { publiee: false } });
}

// ─── Signature d'upload pour les images/fichiers de contenu admin ───

const schemaSignatureContenu = z.object({
  type: z.enum(["realisation", "ressource-apercu", "ressource-fichier"]),
  slug: z.string().min(1),
  resourceType: z.enum(["image", "raw"]).default("image"),
});

export function signerUploadContenu(entree: z.infer<typeof schemaSignatureContenu>) {
  const dossier =
    entree.type === "realisation"
      ? dossiersCloudinary.realisations(entree.slug)
      : entree.type === "ressource-apercu"
        ? dossiersCloudinary.ressourcesApercus()
        : dossiersCloudinary.ressourcesFichiers();

  return signerUpload({ dossier, publicId: `${entree.slug}-${Date.now()}`, typeRessource: entree.resourceType });
}

export { schemaSignatureContenu };
