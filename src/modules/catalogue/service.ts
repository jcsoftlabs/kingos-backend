import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";

export async function listerCategoriesVisibles() {
  return db.categorieService.findMany({
    where: { visible: true },
    orderBy: { ordre: "asc" },
    include: {
      services: {
        where: { visible: true },
        orderBy: { ordre: "asc" },
        select: { id: true, slug: true, nom: true, resume: true, mode: true, unite: true, delaiJours: true },
      },
    },
  });
}

export async function obtenirServiceParSlug(slug: string) {
  const service = await db.service.findUnique({
    where: { slug },
    include: {
      categorie: true,
      attributs: {
        orderBy: { ordre: "asc" },
        include: { options: { where: { disponible: true }, orderBy: { ordre: "asc" } } },
      },
      paliers: { orderBy: { quantiteMin: "asc" } },
      medias: { orderBy: { ordre: "asc" } },
    },
  });
  if (!service || !service.visible) throw new ErreurNonTrouve("Service", slug);
  return service;
}
