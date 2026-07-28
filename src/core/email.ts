import { Resend } from "resend";
import { env } from "./env.js";
import { journal } from "./journalisation.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface EnvoiEmail {
  destinataire: string;
  sujet: string;
  html: string;
  piecesJointes?: { nomFichier: string; contenu: Buffer }[];
}

/**
 * Envoi d'e-mail transactionnel. Sans RESEND_API_KEY configuré (dev, ou
 * avant que le domaine kingos.ht soit vérifié), l'envoi est journalisé au
 * lieu d'échouer — un e-mail qui ne part pas ne doit jamais faire tomber
 * la commande, le devis ou le paiement qui le déclenche (plan §13).
 */
export async function envoyerEmail(params: EnvoiEmail): Promise<{ envoye: boolean; id?: string }> {
  if (!resend) {
    journal.info(
      { destinataire: params.destinataire, sujet: params.sujet, piecesJointes: params.piecesJointes?.map((p) => p.nomFichier) },
      "E-mail non envoyé — RESEND_API_KEY absent",
    );
    return { envoye: false };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_EXPEDITEUR,
      to: params.destinataire,
      subject: params.sujet,
      html: params.html,
      attachments: params.piecesJointes?.map((p) => ({ filename: p.nomFichier, content: p.contenu })),
    });

    if (error) {
      journal.error({ erreur: error, destinataire: params.destinataire }, "Échec d'envoi e-mail");
      return { envoye: false };
    }

    return { envoye: true, id: data?.id };
  } catch (erreur) {
    journal.error({ erreur, destinataire: params.destinataire }, "Exception lors de l'envoi e-mail");
    return { envoye: false };
  }
}

function enveloppe(titre: string, corpsHtml: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A124B">
      <div style="background:#1A124B;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">KINGO'S</h1>
      </div>
      <div style="padding:24px;background:#fff">
        <h2 style="font-size:18px;margin-top:0">${titre}</h2>
        ${corpsHtml}
      </div>
      <div style="padding:16px 24px;background:#F8F5DF;font-size:12px;color:#5F4EA0;text-align:center">
        Kingo's — Design &amp; Impression Professionnelle
      </div>
    </div>
  `;
}

export async function envoyerConfirmationCommande(params: { destinataire: string; numero: string; nomContact: string }) {
  return envoyerEmail({
    destinataire: params.destinataire,
    sujet: `Commande ${params.numero} reçue — Kingo's`,
    html: enveloppe(
      "Commande reçue",
      `<p>Bonjour ${params.nomContact},</p>
       <p>Votre commande <strong>${params.numero}</strong> a bien été enregistrée. Nous revenons vers vous rapidement.</p>`,
    ),
  });
}

export async function envoyerDevisEmis(params: {
  destinataire: string;
  numero: string;
  nomContact: string;
  totalFormate: string;
  expireLe: string;
  pdf?: Buffer;
}) {
  return envoyerEmail({
    destinataire: params.destinataire,
    sujet: `Votre devis ${params.numero} — Kingo's`,
    html: enveloppe(
      "Votre devis est prêt",
      `<p>Bonjour ${params.nomContact},</p>
       <p>Le devis <strong>${params.numero}</strong> d'un montant de <strong>${params.totalFormate}</strong> est disponible.
       Il est valable jusqu'au ${params.expireLe}.</p>`,
    ),
    piecesJointes: params.pdf ? [{ nomFichier: `${params.numero}.pdf`, contenu: params.pdf }] : undefined,
  });
}

export async function envoyerFactureEmise(params: {
  destinataire: string;
  numero: string;
  nomContact: string;
  totalFormate: string;
  pdf?: Buffer;
}) {
  return envoyerEmail({
    destinataire: params.destinataire,
    sujet: `Facture ${params.numero} — Kingo's`,
    html: enveloppe(
      "Facture émise",
      `<p>Bonjour ${params.nomContact},</p>
       <p>La facture <strong>${params.numero}</strong> d'un montant de <strong>${params.totalFormate}</strong> vous a été émise.</p>`,
    ),
    piecesJointes: params.pdf ? [{ nomFichier: `${params.numero}.pdf`, contenu: params.pdf }] : undefined,
  });
}

export async function envoyerPaiementConfirme(params: { destinataire: string; numeroFacture: string; nomContact: string; montantFormate: string }) {
  return envoyerEmail({
    destinataire: params.destinataire,
    sujet: `Paiement reçu — Facture ${params.numeroFacture} — Kingo's`,
    html: enveloppe(
      "Paiement confirmé",
      `<p>Bonjour ${params.nomContact},</p>
       <p>Nous confirmons la réception de votre paiement de <strong>${params.montantFormate}</strong>
       pour la facture <strong>${params.numeroFacture}</strong>. Merci !</p>`,
    ),
  });
}

export async function envoyerMessageContact(params: { nomExpediteur: string; emailExpediteur: string; sujetMessage: string; message: string }) {
  return envoyerEmail({
    destinataire: process.env.EMAIL_ADMIN ?? env.EMAIL_ADMIN,
    sujet: `[Contact] ${params.sujetMessage}`,
    html: enveloppe(
      "Nouveau message de contact",
      `<p><strong>De :</strong> ${params.nomExpediteur} (${params.emailExpediteur})</p>
       <p><strong>Sujet :</strong> ${params.sujetMessage}</p>
       <p>${params.message.replace(/\n/g, "<br>")}</p>`,
    ),
  });
}
