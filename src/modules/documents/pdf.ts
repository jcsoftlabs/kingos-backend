import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { montantHTGEnLettres } from "../../core/montant-en-lettres.js";

// dist/modules/documents/pdf.js → ../../../assets/logo.png (voir Dockerfile,
// qui copie assets/ à côté de dist/ dans l'image de production).
const CHEMIN_LOGO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets", "logo.png");

interface LigneContenu {
  serviceNom: string;
  specifications: Record<string, unknown>;
  quantite: number;
  prixUnitaireCents: string;
  totalCents: string;
}

interface ContenuDocument {
  emetteur: {
    raisonSociale: string;
    adresse: string;
    ville: string;
    telephone: string;
    email: string;
    nif?: string | null;
    banques: { banque: string; titulaire: string; numeroCompte: string; type?: string }[];
    moncashNumero?: string | null;
  };
  client: { nom: string; email: string; telephone: string; entreprise?: string | null };
  lignes: LigneContenu[];
  sousTotalCents: string;
  remiseCents: string;
  fraisLivraisonCents?: string;
  taxeTauxPct: string;
  taxeCents: string;
  totalCents: string;
  conditions: string;
}

const MARINE = "#1A124B";
const MAGENTA = "#E6008C";
const GRIS = "#5F4EA0";

// Les dates d'un document financier sont ancrées au fuseau d'Haïti, jamais à
// celui du serveur : sans ça une facture émise le 24 s'imprimait « 23/07/2026 »
// selon la machine qui génère le PDF.
function formaterDateDocument(date: Date): string {
  return date.toLocaleDateString("fr-HT", { timeZone: "America/Port-au-Prince" });
}

