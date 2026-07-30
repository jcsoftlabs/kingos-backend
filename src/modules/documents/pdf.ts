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
const MARINE_CLAIR = "#DAD4EC";
const CREME = "#F8F5DF";
const BLANC = "#FFFFFF";

// Les dates d'un document financier sont ancrées au fuseau d'Haïti, jamais à
// celui du serveur : sans ça une facture émise le 24 s'imprimait « 23/07/2026 »
// selon la machine qui génère le PDF.
function formaterDateDocument(date: Date): string {
  return date.toLocaleDateString("fr-HT", { timeZone: "America/Port-au-Prince" });
}

// L'échéance d'une facture est saisie via un <input type="date"> — une date
// calendaire pure (minuit UTC, aucune heure réelle), pas un instant. La
// convertir au fuseau d'Haïti (UTC-5) la faisait reculer d'un jour. Ce n'est
// PAS le cas de dateEmission ni de l'expiration d'un devis, qui portent un
// horodatage réel : elles restent formatées par formaterDateDocument.
function formaterDateCalendaire(date: Date): string {
  return date.toLocaleDateString("fr-HT", { timeZone: "UTC" });
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
  /** Statut de la facture au moment de la génération — PAYEE/PARTIELLEMENT_PAYEE affichent un tampon. */
  statut?: string;
  /** Requis pour afficher le solde restant sur une facture PARTIELLEMENT_PAYEE. */
  payeCents?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const morceaux: Buffer[] = [];
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const { contenu } = params;
    const libelleType = params.type === "FACTURE" ? "FACTURE" : "DEVIS";

    // En-tête — logo à gauche, bloc de couleur pleine à droite avec le type de
    // document (facture/devis), à l'image des gabarits de facturation courants :
    // le type et le numéro sautent aux yeux avant même de lire le détail.
    const hautEntete = 40;
    if (existsSync(CHEMIN_LOGO)) {
      doc.image(CHEMIN_LOGO, 50, hautEntete, { height: 30 });
    } else {
      doc.fillColor(MARINE).fontSize(20).font("Helvetica-Bold").text("KINGO'S", 50, hautEntete + 4);
    }
    doc.fontSize(8.5).font("Helvetica").fillColor(GRIS).text("Design & Impression Professionnelle", 50, hautEntete + 36);

    const badgeX = 372;
    const badgeW = 190;
    const badgeH = 44;
    doc.roundedRect(badgeX, hautEntete, badgeW, badgeH, 4).fill(MAGENTA);
    doc
      .fillColor(BLANC)
      .font("Helvetica-Bold")
      .fontSize(19)
      .text(libelleType, badgeX, hautEntete + 13, { width: badgeW, align: "center" });

    let yMeta = hautEntete + badgeH + 10;
    doc.fillColor(MARINE).font("Helvetica-Bold").fontSize(10.5).text(`N° ${params.numero}`, badgeX, yMeta, { width: badgeW, align: "right" });
    yMeta += 14;
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5).text(`Date : ${formaterDateDocument(params.dateEmission)}`, badgeX, yMeta, {
      width: badgeW,
      align: "right",
    });
    if (params.dateLimite) {
      // FACTURE : dateLimite = échéance saisie via un sélecteur de date (pure
      // date calendaire). DEVIS : dateLimite = date de validité calculée à
      // partir d'un horodatage réel — les deux ne se formatent pas pareil.
      yMeta += 12;
      const dateFormatee =
        params.type === "FACTURE" ? formaterDateCalendaire(params.dateLimite.date) : formaterDateDocument(params.dateLimite.date);
      doc.text(`${params.dateLimite.libelle} : ${dateFormatee}`, badgeX, yMeta, { width: badgeW, align: "right" });
    }

    let y = Math.max(hautEntete + 36 + 12, yMeta + 14, hautEntete + 68);
    doc.moveTo(50, y).lineTo(562, y).strokeColor(MAGENTA).lineWidth(1.5).stroke();
    y += 16;

    // Émetteur (texte simple, sous le logo) / Client (encadré mis en valeur —
    // c'est le nom qu'on doit reconnaître en un coup d'œil sur le document).
    const yIdentite = y;
    doc.fillColor(GRIS).font("Helvetica-Bold").fontSize(7.5).text("ÉMIS PAR", 50, y);
    y += 12;
    doc.fillColor(MARINE).font("Helvetica-Bold").fontSize(9.5).text(contenu.emetteur.raisonSociale, 50, y, { width: 230 });
    y += 13;
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5);
    doc.text(`${contenu.emetteur.adresse}, ${contenu.emetteur.ville}`, 50, y, { width: 230 });
    y += 12;
    doc.text(contenu.emetteur.telephone, 50, y, { width: 230 });
    y += 12;
    if (contenu.emetteur.nif) {
      doc.text(`NIF : ${contenu.emetteur.nif}`, 50, y, { width: 230 });
      y += 12;
    }

    const boiteClientX = 306;
    const boiteClientW = 206;
    const boiteClientH = 84;
    doc.roundedRect(boiteClientX - 10, yIdentite - 8, boiteClientW + 20, boiteClientH, 5).fill(CREME);
    let yc = yIdentite;
    doc
      .fillColor(MAGENTA)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(params.type === "FACTURE" ? "FACTURÉ À" : "DEVIS POUR", boiteClientX, yc, { width: boiteClientW });
    yc += 13;
    doc.fillColor(MARINE).font("Helvetica-Bold").fontSize(10).text(contenu.client.entreprise || contenu.client.nom, boiteClientX, yc, {
      width: boiteClientW,
    });
    yc += 14;
    doc.fillColor(GRIS).font("Helvetica").fontSize(8.5);
    if (contenu.client.entreprise) {
      doc.text(contenu.client.nom, boiteClientX, yc, { width: boiteClientW });
      yc += 12;
    }
    doc.text(contenu.client.telephone, boiteClientX, yc, { width: boiteClientW });
    yc += 12;
    doc.text(contenu.client.email, boiteClientX, yc, { width: boiteClientW });

    y = Math.max(y, yIdentite - 8 + boiteClientH) + 14;
    doc.moveTo(50, y).lineTo(562, y).strokeColor(MARINE_CLAIR).lineWidth(1).stroke();
    y += 15;

    // Tableau des lignes — en-tête plein fond marine, lignes alternées pour
    // guider l'œil sur un devis à plusieurs lignes.
    const colonnes = { designation: 58, specs: 218, qte: 388, pu: 425, total: 495 };
    const yEnteteTableau = y;
    doc.rect(50, yEnteteTableau, 512, 20).fill(MARINE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BLANC);
    doc.text("DÉSIGNATION", colonnes.designation, yEnteteTableau + 6);
    doc.text("SPÉCIFICATIONS", colonnes.specs, yEnteteTableau + 6);
    doc.text("QTÉ", colonnes.qte, yEnteteTableau + 6);
    doc.text("PRIX UNIT.", colonnes.pu, yEnteteTableau + 6);
    doc.text("TOTAL", colonnes.total, yEnteteTableau + 6, { width: 67, align: "right" });
    y = yEnteteTableau + 20 + 8;

    let indexLigne = 0;
    for (const ligne of contenu.lignes) {
      doc.font("Helvetica").fontSize(8.5);
      const hauteurDesignation = doc.heightOfString(ligne.serviceNom, { width: 150 });
      const specsTexte = formaterSpecifications(ligne.specifications);
      const hauteurSpecs = doc.heightOfString(specsTexte, { width: 160 });
      const hauteurLigne = Math.max(hauteurDesignation, hauteurSpecs, 12) + 8;

      if (indexLigne % 2 === 1) {
        doc.rect(50, y - 3, 512, hauteurLigne).fill(CREME);
      }
      doc.fillColor(GRIS).font("Helvetica").fontSize(8.5);
      doc.text(ligne.serviceNom, colonnes.designation, y, { width: 150 });
      doc.text(specsTexte, colonnes.specs, y, { width: 160 });
      doc.text(String(ligne.quantite), colonnes.qte, y, { width: 30 });
      doc.text(formaterHTG(ligne.prixUnitaireCents), colonnes.pu, y, { width: 65 });
      doc.text(formaterHTG(ligne.totalCents), colonnes.total, y, { width: 67, align: "right" });

      y += hauteurLigne;
      indexLigne++;
    }

    doc.moveTo(50, y).lineTo(562, y).strokeColor(MARINE_CLAIR).lineWidth(1).stroke();
    y += 12;

    // Totaux — encadré crème pour le détail, barre pleine marine pour le
    // total final, qui doit rester le chiffre le plus visible de la page.
    const totalsX = 318;
    const totalsW = 194;
    const lignesTotaux: { libelle: string; valeur: string }[] = [
      { libelle: "Sous-total", valeur: formaterHTG(contenu.sousTotalCents) },
    ];
    if (Number(contenu.remiseCents) > 0) {
      lignesTotaux.push({ libelle: "Remise", valeur: `-${formaterHTG(contenu.remiseCents)}` });
    }
    if (Number(contenu.taxeCents) > 0) {
      lignesTotaux.push({ libelle: `Taxe (${contenu.taxeTauxPct}%)`, valeur: formaterHTG(contenu.taxeCents) });
    }
    const hauteurDetail = lignesTotaux.length * 15 + 12;
    doc.roundedRect(totalsX, y, totalsW, hauteurDetail, 4).fill(CREME);
    let yt = y + 8;
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    for (const l of lignesTotaux) {
      doc.text(l.libelle, totalsX + 12, yt, { width: 90 });
      doc.text(l.valeur, totalsX + 12, yt, { width: totalsW - 24, align: "right" });
      yt += 15;
    }
    y += hauteurDetail + 4;

    const hauteurTotal = 26;
    doc.rect(totalsX, y, totalsW, hauteurTotal).fill(MARINE);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BLANC);
    doc.text("TOTAL", totalsX + 12, y + 7, { width: 90 });
    doc.text(formaterHTG(contenu.totalCents), totalsX + 12, y + 7, { width: totalsW - 24, align: "right" });
    y += hauteurTotal + 14;

    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRIS);
    const enLettres = montantHTGEnLettres(BigInt(contenu.totalCents));
    doc.text(`Arrêté à la somme de : ${enLettres}.`, 50, y, { width: 512 });
    y += 24;

    // Modalités de paiement — "où et comment payer" n'a aucun sens une fois
    // la facture réglée (trouvé en relisant un PDF tamponné PAYÉ, qui
    // affichait encore les coordonnées bancaires et "paiement sur place").
    // Présenté en encart (liseré magenta) pour se distinguer du reste.
    let titrePaiement = "MODALITÉS DE PAIEMENT";
    const lignesPaiement: string[] = [];
    if (params.statut === "PAYEE") {
      titrePaiement = "PAIEMENT";
      lignesPaiement.push("Facture intégralement réglée. Merci de votre confiance !");
    } else if (params.statut === "PARTIELLEMENT_PAYEE" && params.payeCents !== undefined) {
      titrePaiement = "PAIEMENT";
      const soldeCents = (BigInt(contenu.totalCents) - BigInt(params.payeCents)).toString();
      lignesPaiement.push(`Réglé à ce jour : ${formaterHTG(params.payeCents)} — solde restant : ${formaterHTG(soldeCents)}.`);
      for (const banque of contenu.emetteur.banques) {
        lignesPaiement.push(`${banque.banque} — ${banque.titulaire} — Compte n° ${banque.numeroCompte}`);
      }
      if (contenu.emetteur.moncashNumero) lignesPaiement.push(`MonCash : ${contenu.emetteur.moncashNumero}`);
    } else {
      for (const banque of contenu.emetteur.banques) {
        lignesPaiement.push(`${banque.banque} — ${banque.titulaire} — Compte n° ${banque.numeroCompte}`);
      }
      if (contenu.emetteur.moncashNumero) lignesPaiement.push(`MonCash : ${contenu.emetteur.moncashNumero}`);
      lignesPaiement.push(`Paiement sur place : ${contenu.emetteur.adresse}, ${contenu.emetteur.ville}`);
    }

    const paddingEncart = 10;
    const hauteurEncart = paddingEncart * 2 + 13 + lignesPaiement.length * 12;
    doc.rect(50, y, 4, hauteurEncart).fill(MAGENTA);
    doc.rect(54, y, 508, hauteurEncart).fill(CREME);
    let yp = y + paddingEncart;
    doc.fillColor(MARINE).font("Helvetica-Bold").fontSize(9).text(titrePaiement, 66, yp);
    yp += 14;
    doc.font("Helvetica").fontSize(8.5).fillColor(GRIS);
    for (const l of lignesPaiement) {
      doc.text(l, 66, yp, { width: 480 });
      yp += 12;
    }
    y += hauteurEncart + 12;

    doc.font("Helvetica").fontSize(7.5).fillColor(GRIS).text(contenu.conditions, 50, y, { width: 512 });

    // Pied de page — à 700pt, nettement sous le seuil de débordement (marge
    // basse par défaut de pdfkit à 742pt sur une page Letter de 792pt).
    // Trouvé en relisant le PDF réellement généré : à 740pt le pied de page
    // basculait tout seul sur une seconde page blanche.
    doc.moveTo(50, 700).lineTo(562, 700).strokeColor(MAGENTA).lineWidth(1).stroke();
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(GRIS)
      .text(`${contenu.emetteur.adresse}, ${contenu.emetteur.ville}   •   ${contenu.emetteur.telephone}   •   ${contenu.emetteur.email}`, 50, 708, {
        width: 512,
        align: "center",
      });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MARINE).text(contenu.emetteur.raisonSociale, 50, 720, { width: 512, align: "center" });

    // Tampon "PAYÉ" / "PARTIELLEMENT PAYÉ" — dessiné en dernier, par-dessus
    // le reste, pour rester visible quelle que soit la longueur du contenu
    // au-dessus. Deux couleurs distinctes : le rouge de PAYÉ suggérerait à
    // tort qu'il ne reste rien à régler sur une facture partielle.
    // Zone dégagée à mi-page (sous l'encadré client, au-dessus du pied de
    // page) — l'en-tête plus haut de ce gabarit ne laisse plus de place libre
    // vers le haut de la page comme dans l'ancien tampon.
    if (params.statut === "PAYEE") {
      const ROUGE = "#C41E3A";
      doc.save();
      doc.rotate(-18, { origin: [430, 540] });
      doc
        .lineWidth(3)
        .strokeColor(ROUGE)
        .roundedRect(340, 515, 180, 50, 6)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(27)
        .fillColor(ROUGE)
        .text("PAYÉ", 340, 529, { width: 180, align: "center" });
      doc.restore();
    } else if (params.statut === "PARTIELLEMENT_PAYEE") {
      const AMBRE = "#B45F06";
      doc.save();
      doc.rotate(-18, { origin: [430, 540] });
      doc
        .lineWidth(3)
        .strokeColor(AMBRE)
        .roundedRect(310, 513, 240, 54, 6)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(16.5)
        .fillColor(AMBRE)
        .text("PARTIELLEMENT PAYÉ", 310, 533, { width: 240, align: "center" });
      doc.restore();
    }

    doc.end();
  });
}
