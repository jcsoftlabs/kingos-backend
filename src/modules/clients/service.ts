import { z } from "zod";
import { db } from "../../core/db.js";
import { ErreurNonTrouve, ErreurConflit } from "../../core/erreurs.js";

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
  derniereCommandeLe: Date | null;
  premiereCommandeLe: Date | null;
}

export async function listerClients(options: { recherche?: string; page?: number; taille?: number } = {}) {
  const taille = options.taille ?? 25;
  const page = Math.max(1, options.page ?? 1);

  const filtreRechercheCommande = options.recherche
    ? {
        OR: [
          { emailContact: { contains: options.recherche, mode: "insensitive" as const } },
          { nomContact: { contains: options.recherche, mode: "insensitive" as const } },
          { entreprise: { contains: options.recherche, mode: "insensitive" as const } },
          { telContact: { contains: options.recherche } },
        ],
      }
    : {};

  const filtreRechercheClient = options.recherche
    ? {
        OR: [
          { email: { contains: options.recherche, mode: "insensitive" as const } },
          { nomContact: { contains: options.recherche, mode: "insensitive" as const } },
          { entreprise: { contains: options.recherche, mode: "insensitive" as const } },
          { telContact: { contains: options.recherche } },
        ],
      }
    : {};

  // Deux sources d'identité fusionnées par e-mail : les commandes passées
  // (comme avant) et les fiches Client créées à la main ou importées en CSV
  // pour un client qui n'a encore jamais commandé (migration d'un fichier
  // client existant avant le CRM, cf. modèle Client dans le schéma).
  const [groupes, fichesClient] = await Promise.all([
    db.commande.groupBy({
      by: ["emailContact"],
      where: { statut: { notIn: [...STATUTS_MORTS] }, ...filtreRechercheCommande },
      _count: { _all: true },
      _max: { creeLe: true },
      _min: { creeLe: true },
    }),
    db.client.findMany({ where: filtreRechercheClient }),
  ]);

  const emailsAvecCommande = new Set(groupes.map((g) => g.emailContact));
  const fichesSansCommande = fichesClient.filter((c) => !emailsAvecCommande.has(c.email));

  const entrees = [
    ...groupes.map((g) => ({ email: g.emailContact, dateActivite: g._max.creeLe ?? new Date(0) })),
    ...fichesSansCommande.map((c) => ({ email: c.email, dateActivite: c.majLe })),
  ];
  entrees.sort((a, b) => b.dateActivite.getTime() - a.dateActivite.getTime());

  const total = entrees.length;
  const pageEntrees = entrees.slice((page - 1) * taille, (page - 1) * taille + taille);
  const emails = pageEntrees.map((e) => e.email);

  if (emails.length === 0) {
    return { clients: [] as ClientResume[], meta: { page, taille, total, pages: Math.ceil(total / taille) } };
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

  const fichesParEmail = new Map(fichesClient.map((c) => [c.email, c]));
  const identitesCommande = new Map(dernieresCommandes.map((c) => [c.emailContact, c]));
  const datesParEmail = new Map(groupes.map((g) => [g.emailContact, { max: g._max.creeLe, min: g._min.creeLe }]));
  const compteurCommandes = new Map(groupes.map((g) => [g.emailContact, g._count._all]));
  const montants = new Map<string, { regle: bigint; impaye: bigint }>();
  for (const f of factures) {
    const cle = f.commande.emailContact;
    const courant = montants.get(cle) ?? { regle: 0n, impaye: 0n };
    courant.regle += f.payeCents;
    if (f.statut !== "PAYEE" && f.statut !== "ANNULEE") courant.impaye += f.totalCents - f.payeCents;
    montants.set(cle, courant);
  }

  const clients: ClientResume[] = pageEntrees.map(({ email }) => {
    // La fiche Client (créée/importée à la main) fait autorité sur l'identité
    // quand elle existe — c'est un choix explicite de l'admin, plus fiable
    // qu'un instantané passif capturé sur une commande.
    const fiche = fichesParEmail.get(email);
    const identite = identitesCommande.get(email);
    const montant = montants.get(email) ?? { regle: 0n, impaye: 0n };
    const dates = datesParEmail.get(email);
    return {
      email,
      nom: fiche?.nomContact ?? identite?.nomContact ?? email,
      entreprise: fiche?.entreprise ?? identite?.entreprise ?? null,
      typeClient: fiche?.typeClient ?? identite?.typeClient ?? "PARTICULIER",
      telephone: fiche?.telContact ?? identite?.telContact ?? "",
      utilisateurId: identite?.utilisateurId ?? null,
      nbCommandes: compteurCommandes.get(email) ?? 0,
      caRegleCents: montant.regle,
      impayeCents: montant.impaye,
      derniereCommandeLe: dates?.max ?? null,
      premiereCommandeLe: dates?.min ?? null,
    };
  });

  return { clients, meta: { page, taille, total, pages: Math.ceil(total / taille) } };
}

export async function obtenirClient(email: string) {
  const [commandes, fiche] = await Promise.all([
    db.commande.findMany({
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
    }),
    db.client.findUnique({ where: { email } }),
  ]);

  if (commandes.length === 0 && !fiche) throw new ErreurNonTrouve("Client", email);

  const [identite, factures, devis] = await Promise.all([
    commandes.length > 0
      ? db.commande.findFirst({
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
        })
      : null,
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
    // La fiche Client (créée/importée) fait autorité sur l'identité quand
    // elle existe, sinon on retombe sur le dernier instantané de commande.
    nom: fiche?.nomContact ?? identite?.nomContact ?? email,
    entreprise: fiche?.entreprise ?? identite?.entreprise ?? null,
    typeClient: fiche?.typeClient ?? identite?.typeClient ?? "PARTICULIER",
    telephone: fiche?.telContact ?? identite?.telContact ?? "",
    adresseLivraison: fiche?.adresseLivraison ?? identite?.adresseLivraison ?? null,
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

export const schemaCreationClient = z.object({
  email: z.string().email(),
  nomContact: z.string().min(1),
  telContact: z.string().min(1),
  entreprise: z.string().nullable().optional(),
  typeClient: z.enum(["PARTICULIER", "ENTREPRISE", "ONG", "INSTITUTION_ETATIQUE"]).optional(),
  adresseLivraison: z.string().nullable().optional(),
});

/**
 * Entrer un client en base sans qu'il ait jamais commandé — cas d'usage
 * central : migrer la liste de clients que l'entreprise avait déjà avant le
 * CRM. Rejette un e-mail déjà connu (fiche Client ou commande existante) :
 * on modifie une fiche existante via modifierClient, pas via une 2e création.
 */
export async function creerClient(entree: z.infer<typeof schemaCreationClient>, acteur: { id: string; role: string }) {
  const [ficheExistante, commandeExistante] = await Promise.all([
    db.client.findUnique({ where: { email: entree.email } }),
    db.commande.findFirst({ where: { emailContact: entree.email } }),
  ]);
  if (ficheExistante || commandeExistante) {
    throw new ErreurConflit(`Un client existe déjà pour ${entree.email}`);
  }

  await db.$transaction([
    db.client.create({
      data: {
        email: entree.email,
        nomContact: entree.nomContact,
        telContact: entree.telContact,
        entreprise: entree.entreprise ?? null,
        typeClient: entree.typeClient ?? "PARTICULIER",
        adresseLivraison: entree.adresseLivraison ?? null,
      },
    }),
    db.journalAudit.create({
      data: {
        acteurId: acteur.id,
        acteurRole: acteur.role as never,
        action: "CLIENT_CREE",
        entite: "Client",
        entiteId: entree.email,
        apres: entree as never,
      },
    }),
  ]);

  return obtenirClient(entree.email);
}

/**
 * « Le client » peut être une ligne Client dédiée et/ou un agrégat par
 * e-mail issu des commandes (voir l'en-tête du fichier). Modifier ses
 * coordonnées met donc à jour les deux quand ils existent : la fiche Client
 * (créée à la volée si absente, pour qu'un futur edit ou export la retrouve)
 * et la commande la plus récente, qui reste la source pour les documents déjà
 * émis. Les commandes plus anciennes gardent leurs coordonnées d'origine,
 * qui restent un instantané valide de la commande à l'époque.
 */
export async function modifierClient(email: string, entree: z.infer<typeof schemaModificationClient>, acteur: { id: string; role: string }) {
  const derniereCommande = await db.commande.findFirst({ where: { emailContact: email }, orderBy: { creeLe: "desc" } });
  const ficheExistante = await db.client.findUnique({ where: { email } });
  if (!derniereCommande && !ficheExistante) throw new ErreurNonTrouve("Client", email);

  const operations = [];
  if (derniereCommande) {
    operations.push(db.commande.update({ where: { id: derniereCommande.id }, data: entree }));
  }
  operations.push(
    db.client.upsert({
      where: { email },
      create: {
        email,
        nomContact: entree.nomContact ?? derniereCommande?.nomContact ?? email,
        telContact: entree.telContact ?? derniereCommande?.telContact ?? "",
        entreprise: entree.entreprise !== undefined ? entree.entreprise : (derniereCommande?.entreprise ?? null),
        typeClient: entree.typeClient ?? derniereCommande?.typeClient ?? "PARTICULIER",
        adresseLivraison:
          entree.adresseLivraison !== undefined ? entree.adresseLivraison : (derniereCommande?.adresseLivraison ?? null),
      },
      update: entree,
    }),
  );
  operations.push(
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
  );

  await db.$transaction(operations);

  return obtenirClient(email);
}
