import { v2 as cloudinary } from "cloudinary";

// CLOUDINARY_URL est lu automatiquement par le SDK (cloudinary://key:secret@cloud_name).
cloudinary.config({ secure: true });

export { cloudinary };

const DOSSIER_RACINE = process.env.NODE_ENV === "production" ? "kingos/prod" : "kingos/dev";

export const dossiersCloudinary = {
  catalogue: (slug: string) => `${DOSSIER_RACINE}/catalogue/${slug}`,
  realisations: (slug: string) => `${DOSSIER_RACINE}/realisations/${slug}`,
  ressourcesApercus: () => `${DOSSIER_RACINE}/ressources/apercus`,
  ressourcesFichiers: () => `${DOSSIER_RACINE}/ressources/fichiers`,
  commande: (numero: string) => `${DOSSIER_RACINE}/commandes/${numero}`,
  bat: (numero: string) => `${DOSSIER_RACINE}/bat/${numero}`,
  documents: (type: "devis" | "factures") => `${DOSSIER_RACINE}/documents/${type}`,
  marque: () => `${DOSSIER_RACINE}/marque`,
} as const;

/**
 * Signature d'upload à usage unique. Le navigateur envoie le fichier directement
 * à Cloudinary — jamais via l'API — avec ces paramètres. Voir plan §6.2 et §12.
 */
export function signerUpload(params: {
  dossier: string;
  publicId: string;
  accesAuthentifie?: boolean;
  typeRessource?: "image" | "raw" | "auto";
}) {
  const timestamp = Math.round(Date.now() / 1000);
  const parametresASigner: Record<string, string | number> = {
    timestamp,
    folder: params.dossier,
    public_id: params.publicId,
    ...(params.accesAuthentifie ? { access_mode: "authenticated", type: "authenticated" } : {}),
  };

  const signature = cloudinary.utils.api_sign_request(
    parametresASigner,
    cloudinary.config().api_secret as string,
  );

  return {
    timestamp,
    signature,
    apiKey: cloudinary.config().api_key,
    cloudName: cloudinary.config().cloud_name,
    dossier: params.dossier,
    publicId: params.publicId,
    typeRessource: params.typeRessource ?? "auto",
    accesAuthentifie: params.accesAuthentifie ?? false,
  };
}

/**
 * Vérifie la signature d'un webhook Cloudinary avant tout traitement
 * (plan §12.2) — sans ça, n'importe qui peut appeler /api/webhooks/cloudinary
 * avec un faux public_id et faire passer un fichier client en RECU sans
 * qu'il ait jamais été réellement téléversé.
 */
export function verifierSignatureWebhook(corpsBrut: string, timestamp: string, signature: string): boolean {
  return cloudinary.utils.verifyNotificationSignature(corpsBrut, Number(timestamp), signature);
}

/** Envoie un buffer généré côté serveur (PDF de devis/facture) — pas de signature côté client nécessaire, c'est nous qui le produisons. */
export function televerserBuffer(
  buffer: Buffer,
  params: { dossier: string; publicId: string; accesAuthentifie?: boolean; format?: string },
): Promise<{ publicId: string }> {
  return new Promise((resolve, reject) => {
    const flux = cloudinary.uploader.upload_stream(
      {
        folder: params.dossier,
        public_id: params.publicId,
        resource_type: "raw",
        overwrite: true,
        // Sans `format`, une ressource "raw" n'a aucun type de fichier
        // enregistré côté Cloudinary : le téléchargement renvoyait
        // Content-Type: application/octet-stream et un nom de fichier sans
        // extension, illisible pour la plupart des visionneuses PDF (trouvé
        // en inspectant réellement la réponse HTTP, pas en supposant).
        ...(params.format ? { format: params.format } : {}),
        ...(params.accesAuthentifie ? { access_mode: "authenticated", type: "authenticated" } : {}),
      },
      (erreur, resultat) => {
        if (erreur || !resultat) return reject(erreur ?? new Error("Échec de l'envoi vers Cloudinary"));
        resolve({ publicId: resultat.public_id });
      },
    );
    flux.end(buffer);
  });
}

/** URL signée à courte durée pour livrer un fichier privé (documents, fichiers clients). */
export function urlSigneeTemporaire(publicId: string, options?: { typeRessource?: "image" | "raw"; nomTelechargement?: string; dureeSecondes?: number }) {
  const expireLe = Math.floor(Date.now() / 1000) + (options?.dureeSecondes ?? 24 * 3600);
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: options?.typeRessource ?? "raw",
    type: "authenticated",
    expires_at: expireLe,
    // `target_filename` n'existe pas dans l'API Cloudinary — silencieusement
    // ignoré par le SDK (voir node_modules/cloudinary/lib/utils/index.js,
    // private_download_url ne signe que timestamp/public_id/format/type/
    // attachment/expires_at). Le nom de fichier se fixe en passant une
    // chaîne à `attachment` lui-même, pas via un paramètre séparé — sans ça
    // le navigateur enregistrait le PDF sous le nom générique "file", sans
    // extension ni Content-Type, illisible pour la plupart des visionneuses.
    // Le typage du SDK ne déclare que `boolean`, mais l'implémentation réelle
    // (voir commentaire ci-dessus) accepte n'importe quelle valeur et la
    // signe telle quelle — Cloudinary l'utilise comme nom de fichier.
    attachment: (options?.nomTelechargement ?? true) as unknown as boolean,
  });
}
