import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurValidation, ErreurConflit } from "../../core/erreurs.js";

export const schemaCreationArticle = z.object({
  nom: z.string().min(1),
  categorie: z.string().optional().nullable(),
  unite: z.string().min(1),
  quantiteActuelle: z.number().nonnegative().default(0),
  seuilAlerte: z.number().nonnegative().default(0),
  notes: z.string().optional().nullable(),
});

export const schemaModificationArticle = z.object({
  nom: z.string().min(1).optional(),
  categorie: z.string().optional().nullable(),
  unite: z.string().min(1).optional(),
  seuilAlerte: z.number().nonnegative().optional(),
  notes: z.string().optional().nullable(),
});

export const schemaMouvement = z.object({
  type: z.enum(["ENTREE", "SORTIE", "AJUSTEMENT"]),
  quantite: z.number().positive(),
  motif: z.string().optional(),
});

export async function listerArticles() {
  const articles = await db.articleInventaire.findMany({ orderBy: { nom: "asc" } });
  return articles.map((a) => ({ ...a, enAlerte: a.quantiteActuelle.lte(a.seuilAlerte) }));
}

export async function obtenirArticle(id: string) {
  const article = await db.articleInventaire.findUnique({
    where: { id },
    include: { mouvements: { orderBy: { creeLe: "desc" }, take: 50 } },
  });
  if (!article) throw new ErreurNonTrouve("Article", id);
  return { ...article, enAlerte: article.quantiteActuelle.lte(article.seuilAlerte) };
}

export async function creerArticle(entree: z.infer<typeof schemaCreationArticle>) {
  return db.articleInventaire.create({
    data: {
      nom: entree.nom,
      categorie: entree.categorie ?? null,
      unite: entree.unite,
      quantiteActuelle: entree.quantiteActuelle,
      seuilAlerte: entree.seuilAlerte,
      notes: entree.notes ?? null,
    },
  });
}

export async function modifierArticle(id: string, entree: z.infer<typeof schemaModificationArticle>) {
  const article = await db.articleInventaire.findUnique({ where: { id } });
  if (!article) throw new ErreurNonTrouve("Article", id);
  return db.articleInventaire.update({ where: { id }, data: entree });
}

export async function supprimerArticle(id: string) {
  const article = await db.articleInventaire.findUnique({ where: { id }, include: { _count: { select: { mouvements: true } } } });
  if (!article) throw new ErreurNonTrouve("Article", id);
  if (article._count.mouvements > 0) {
    throw new ErreurConflit("Impossible de supprimer un article avec des mouvements enregistrés — désactivez-le plutôt en le renommant.");
  }
  await db.articleInventaire.delete({ where: { id } });
}

/**
 * Enregistre un mouvement de stock et ajuste ArticleInventaire.quantiteActuelle
 * en une transaction. `permettreNegatif` n'est utilisé QUE par le décrément
 * automatique déclenché à l'entrée en production (voir commandes/service.ts) :
 * bloquer la transition d'une commande parce que le stock est théoriquement
 * insuffisant serait pire que de laisser le stock passer en négatif — c'est
 * un signal "à recompter/réapprovisionner", pas une raison de stopper la prod.
 * Une saisie manuelle (staff) reste bloquée si elle ferait passer sous zéro.
 */
export async function enregistrerMouvement(
  articleId: string,
  entree: z.infer<typeof schemaMouvement>,
  options: { auteurId?: string; commandeId?: string; permettreNegatif?: boolean } = {},
) {
  return db.$transaction(async (tx) => {
    const article = await tx.articleInventaire.findUnique({ where: { id: articleId } });
    if (!article) throw new ErreurNonTrouve("Article", articleId);

    const signe = entree.type === "SORTIE" ? -1 : entree.type === "ENTREE" ? 1 : 0;
    let nouvelleQuantite: number;
    if (entree.type === "AJUSTEMENT") {
      nouvelleQuantite = entree.quantite;
    } else {
      nouvelleQuantite = Number(article.quantiteActuelle) + signe * entree.quantite;
      if (nouvelleQuantite < 0 && !options.permettreNegatif) {
        throw new ErreurValidation(
          `Stock insuffisant pour "${article.nom}" (${article.quantiteActuelle} ${article.unite} disponibles)`,
        );
      }
    }

    await tx.articleInventaire.update({ where: { id: articleId }, data: { quantiteActuelle: nouvelleQuantite } });
    return tx.mouvementStock.create({
      data: {
        articleId,
        type: entree.type,
        quantite: entree.quantite,
        motif: entree.motif ?? null,
        commandeId: options.commandeId ?? null,
        auteurId: options.auteurId ?? null,
      },
    });
  });
}

/**
 * Décrément automatique déclenché quand une commande passe EN_PRODUCTION —
 * pour chaque ligne dont le service est lié à un article suivi en
 * inventaire. Mode SURFACE : consommation proportionnelle à la surface
 * facturée (ft²) ; sinon proportionnelle à la quantité de la ligne.
 * N'importe jamais l'issue de la transition commande (voir permettreNegatif
 * sur enregistrerMouvement) — une erreur ici serait pire que le silence.
 */
export async function decrementerStockPourCommande(commandeId: string) {
  const lignes = await db.ligneCommande.findMany({ where: { commandeId, serviceId: { not: null } } });
  if (lignes.length === 0) return;

  const services = await db.service.findMany({
    where: { id: { in: lignes.map((l) => l.serviceId as string) } },
  });
  const servicesParId = new Map(services.map((s) => [s.id, s]));

  for (const ligne of lignes) {
    const service = ligne.serviceId ? servicesParId.get(ligne.serviceId) : undefined;
    if (!service?.articleInventaireId || !service.consommationParUnite) continue;

    const base = service.mode === "SURFACE" && ligne.surfaceFt2 ? Number(ligne.surfaceFt2) : ligne.quantite;
    const quantiteConsommee = base * Number(service.consommationParUnite);
    if (quantiteConsommee <= 0) continue;

    await enregistrerMouvement(
      service.articleInventaireId,
      { type: "SORTIE", quantite: quantiteConsommee, motif: `Production — ${ligne.serviceNom}` },
      { commandeId, permettreNegatif: true },
    );
  }
}