function formaterHTG(centimesTexte: string): string {
  // Intl.NumberFormat("fr-HT", ...) insère U+202F (espace fine insécable) et
  // U+00A0 (espace insécable) — absents de l'encodage WinAnsi qu'utilisent
  // les polices standard de pdfkit (Helvetica). Résultat sans ce correctif :
  // "23 360 G" s'affichait "23 /360 G" dans le PDF généré, trouvé en relisant
  // le PDF produit, pas en supposant que le formatage HTML se comporterait
  // pareil une fois rendu par une police PDF standard.
  const montant = Number(centimesTexte) / 100;
  const decimales = Number(centimesTexte) % 100 === 0 ? 0 : 2;
  const formate = new Intl.NumberFormat("fr-HT", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(montant);
  return `${formate.replace(/[  ]/g, " ")} HTG`;
}

function formaterSpecifications(specs: Record<string, unknown>): string {
  const parties: string[] = [];
  if (specs.largeurPouces && specs.hauteurPouces) {
    parties.push(`${specs.largeurPouces}" × ${specs.hauteurPouces}"`);
  }
  const options = specs.optionsChoisies as Record<string, string> | undefined;
  if (options) {
    for (const valeur of Object.values(options)) {
      if (valeur) parties.push(String(valeur));
    }
  }
  return parties.join(", ");
}

/**
 * Gabarit PDF devis/facture (plan §7.4) — construit exclusivement à partir de
 * l'instantané `contenu` figé au moment de l'émission, jamais d'une relecture
 * du catalogue ou de la commande : le document reste explicable même si les
 * tarifs ou les coordonnées de l'entreprise changent ensuite.
 */
export function genererPdfDocument(params: {
  type: "DEVIS" | "FACTURE";
  numero: string;
  dateEmission: Date;
  dateLimite: { libelle: string; date: Date } | null;
  contenu: ContenuDocument;
  /** Statut de la facture au moment de la génération — "PAYEE" affiche le tampon PAYÉ. */
  statut?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const morceaux: Buffer[] = [];
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const { contenu } = params;

    // En-tête — logo réel plutôt que le nom en texte, plus fidèle à l'identité
    // visuelle sur un document envoyé au client (devis, facture, reçu).
    if (existsSync(CHEMIN_LOGO)) {
      doc.image(CHEMIN_LOGO, 50, 45, { height: 32 });
    } else {
      doc.fillColor(MARINE).fontSize(20).font("Helvetica-Bold").text("KINGO'S", 50, 50);
    }
    doc.fontSize(9).font("Helvetica").fillColor(GRIS).text("Design & Impression Professionnelle", 50, 82);

    doc
      .fillColor(MARINE)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(`${params.type} N° ${params.numero}`, 300, 50, { align: "right", width: 262 });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(GRIS)
      .text(`Date : ${formaterDateDocument(params.dateEmission)}`, 300, 72, { align: "right", width: 262 });
    if (params.dateLimite) {
      doc.text(`${params.dateLimite.libelle} : ${formaterDateDocument(params.dateLimite.date)}`, 300, 86, {
        align: "right",
        width: 262,
      });
    }

    doc.moveTo(50, 110).lineTo(562, 110).strokeColor(MAGENTA).lineWidth(1.5).stroke();

    // Émetteur / Client
    let y = 125;
    doc.fillColor(MARINE).fontSize(9).font("Helvetica-Bold").text("ÉMETTEUR", 50, y);
    doc.fillColor(MARINE).fontSize(9).font("Helvetica-Bold").text("CLIENT", 306, y);
    y += 14;
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    doc.text(contenu.emetteur.raisonSociale, 50, y, { width: 240 });
    doc.text(contenu.client.entreprise || contenu.client.nom, 306, y, { width: 240 });
    y += 13;
    doc.text(`${contenu.emetteur.adresse}, ${contenu.emetteur.ville}`, 50, y, { width: 240 });
    doc.text(contenu.client.entreprise ? contenu.client.nom : contenu.client.email, 306, y, { width: 240 });
    y += 13;
    doc.text(contenu.emetteur.telephone, 50, y, { width: 240 });
    doc.text(contenu.client.telephone, 306, y, { width: 240 });
    y += 13;
    if (contenu.emetteur.nif) {
      doc.text(`NIF : ${contenu.emetteur.nif}`, 50, y, { width: 240 });
    }
    doc.text(contenu.client.email, 306, y, { width: 240 });

    y += 30;
    doc.moveTo(50, y).lineTo(562, y).strokeColor("#DAD4EC").lineWidth(1).stroke();
    y += 15;

    // Tableau des lignes
    const colonnes = { designation: 50, specs: 210, qte: 380, pu: 420, total: 490 };
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MARINE);
    doc.text("DÉSIGNATION", colonnes.designation, y);
    doc.text("SPÉCIFICATIONS", colonnes.specs, y);
    doc.text("QTÉ", colonnes.qte, y);
    doc.text("P.U. HTG", colonnes.pu, y);
    doc.text("TOTAL", colonnes.total, y);
    y += 12;
    doc.moveTo(50, y).lineTo(562, y).strokeColor(MARINE).lineWidth(0.5).stroke();
    y += 8;

    doc.font("Helvetica").fontSize(8.5).fillColor(GRIS);
    for (const ligne of contenu.lignes) {
      const hauteurDesignation = doc.heightOfString(ligne.serviceNom, { width: 155 });
      const specsTexte = formaterSpecifications(ligne.specifications);
      const hauteurSpecs = doc.heightOfString(specsTexte, { width: 165 });
      const hauteurLigne = Math.max(hauteurDesignation, hauteurSpecs, 12) + 6;

      doc.text(ligne.serviceNom, colonnes.designation, y, { width: 155 });
      doc.text(specsTexte, colonnes.specs, y, { width: 165 });
      doc.text(String(ligne.quantite), colonnes.qte, y, { width: 35 });
      doc.text(formaterHTG(ligne.prixUnitaireCents), colonnes.pu, y, { width: 65 });
      doc.text(formaterHTG(ligne.totalCents), colonnes.total, y, { width: 72 });

      y += hauteurLigne;
    }

    y += 5;
    doc.moveTo(50, y).lineTo(562, y).strokeColor("#DAD4EC").lineWidth(1).stroke();
    y += 12;

    // Totaux
    // Colonne des valeurs assez large pour "169 812,50 HTG" : à 72pt le
    // total avec centimes repassait à la ligne, "HTG" seul en dessous.
    const xLabel = 330;
    const xVal = 432;
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    doc.text("Sous-total", xLabel, y, { width: 100 });
    doc.text(formaterHTG(contenu.sousTotalCents), xVal, y, { width: 130, align: "right" });
    y += 14;
    if (Number(contenu.remiseCents) > 0) {
      doc.text("Remise", xLabel, y, { width: 100 });
      doc.text(`-${formaterHTG(contenu.remiseCents)}`, xVal, y, { width: 130, align: "right" });
      y += 14;
    }
    if (Number(contenu.taxeCents) > 0) {
      doc.text(`Taxe (${contenu.taxeTauxPct}%)`, xLabel, y, { width: 100 });
      doc.text(formaterHTG(contenu.taxeCents), xVal, y, { width: 130, align: "right" });
      y += 14;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(MARINE);
    doc.text("TOTAL", xLabel, y, { width: 100 });
    doc.text(formaterHTG(contenu.totalCents), xVal, y, { width: 130, align: "right" });
    y += 20;

    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRIS);
    const enLettres = montantHTGEnLettres(BigInt(contenu.totalCents));
    doc.text(`Arrêté à la somme de : ${enLettres}.`, 50, y, { width: 512 });
    y += 25;

    doc.moveTo(50, y).lineTo(562, y).strokeColor(MAGENTA).lineWidth(1.5).stroke();
    y += 14;

    // Modalités de paiement
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MARINE).text("MODALITÉS DE PAIEMENT", 50, y);
    y += 14;
    doc.font("Helvetica").fontSize(8.5).fillColor(GRIS);
    for (const banque of contenu.emetteur.banques) {
      doc.text(`${banque.banque} — ${banque.titulaire} — Compte n° ${banque.numeroCompte}`, 50, y);
      y += 12;
    }
    if (contenu.emetteur.moncashNumero) {
      doc.text(`MonCash : ${contenu.emetteur.moncashNumero}`, 50, y);
      y += 12;
    }
    doc.text(`Paiement sur place : ${contenu.emetteur.adresse}, ${contenu.emetteur.ville}`, 50, y);
    y += 20;

    doc.font("Helvetica").fontSize(7.5).fillColor(GRIS).text(contenu.conditions, 50, y, { width: 512 });

    // Pied de page — à 715pt, nettement sous le seuil de débordement
    // (marge basse par défaut de pdfkit à 742pt sur une page Letter de
    // 792pt). Trouvé en relisant le PDF réellement généré : à 740pt le
    // pied de page basculait tout seul sur une seconde page blanche.
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(GRIS)
      .text(
        `${contenu.emetteur.raisonSociale} — ${contenu.emetteur.telephone} — ${contenu.emetteur.email}`,
        50,
        715,
        { width: 512, align: "center" },
      );

    // Tampon "PAYÉ" — facture réglée intégralement (statut PAYEE). Dessiné en
    // dernier, par-dessus le reste, pour rester visible quelle que soit la
    // longueur du contenu au-dessus.
    if (params.statut === "PAYEE") {
      const ROUGE = "#C41E3A";
      doc.save();
      doc.rotate(-18, { origin: [430, 175] });
      doc
        .lineWidth(3)
        .strokeColor(ROUGE)
        .roundedRect(340, 150, 180, 50, 6)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(27)
        .fillColor(ROUGE)
        .text("PAYÉ", 340, 164, { width: 180, align: "center" });
      doc.restore();
    }

    doc.end();
  });
}
