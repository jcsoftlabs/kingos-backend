import { z } from "zod";
import { db } from "../../core/db.js";
import { envoyerMessageContact } from "../../core/email.js";

export const schemaMessageContact = z.object({
  nom: z.string().min(1),
  email: z.string().email(),
  telephone: z.string().optional(),
  sujet: z.string().min(1),
  message: z.string().min(1),
});

export type EntreeMessageContact = z.infer<typeof schemaMessageContact>;

export async function enregistrerMessageContact(entree: EntreeMessageContact) {
  const message = await db.messageContact.create({ data: entree });

  await envoyerMessageContact({
    nomExpediteur: entree.nom,
    emailExpediteur: entree.email,
    sujetMessage: entree.sujet,
    message: entree.message,
  });

  return message;
}
