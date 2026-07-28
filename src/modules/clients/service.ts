import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve } from "../../core/erreurs.js";

/**
 * Un « client » n'est pas forcément un compte : une commande peut être passée
 * sans inscription (Commande.utilisateurId est optionnel, plan §6.1). L'identité
 * commerciale stable est donc l'e-mail de contact — c'est lui qu'on agrège ici,
 * en rattachant le compte Utilisateur quand il existe.
 */

const STATUTS_MORTS = ["ANNULEE", "BROUILLON"] as const;

export interface ClientResume extends Record<string, unknown> {
  email: string;
  nom: string;
  entreprise: string | null;
  typeClient: string;
  telephone: string;
  utilisateurId: string | null;
  nbCommandes: number;
  caRegleCents: bigint;
  impayeCents: bigint;
  derniereCommandeLe: Date;
  premiereCommandeLe: Date;
}

export async function listerClients(options: { recherche?: string; page?: number; taille?: number } = {}) {
  const taille = options.taille ?? 25;
  const page = Math.max(1, options.page ?? 1);

  const filtreRecherche = options.recherche
    ? {
        OR: [
          { emailContact: { contains: options.recherche, mode: "insensitive" as const } },
          { nomContact: { contains: options.recherche, mode: "insensitive" as const } },
          { entreprise: { contains: options.recherche, mode: "insensitive" as const } },
          { telContact: { contains: options.recherche } },
        ],
      }
    : {};

  // Une commande par e-mail suffit à établir la liste ; les agrégats sont
  // ensuite calculés par e-mail sur la page courante uniquement.
  const groupes = await db.commande.groupBy({
    by: ["emailContact"],
    where: { statut: { notIn: [...STATUTS_MORTS] }, ...filtreRecherche },
    _count: { _all: true },
    _max: { creeLe: true },
    _min: { creeLe: true },
    orderBy: { _max: { creeLe: "desc" } },
    skip: (page - 1) * taille,
    take: taille,
  });

  const total = (
    await db.commande.groupBy({
      by: ["emailContact"],
      where: { statut: { notIn: [...STATUTS_MORTS] }, ...filtreRecherche },
    })
  ).length;

  const emails = groupes.map((g) => g.emailContact);
  if (emails.length === 0) {
    return { clients: [] as ClientResume[], meta: { page, taille, total, pages: 0 } };
  }

  const [dernieresCommandes, factures] = await Promise.all([
    // La fiche d'identité la plus récente l'emporte : un client qui change de
    // téléphone ou de raison sociale ne doit pas rester figé sur sa 1re commande.
    db.commande.findMany({
      where: { emailContact: { in: emails } },
      orderBy: { creeLe: "desc" },
      distinct: ["emailContact"],
      select: { emailContact: true, nomContact: true, entreprise: true, typeClient: true, telContact: true, utilisateurId: true },
    }),
    db.facture.findMany({
      where: { commande: { emailContact: { in: emails } } },
      select: { statut: true, totalCents: true, payeCents: true, commande: { select: { emailContact: true } } },
    }),
  ]);

  const identites = new Map(dernieresCommandes.map((c) => [c.emailContact, c]));
  const montants = new Map<string, { regle: bigint; impaye: bigint }>();
  for (const f of factures) {
    const cle = f.commande.emailContact;
    const courant = montants.get(cle) ?? { regle: 0n, impaye: 0n };
    courant.regle += f.payeCents;
    if (f.statut !== "PAYEE" && f.statut !== "ANNULEE") courant.impaye += f.totalCents - f.payeCents;
    montants.set(cle, courant);
  }

  const clients: ClientResume[] = groupes.map((g) => {
    const identite = identites.get(g.emailContact);
    const montant = montants.get(g.emailContact) ?? { regle: 0n, impaye: 0n };
    return {
      email: g.emailContact,
      nom: identite?.nomContact ?? g.emailContact,
      entreprise: identite?.entreprise ?? null,
      typeClient: identite?.typeClient ?? "PARTICULIER",
      telephone: identite?.telContact ?? "",
      utilisateurId: identite?.utilisateurId ?? null,
      nbCommandes: g._count._all,
      caRegleCents: montant.regle,
      impayeCents: montant.impaye,
      derniereCommandeLe: g._max.creeLe ?? new Date(0),
      premiereCommandeLe: g._min.creeLe ?? new Date(0),
    };
  });

  return { clients, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
}

export async function obtenirClient(email: string) {
  const commandes = await db.commande.findMany({
    where: { emailContact: email },
    orderBy: { creeLe: "desc" },
    select: {
      id: true,
      numero: true,
      statut: true,
      totalCents: true,
      creeLe: true,
      lignes: { select: { serviceNom: true, quantite: true } },
    },
  });

  if (commandes.length === 0) throw new ErreurNonTrouve("Client", email);

  const [identite, factures, devis] = await Promise.all([
    db.commande.findFirst({
      where: { emailContact: email },
      orderBy: { creeLe: "desc" },
      select: {
        nomContact: true,
        entreprise: true,
        typeClient: true,
        telContact: true,
        adresseLivraison: true,
        utilisateurId: true,
        utilisateur: { select: { id: true, email: true, creeLe: true, derniereConnexion: true } },
      },
    }),
    db.facture.findMany({
      where: { commande: { emailContact: email } },
      orderBy: { creeLe: "desc" },
      select: { id: true, numero: true, statut: true, totalCents: true, payeCents: true, creeLe: true },
    }),
    db.devis.findMany({
      where: { commande: { emailContact: email } },
      orderBy: { creeLe: "desc" },
      select: { id: true, numero: true, statut: true, totalCents: true, creeLe: true, expireLe: true },
    }),
  ]);

  const caRegleCents = factures.reduce((acc, f) => acc + f.payeCents, 0n);
  const impayeCents = factures
    .filter((f) => f.statut !== "PAYEE" && f.statut !== "ANNULEE")
    .reduce((acc, f) => acc + (f.totalCents - f.payeCents), 0n);

  const commandesVivantes = commandes.filter((c) => !STATUTS_MORTS.includes(c.statut as never));

  return {
    email,
    nom: identite?.nomContact ?? email,
    entreprise: identite?.entreprise ?? null,
    typeClient: identite?.typeClient ?? "PARTICULIER",
    telephone: identite?.telContact ?? "",
    adresseLivraison: identite?.adresseLivraison ?? null,
    compte: identite?.utilisateur ?? null,
    stats: {
      nbCommandes: commandesVivantes.length,
      caRegleCents,
      impayeCents,
      panierMoyenCents:
        commandesVivantes.length > 0
          ? commandesVivantes.reduce((acc, c) => acc + c.totalCents, 0n) / BigInt(commandesVivantes.length)
          : 0n,
      premiereCommandeLe: commandes[commandes.length - 1]?.creeLe ?? null,
      derniereCommandeLe: commandes[0]?.creeLe ?? null,
    },
    commandes,
    factures,
    devis,
  };
}

export const schemaModificationClient = z.object({
  nomContact: z.string().min(1).optional(),
  telContact: z.string().min(1).optional(),
  entreprise: z.string().nullable().optional(),
  typeClient: z.enum(["PARTICULIER", "ENTREPRISE", "ONG", "INSTITUTION_ETATIQUE"]).optional(),
  adresseLivraison: z.string().nullable().optional(),
});

/**
 * « Le client » n'est pas une ligne en base — c'est un agrégat par e-mail
 * (voir l'en-tête du fichier). Modifier ses coordonnées revient donc à
 * corriger la commande la plus récente : c'est elle qui fait autorité pour
 * l'identité affichée (listerClients/obtenirClient trient toujours par
 * creeLe desc). Les commandes plus anciennes gardent leurs coordonnées
 * d'origine, qui restent un instantané valide de la commande à l'époque.
 */
export async function modifierClient(email: string, entree: z.infer<typeof schemaModificationClient>, acteur: { id: string; role: string }) {
  const derniereCommande = await db.commande.findFirst({ where: { emailContact: email }, orderBy: { creeLe: "desc" } });
  if (!derniereCommande) throw new ErreurNonTrouve("Client", email);

  await db.$transaction([
    db.commande.update({ where: { id: derniereCommande.id }, data: entree }),
    db.journalAudit.create({
      data: {
        acteurId: acteur.id,
        acteurRole: acteur.role as never,
        action: "CLIENT_MODIFIE",
        entite: "Client",
        entiteId: email,
        apres: entree as never,
      },
    }),
  ]);

  return obtenirClient(email);
}
