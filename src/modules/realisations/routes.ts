import type { FastifyInstance } from "fastify";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";

export async function routesRealisations(app: FastifyInstance) {
  app.get("/api/realisations", async () => {
    const realisations = await db.realisation.findMany({
      where: { visible: true },
      orderBy: [{ miseEnAvant: "desc" }, { ordre: "asc" }],
    });
    return { succes: true, donnees: realisations };
  });

  app.get<{ Params: { slug: string } }>("/api/realisations/:slug", async (requete) => {
    const realisation = await db.realisation.findUnique({ where: { slug: requete.params.slug } });
    if (!realisation || !realisation.visible) throw new ErreurNonTrouve("Réalisation", requete.params.slug);
    return { succes: true, donnees: realisation };
  });
}
