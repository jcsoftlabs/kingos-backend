import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";
import { dossiersCloudinary, televerserBuffer, urlSigneeTemporaire } from "../../core/cloudinary.js";
import { genererPdfDocument } from "./pdf.js";

/**
 * Génère le PDF s'il n'existe pas encore (idempotent — un devis/facture est
 * immuable une fois émis, donc le PDF ne change jamais après coup), l'envoie
 * sur Cloudinary en `raw`/`authenticated`, et renvoie une URL de téléchargement
 * signée à courte durée. Jamais d'URL publique devinable pour un document
 * financier.
 */
export async function obtenirUrlPdfDevis(numero: string): Promise<string> {
  const devis = await db.devis.findUnique({ where: { numero } });
  if (!devis) throw new ErreurNonTrouve("Devis", numero);

  let publicId = devis.pdfPublicId;
  if (!publicId) {
    const buffer = await genererPdfDocument({
      type: "DEVIS",
      numero: devis.numero,
      dateEmission: devis.envoyeLe ?? devis.creeLe,
      dateLimite: { libelle: "Valable jusqu'au", date: devis.expireLe },
      contenu: devis.contenu as never,
    });
    const televerse = await televerserBuffer(buffer, {
      dossier: dossiersCloudinary.documents("devis"),
      publicId: devis.numero,
      accesAuthentifie: true,
      format: "pdf",
    });
    publicId = televerse.publicId;
    await db.devis.update({ where: { id: devis.id }, data: { pdfPublicId: publicId } });
  }

  return urlSigneeTemporaire(publicId, { typeRessource: "raw", nomTelechargement: devis.numero, dureeSecondes: 300 });
}

export async function obtenirUrlPdfFacture(numero: string): Promise<string> {
  const facture = await db.facture.findUnique({ where: { numero } });
  if (!facture) throw new ErreurNonTrouve("Facture", numero);

  let publicId = facture.pdfPublicId;
  if (!publicId) {
    const buffer = await genererPdfDocument({
      type: "FACTURE",
      numero: facture.numero,
      dateEmission: facture.envoyeeLe ?? facture.creeLe,
      dateLimite: facture.echeanceLe ? { libelle: "Échéance", date: facture.echeanceLe } : null,
      contenu: facture.contenu as never,
      statut: facture.statut,
      payeCents: facture.payeCents.toString(),
    });
    const televerse = await televerserBuffer(buffer, {
      dossier: dossiersCloudinary.documents("factures"),
      publicId: facture.numero,
      accesAuthentifie: true,
      format: "pdf",
    });
    publicId = televerse.publicId;
    await db.facture.update({ where: { id: facture.id }, data: { pdfPublicId: publicId } });
  }

  return urlSigneeTemporaire(publicId, { typeRessource: "raw", nomTelechargement: facture.numero, dureeSecondes: 300 });
}

/** Génère le buffer PDF sans passer par Cloudinary — utilisé pour l'attacher directement à l'e-mail. */
export async function genererBufferPdfDevis(devisId: string): Promise<Buffer> {
  const devis = await db.devis.findUniqueOrThrow({ where: { id: devisId } });
  return genererPdfDocument({
    type: "DEVIS",
    numero: devis.numero,
    dateEmission: devis.envoyeLe ?? devis.creeLe,
    dateLimite: { libelle: "Valable jusqu'au", date: devis.expireLe },
    contenu: devis.contenu as never,
  });
}

export async function genererBufferPdfFacture(factureId: string): Promise<Buffer> {
  const facture = await db.facture.findUniqueOrThrow({ where: { id: factureId } });
  return genererPdfDocument({
    type: "FACTURE",
    numero: facture.numero,
    dateEmission: facture.envoyeeLe ?? facture.creeLe,
    dateLimite: facture.echeanceLe ? { libelle: "Échéance", date: facture.echeanceLe } : null,
    contenu: facture.contenu as never,
    statut: facture.statut,
    payeCents: facture.payeCents.toString(),
  });
}
