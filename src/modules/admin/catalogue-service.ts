import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";

export const schemaCreationCategorie = z.object({
  slug: z.string().min(1),
  nom: z.string().min(1),
  description: z.string().optional(),
  ordre: z.number().int().default(0),
});

export const schemaModificationCategorie = schemaCreationCategorie.partial().extend({
  visible: z.boolean().optional(),
});

export const schemaCreationService = z.object({
  categorieId: z.string().uuid(),
  slug: z.string().min(1),
  nom: z.string().min(1),
  resume: z.string().min(1),
  description: z.string().min(1),
  mode: z.enum(["SURFACE", "QUANTITE", "FORFAIT", "SUR_DEVIS"]),
  unite: z.string().optional(),
  prixBaseCents: z.coerce.bigint().default(0n),
  prixMinCents: z.coerce.bigint().default(0n),
  delaiJours: z.number().int().positive().default(3),
  surfaceMinFt2: z.coerce.number().optional(),
  quantiteMin: z.number().int().positive().default(1),
  quantiteMax: z.number().int().positive().optional(),
  fichierRequis: z.boolean().default(true),
  articleInventaireId: z.string().uuid().nullable().optional(),
  consommationParUnite: z.coerce.number().positive().nullable().optional(),
});

export const schemaModificationService = schemaCreationService.partial().extend({
  visible: z.boolean().optional(),
});

export const schemaCreationAttribut = z.object({
  cle: z.string().min(1),
  libelle: z.string().min(1),
  type: z.enum(["CHOIX", "DIMENSION", "NOMBRE", "BOOLEEN", "TEXTE"]),
  obligatoire: z.boolean().default(true),
  ordre: z.number().int().default(0),
});

export const schemaCreationOption = z.object({
  valeur: z.string().min(1),
  libelle: z.string().min(1),
  coefficient: z.coerce.number().optional(),
  supplementCents: z.coerce.bigint().optional(),
  supplementParUniteCents: z.coerce.bigint().optional(),
  ordre: z.number().int().default(0),
});

export async function listerCatalogueAdmin() {
  return db.categorieService.findMany({
    orderBy: { ordre: "asc" },
    include: {
      services: {
        orderBy: { ordre: "asc" },
        include: { attributs: { include: { options: true } }, paliers: true },
      },
    },
  });
}

export async function creerCategorie(entree: z.infer<typeof schemaCreationCategorie>) {
  return db.categorieService.create({ data: entree });
}

export async function modifierCategorie(id: string, entree: z.infer<typeof schemaModificationCategorie>) {
  const categorie = await db.categorieService.findUnique({ where: { id } });
  if (!categorie) throw new ErreurNonTrouve("Catégorie", id);
  return db.categorieService.update({ where: { id }, data: entree });
}

/**
 * Suppression douce, comme pour un service (visible: false) — jamais un vrai
 * DELETE : les services déjà commandés dans cette catégorie doivent rester
 * lisibles dans l'historique des commandes passées.
 */
export async function retirerCategorie(id: string) {
  const categorie = await db.categorieService.findUnique({ where: { id } });
  if (!categorie) throw new ErreurNonTrouve("Catégorie", id);
  return db.categorieService.update({ where: { id }, data: { visible: false } });
}

export async function creerService(entree: z.infer<typeof schemaCreationService>) {
  return db.service.create({ data: entree });
}

export async function modifierService(id: string, entree: z.infer<typeof schemaModificationService>) {
  const service = await db.service.findUnique({ where: { id } });
  if (!service) throw new ErreurNonTrouve("Service", id);
  return db.service.update({ where: { id }, data: entree });
}

/**
 * Suppression douce : `visible: false` plutôt qu'un DELETE. Un service déjà
 * référencé par une LigneCommande existante ne doit jamais disparaître de
 * l'historique des commandes passées — seulement cesser d'être proposé.
 */
export async function retirerService(id: string) {
  const service = await db.service.findUnique({ where: { id } });
  if (!service) throw new ErreurNonTrouve("Service", id);
  return db.service.update({ where: { id }, data: { visible: false } });
}

export async function creerAttribut(serviceId: string, entree: z.infer<typeof schemaCreationAttribut>) {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new ErreurNonTrouve("Service", serviceId);
  return db.attributService.create({ data: { ...entree, serviceId } });
}

export async function creerOption(attributId: string, entree: z.infer<typeof schemaCreationOption>) {
  const attribut = await db.attributService.findUnique({ where: { id: attributId } });
  if (!attribut) throw new ErreurNonTrouve("Attribut", attributId);
  return db.optionAttribut.create({ data: { ...entree, attributId } });
}
