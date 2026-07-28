import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../core/db.js";
import { dossiersCloudinary, signerUpload, verifierSignatureWebhook } from "../../core/cloudinary.js";
import { ErreurValidation } from "../../core/erreurs.js";
import { exigerBackOffice } from "../../core/auth-requete.js";

const schemaNotificationCloudinary = z.object({
  notification_type: z.string().optional(),
  public_id: z.string().optional(),
  bytes: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  format: z.string().optional(),
  pages: z.number().optional(),
});

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
 *
 * Back-office uniquement pour l'instant : cette route acceptait n'importe
 * quel commandeId sans authentification (trouvé lors de l'audit RBAC),
 * ce qui permettait d'injecter des fichiers dans le dossier Cloudinary de
 * n'importe quelle commande. Le dépôt de fichiers se fait donc aujourd'hui
 * depuis la fiche commande du staff (glisser-déposer), pas en self-service
 * client — ça viendra avec un vrai portail client à jetons d'accès.
 */
export async function routesFichiers(app: FastifyInstance) {
  app.post("/api/fichiers/signature", async (requete) => {
    await exigerBackOffice(requete);
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
  // Signature vérifiée avant tout traitement (plan §12.2) — sans ça, n'importe
  // qui peut forger un public_id et faire passer un fichier en RECU sans
  // qu'il ait jamais transité par Cloudinary.
  app.post("/api/webhooks/cloudinary", async (requete, reponse) => {
    const signature = requete.headers["x-cld-signature"];
    const timestamp = requete.headers["x-cld-timestamp"];

    if (typeof signature !== "string" || typeof timestamp !== "string" || !requete.rawBody) {
      app.log.warn("Webhook Cloudinary reçu sans en-têtes de signature");
      return reponse.code(401).send({ succes: false, erreur: { code: "NON_AUTORISE", message: "Signature manquante" } });
    }

    const valide = verifierSignatureWebhook(requete.rawBody, timestamp, signature);
    if (!valide) {
      app.log.warn("Webhook Cloudinary : signature invalide");
      return reponse.code(401).send({ succes: false, erreur: { code: "NON_AUTORISE", message: "Signature invalide" } });
    }

    const notification = schemaNotificationCloudinary.parse(requete.body);

    if (notification.public_id) {
      const fichier = await db.fichierClient.findUnique({ where: { publicId: notification.public_id } });
      // Fichier introuvable : peut être un upload d'un autre module (ressources,
      // réalisations) qui partage la même URL de notification. On ignore
      // silencieusement plutôt que de faire échouer le webhook — Cloudinary
      // réessaierait indéfiniment sur une 4xx/5xx.
      if (fichier) {
        await db.fichierClient.update({
          where: { id: fichier.id },
          data: {
            statut: "RECU",
            tailleOctets: notification.bytes ? BigInt(notification.bytes) : fichier.tailleOctets,
            largeurPx: notification.width ?? fichier.largeurPx,
            hauteurPx: notification.height ?? fichier.hauteurPx,
            nbPages: notification.pages ?? fichier.nbPages,
            televerseLe: new Date(),
          },
        });
        await db.evenementCommande.create({
          data: {
            commandeId: fichier.commandeId,
            type: "FICHIER_RECU",
            message: `Fichier « ${fichier.nomOriginal} » reçu`,
          },
        });
      }
    }

    return reponse.code(200).send({ succes: true });
  });
}
