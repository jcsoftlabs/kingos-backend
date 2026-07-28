import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../core/db.js";
import { dossiersCloudinary, signerUpload } from "../../core/cloudinary.js";
import { ErreurValidation } from "../../core/erreurs.js";

const EXTENSIONS_AUTORISEES = new Set(["pdf", "ai", "eps", "psd", "svg", "jpg", "jpeg", "png", "tiff", "zip"]);
const TAILLE_MAX_OCTETS = 400 * 1024 * 1024; // 400 Mo — cf. plan §12.3, à confirmer selon le plan Cloudinary retenu

const schemaSignature = z.object({
  commandeId: z.string().uuid(),
  ligneId: z.string().uuid().optional(),
  nomFichier: z.string().min(1),
  tailleOctets: z.number().int().positive(),
  typeMime: z.string(),
});

/**
 * Émission d'une signature d'upload à usage unique (plan §6.2). Le navigateur
 * envoie ensuite le fichier directement à Cloudinary — jamais via cette API,
 * dont la charge utile serait limitée et le transfert lent sur mobile.
 */
export async function routesFichiers(app: FastifyInstance) {
  app.post("/api/fichiers/signature", async (requete) => {
    const entree = schemaSignature.parse(requete.body);
    const extension = entree.nomFichier.split(".").pop()?.toLowerCase() ?? "";

    if (!EXTENSIONS_AUTORISEES.has(extension)) {
      throw new ErreurValidation(`Extension .${extension} non autorisée`);
    }
    if (entree.tailleOctets > TAILLE_MAX_OCTETS) {
      throw new ErreurValidation("Fichier trop volumineux");
    }

    const commande = await db.commande.findUnique({ where: { id: entree.commandeId } });
    if (!commande) throw new ErreurValidation("Commande introuvable");

    const fichier = await db.fichierClient.create({
      data: {
        commandeId: entree.commandeId,
        ligneId: entree.ligneId,
        publicId: `${dossiersCloudinary.commande(commande.numero)}/${crypto.randomUUID()}`,
        resourceType: entree.typeMime.startsWith("image/") ? "image" : "raw",
        typeLivraison: "authenticated",
        nomOriginal: entree.nomFichier,
        extension,
        tailleOctets: BigInt(entree.tailleOctets),
        statut: "EN_ATTENTE_UPLOAD",
      },
    });

    const signature = signerUpload({
      dossier: dossiersCloudinary.commande(commande.numero),
      publicId: fichier.publicId.split("/").pop()!,
      accesAuthentifie: true,
      typeRessource: entree.typeMime.startsWith("image/") ? "image" : "auto",
    });

    return { succes: true, donnees: { fichierId: fichier.id, ...signature } };
  });

  // Webhook Cloudinary : confirme la réception effective du fichier (plan §6.2 étape 4).
  app.post("/api/webhooks/cloudinary", async (requete, reponse) => {
    // TODO : vérifier x-cld-signature / x-cld-timestamp avant tout traitement (plan §12.2).
    app.log.info({ body: requete.body }, "webhook Cloudinary reçu");
    return reponse.code(200).send({ succes: true });
  });
}
