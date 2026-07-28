import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Jeu de données de départ (plan §4.5, §18 phase 3) : cohérent, démontrable,
 * mais explicitement provisoire. Kingo's saisit sa vraie grille tarifaire au
 * back-office pendant la formation de la phase 6 — voir /admin/catalogue.
 */
async function principal() {
  await db.parametresEntreprise.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      raisonSociale: "Kingo's",
      adresse: "À compléter",
      ville: "Port-au-Prince",
      telephone: "+509 0000 0000",
      email: "contact@kingos.ht",
      banques: [],
      conditionsDevis: "Devis valable 15 jours à compter de la date d'émission.",
      conditionsFacture: "Paiement à réception, sauf modalités convenues.",
      tauxTaxePct: 0,
    },
  });

  const grandFormat = await db.categorieService.upsert({
    where: { slug: "impression-grand-format" },
    update: {},
    create: {
      slug: "impression-grand-format",
      nom: "Impression Grand Format",
      description: "Banners, vinyl adhésif, billboard, affiches",
      ordre: 1,
    },
  });

  const textile = await db.categorieService.upsert({
    where: { slug: "impression-textile" },
    update: {},
    create: {
      slug: "impression-textile",
      nom: "Impression Textile",
      description: "T-shirts personnalisés et autres supports",
      ordre: 2,
    },
  });

  const conception = await db.categorieService.upsert({
    where: { slug: "conception-graphique" },
    update: {},
    create: {
      slug: "conception-graphique",
      nom: "Conception Graphique",
      description: "Création sur mesure",
      ordre: 3,
    },
  });

  const banner = await db.service.upsert({
    where: { slug: "banner-vinyle" },
    update: {},
    create: {
      categorieId: grandFormat.id,
      slug: "banner-vinyle",
      nom: "Banner Vinyle",
      resume: "Banner extérieur/intérieur en vinyle, œillets sur demande",
      description: "Impression grand format sur vinyle 13oz, idéal pour événements et façades.",
      mode: "SURFACE",
      unite: "pied carré",
      prixBaseCents: 35000n, // 350 HTG / ft² — valeur de départ, à ajuster
      prixMinCents: 0n,
      surfaceMinFt2: 6,
      delaiJours: 3,
      ordre: 1,
    },
  });

  const attrMateriau = await db.attributService.upsert({
    where: { serviceId_cle: { serviceId: banner.id, cle: "materiau" } },
    update: {},
    create: {
      serviceId: banner.id,
      cle: "materiau",
      libelle: "Matériau",
      type: "CHOIX",
      obligatoire: true,
      ordre: 1,
    },
  });

  await db.optionAttribut.upsert({
    where: { attributId_valeur: { attributId: attrMateriau.id, valeur: "vinyle-13oz" } },
    update: {},
    create: {
      attributId: attrMateriau.id,
      valeur: "vinyle-13oz",
      libelle: "Vinyle 13oz",
      coefficient: 1,
      ordre: 1,
    },
  });

  await db.optionAttribut.upsert({
    where: { attributId_valeur: { attributId: attrMateriau.id, valeur: "mesh" } },
    update: {},
    create: {
      attributId: attrMateriau.id,
      valeur: "mesh",
      libelle: "Mesh (résistant au vent)",
      coefficient: 1.25,
      ordre: 2,
    },
  });

  const attrFinition = await db.attributService.upsert({
    where: { serviceId_cle: { serviceId: banner.id, cle: "finition" } },
    update: {},
    create: {
      serviceId: banner.id,
      cle: "finition",
      libelle: "Finition",
      type: "CHOIX",
      obligatoire: false,
      ordre: 2,
    },
  });

  await db.optionAttribut.upsert({
    where: { attributId_valeur: { attributId: attrFinition.id, valeur: "oeillets" } },
    update: {},
    create: {
      attributId: attrFinition.id,
      valeur: "oeillets",
      libelle: "Œillets tous les 30 cm",
      supplementParUniteCents: 1500n,
      ordre: 1,
    },
  });

  const tshirt = await db.service.upsert({
    where: { slug: "t-shirt-serigraphie" },
    update: {},
    create: {
      categorieId: textile.id,
      slug: "t-shirt-serigraphie",
      nom: "T-shirt Sérigraphie",
      resume: "T-shirt personnalisé, impression sérigraphique",
      description: "Impression textile en sérigraphie, dégressif par quantité.",
      mode: "QUANTITE",
      unite: "pièce",
      prixBaseCents: 45000n,
      prixMinCents: 0n,
      quantiteMin: 1,
      delaiJours: 5,
      ordre: 1,
    },
  });

  await db.palierQuantite.createMany({
    data: [
      { serviceId: tshirt.id, quantiteMin: 1, quantiteMax: 11, prixUnitaireCents: 45000n },
      { serviceId: tshirt.id, quantiteMin: 12, quantiteMax: 49, prixUnitaireCents: 40000n },
      { serviceId: tshirt.id, quantiteMin: 50, quantiteMax: 99, prixUnitaireCents: 35000n, remisePct: 5 },
      { serviceId: tshirt.id, quantiteMin: 100, quantiteMax: null, prixUnitaireCents: 30000n, remisePct: 10 },
    ],
    skipDuplicates: true,
  });

  await db.service.upsert({
    where: { slug: "identite-visuelle" },
    update: {},
    create: {
      categorieId: conception.id,
      slug: "identite-visuelle",
      nom: "Identité Visuelle",
      resume: "Logo, charte graphique, déclinaisons",
      description: "Conception sur mesure — chiffrage manuel selon le besoin.",
      mode: "SUR_DEVIS",
      fichierRequis: false,
      delaiJours: 7,
      ordre: 1,
    },
  });

  console.log("Jeu de données de départ inséré.");
}

principal()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
