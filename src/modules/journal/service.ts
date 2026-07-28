import { db } from "../../core/db.js";

export async function listerJournalAudit(options: { page?: number; action?: string } = {}) {
  const taille = 40;
  const page = Math.max(1, options.page ?? 1);
  const where = options.action ? { action: options.action } : {};

  const [entrees, total] = await Promise.all([
    db.journalAudit.findMany({
      where,
      orderBy: { creeLe: "desc" },
      skip: (page - 1) * taille,
      take: taille,
    }),
    db.journalAudit.count({ where }),
  ]);

  const acteurIds = [...new Set(entrees.map((e) => e.acteurId).filter((id): id is string => !!id))];
  const acteurs = acteurIds.length
    ? await db.utilisateur.findMany({ where: { id: { in: acteurIds } }, select: { id: true, email: true, nom: true, prenom: true } })
    : [];
  const parId = new Map(acteurs.map((a) => [a.id, a]));

  const donnees = entrees.map((e) => ({
    ...e,
    acteur: e.acteurId ? (parId.get(e.acteurId) ?? { id: e.acteurId, email: "(compte supprimé)", nom: "", prenom: null }) : null,
  }));

  return { entrees: donnees, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
}
