import { db } from "./db.js";

export type TypeDocument = "CMD" | "DEV" | "FAC" | "AVO";

/**
 * Numérotation atomique via la fonction SQL `prochain_numero` (migration
 * 20260728151500_contraintes_metier) — un UPSERT avec incrémentation en base,
 * donc sans la course entre deux requêtes concurrentes qu'un simple
 * "lire le max, ajouter 1" laisserait passer.
 */
export async function prochainNumero(type: TypeDocument, annee = new Date().getUTCFullYear()): Promise<string> {
  const [ligne] = await db.$queryRaw<{ prochain_numero: string }[]>`
    SELECT prochain_numero(${type}::text, ${annee}::int) AS prochain_numero
  `;
  if (!ligne) throw new Error("Échec de la génération du numéro de document");
  return ligne.prochain_numero;
}
