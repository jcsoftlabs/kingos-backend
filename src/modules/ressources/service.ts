import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurValidation } from "../../core/erreurs.js";
import { urlSigneeTemporaire } from "../../core/cloudinary.js";
import { hasherIp } from "../../core/ip.js";

interface FormatRessource {
  format: string;
  publicId: string;
  tailleOctets: number;
  resourceType: "image" | "raw";
}

const TAILLE_PAGE = 20;

export const schemaListeRessources = z.object({
  q: z.string().optional(),
  categorie: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  tri: z.enum(["recentes", "populaires", "mieux-notees"]).default("recentes"),
});

export type EntreeListeRessources = z.infer<typeof schemaListeRessources>;

/**
 * Recherche plein texte française sur le tsvector déjà maintenu par
 * trigger en base (migration 20260728151500) quand une requête est
 * fournie, sinon simple listing filtré (plan §9.2).
 */
export async function listerRessources(entree: EntreeListeRessources) {
  const decalage = (entree.page - 1) * TAILLE_PAGE;

  if (entree.q && entree.q.trim().length >= 3) {
    const motsCles = entree.q.trim().split(/\s+/).join(" & ");
    const [lignes, total] = await Promise.all([
      db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Ressource"
        WHERE publiee = true
          AND "rechercheVec" @@ to_tsquery('french', unaccent(${motsCles}))
        ORDER BY ts_rank("rechercheVec", to_tsquery('french', unaccent(${motsCles}))) DESC
        LIMIT ${TAILLE_PAGE} OFFSET ${decalage}
      `,
      db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM "Ressource"
        WHERE publiee = true AND "rechercheVec" @@ to_tsquery('french', unaccent(${motsCles}))
      `,
    ]);
    const ids = lignes.map((l) => l.id);
    const ressources = await db.ressource.findMany({
      where: { id: { in: ids } },
      include: { categorie: { select: { nom: true, slug: true } } },
    });
    // conserver l'ordre de pertinence renvoyé par la requête SQL
    const parId = new Map(ressources.map((r) => [r.id, r]));
    return { ressources: ids.map((id) => parId.get(id)!).filter(Boolean), total: Number(total[0]?.count ?? 0) };
  }

  const ou = {
    publiee: true,
    ...(entree.categorie ? { categorie: { slug: entree.categorie } } : {}),
  };

  const tri =
    entree.tri === "populaires"
      ? { nbTelechargements: "desc" as const }
      : entree.tri === "mieux-notees"
        ? { noteMoyenne: "desc" as const }
        : { creeLe: "desc" as const };

  const [ressources, total] = await Promise.all([
    db.ressource.findMany({
      where: ou,
      orderBy: tri,
      skip: decalage,
      take: TAILLE_PAGE,
      include: { categorie: { select: { nom: true, slug: true } } },
    }),
    db.ressource.count({ where: ou }),
  ]);

  return { ressources, total };
}

export async function obtenirRessourceParSlug(slug: string) {
  const ressource = await db.ressource.findUnique({
    where: { slug },
    include: { categorie: { select: { nom: true, slug: true } } },
  });
  if (!ressource || !ressource.publiee) throw new ErreurNonTrouve("Ressource", slug);
  return ressource;
}

export async function telechargerRessource(params: { ressourceId: string; format: string; ip: string }) {
  const ressource = await db.ressource.findUnique({ where: { id: params.ressourceId } });
  if (!ressource || !ressource.publiee) throw new ErreurNonTrouve("Ressource", params.ressourceId);

  const formats = ressource.formats as unknown as FormatRessource[];
  const formatChoisi = formats.find((f) => f.format.toLowerCase() === params.format.toLowerCase());
  if (!formatChoisi) throw new ErreurValidation(`Format ${params.format} indisponible pour cette ressource`);

  const ipHash = hasherIp(params.ip);

  await db.$transaction([
    db.telechargementRessource.create({
      data: { ressourceId: ressource.id, format: formatChoisi.format, ipHash },
    }),
    db.ressource.update({
      where: { id: ressource.id },
      data: { nbTelechargements: { increment: 1 } },
    }),
  ]);

  const nomFichier = `${ressource.slug}.${formatChoisi.format.toLowerCase()}`;
  const url = urlSigneeTemporaire(formatChoisi.publicId, {
    typeRessource: formatChoisi.resourceType,
    nomTelechargement: nomFichier,
    dureeSecondes: 300,
  });

  return { url };
}

export const schemaNotation = z.object({ note: z.number().int().min(1).max(5) });

export async function noterRessource(params: { ressourceId: string; note: number; ip: string; utilisateurId?: string }) {
  const ressource = await db.ressource.findUnique({ where: { id: params.ressourceId } });
  if (!ressource || !ressource.publiee) throw new ErreurNonTrouve("Ressource", params.ressourceId);

  const ipHash = hasherIp(params.ip);

  return db.$transaction(async (tx) => {
    await tx.notationRessource.upsert({
      where: { ressourceId_ipHash: { ressourceId: params.ressourceId, ipHash } },
      update: { note: params.note, utilisateurId: params.utilisateurId },
      create: { ressourceId: params.ressourceId, ipHash, note: params.note, utilisateurId: params.utilisateurId },
    });

    const notations = await tx.notationRessource.findMany({ where: { ressourceId: params.ressourceId } });
    const nbNotes = notations.length;
    const noteMoyenne = notations.reduce((acc, n) => acc + n.note, 0) / nbNotes;

    return tx.ressource.update({
      where: { id: params.ressourceId },
      data: { nbNotes, noteMoyenne },
    });
  });
}
