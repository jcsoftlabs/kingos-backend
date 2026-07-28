-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'ADMIN', 'COMMERCIAL', 'PRODUCTION', 'LECTURE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ModeTarification" AS ENUM ('SURFACE', 'QUANTITE', 'FORFAIT', 'SUR_DEVIS');

-- CreateEnum
CREATE TYPE "TypeAttribut" AS ENUM ('CHOIX', 'DIMENSION', 'NOMBRE', 'BOOLEEN', 'TEXTE');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('BROUILLON', 'DEVIS_DEMANDE', 'DEVIS_ENVOYE', 'DEVIS_ACCEPTE', 'DEVIS_REFUSE', 'EN_ATTENTE_PAIEMENT', 'PAYEE', 'FICHIERS_A_VERIFIER', 'BAT_EN_ATTENTE', 'BAT_VALIDE', 'EN_PRODUCTION', 'PRETE', 'LIVREE', 'CLOTUREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "ModeLivraison" AS ENUM ('RETRAIT_ATELIER', 'LIVRAISON_PORT_AU_PRINCE', 'LIVRAISON_PROVINCE');

-- CreateEnum
CREATE TYPE "StatutFichier" AS ENUM ('EN_ATTENTE_UPLOAD', 'RECU', 'EN_VERIFICATION', 'VALIDE', 'REJETE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "StatutDevis" AS ENUM ('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('EMISE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'EN_RETARD', 'ANNULEE');

-- CreateEnum
CREATE TYPE "Fournisseur" AS ENUM ('MONCASH', 'STRIPE', 'ESPECES', 'VIREMENT', 'CHEQUE', 'NATCASH');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('INITIE', 'EN_ATTENTE', 'A_ENCAISSER', 'REUSSI', 'ECHOUE', 'REJETE', 'EXPIRE', 'ANNULE', 'REMBOURSE');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "nom" TEXT NOT NULL,
    "prenom" TEXT,
    "telephone" TEXT,
    "entreprise" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "codeClient" TEXT,
    "emailVerifie" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "adresseIp" TEXT,
    "agentUtil" TEXT,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "revoqueeLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JetonUsageUnique" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonUsageUnique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorieService" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "icone" TEXT,
    "imageId" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategorieService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "categorieId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "resume" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mode" "ModeTarification" NOT NULL,
    "unite" TEXT,
    "prixBaseCents" BIGINT NOT NULL DEFAULT 0,
    "prixMinCents" BIGINT NOT NULL DEFAULT 0,
    "delaiJours" INTEGER NOT NULL DEFAULT 3,
    "surfaceMinFt2" DECIMAL(10,4),
    "surfaceMaxFt2" DECIMAL(10,4),
    "quantiteMin" INTEGER NOT NULL DEFAULT 1,
    "quantiteMax" INTEGER,
    "fichierRequis" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "seoTitre" TEXT,
    "seoDescription" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributService" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" "TypeAttribut" NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "aide" TEXT,

    CONSTRAINT "AttributService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionAttribut" (
    "id" TEXT NOT NULL,
    "attributId" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "coefficient" DECIMAL(8,4),
    "supplementCents" BIGINT,
    "supplementParUniteCents" BIGINT,
    "imageId" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionAttribut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalierQuantite" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "quantiteMin" INTEGER NOT NULL,
    "quantiteMax" INTEGER,
    "remisePct" DECIMAL(5,2),
    "prixUnitaireCents" BIGINT,

    CONSTRAINT "PalierQuantite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaService" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MediaService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionTarifs" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "appliqueeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parId" TEXT,

    CONSTRAINT "VersionTarifs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Realisation" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "client" TEXT,
    "description" TEXT,
    "serviceIds" TEXT[],
    "publicIdPrincipal" TEXT NOT NULL,
    "galerie" JSONB NOT NULL,
    "dateProjet" TIMESTAMP(3),
    "miseEnAvant" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Realisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commande" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "emailContact" TEXT NOT NULL,
    "nomContact" TEXT NOT NULL,
    "telContact" TEXT NOT NULL,
    "entreprise" TEXT,
    "statut" "StatutCommande" NOT NULL DEFAULT 'BROUILLON',
    "modeLivraison" "ModeLivraison" NOT NULL DEFAULT 'RETRAIT_ATELIER',
    "adresseLivraison" TEXT,
    "fraisLivraisonCents" BIGINT NOT NULL DEFAULT 0,
    "sousTotalCents" BIGINT NOT NULL DEFAULT 0,
    "remiseCents" BIGINT NOT NULL DEFAULT 0,
    "taxeCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL DEFAULT 0,
    "devise" TEXT NOT NULL DEFAULT 'HTG',
    "notesClient" TEXT,
    "notesInternes" TEXT,
    "dateSouhaitee" TIMESTAMP(3),
    "dateLivraisonPrevue" TIMESTAMP(3),
    "cleIdempotence" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneCommande" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceNom" TEXT NOT NULL,
    "specifications" JSONB NOT NULL,
    "detailPrix" JSONB NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "surfaceFt2" DECIMAL(10,4),
    "prixUnitaireCents" BIGINT NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "versionTarifsId" TEXT,

    CONSTRAINT "LigneCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementCommande" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ancienStatut" "StatutCommande",
    "nouveauStatut" "StatutCommande",
    "message" TEXT NOT NULL,
    "visibleClient" BOOLEAN NOT NULL DEFAULT true,
    "auteurId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenementCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichierClient" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "ligneId" TEXT,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "typeLivraison" TEXT NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "tailleOctets" BIGINT NOT NULL,
    "largeurPx" INTEGER,
    "hauteurPx" INTEGER,
    "dpi" INTEGER,
    "espaceCouleur" TEXT,
    "nbPages" INTEGER,
    "apercuPublicId" TEXT,
    "statut" "StatutFichier" NOT NULL DEFAULT 'EN_ATTENTE_UPLOAD',
    "motifRejet" TEXT,
    "alertesPreflight" JSONB,
    "televerseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FichierClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonATirer" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publicId" TEXT NOT NULL,
    "commentaire" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "reponseClient" TEXT,
    "repondueLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonATirer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devis" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "statut" "StatutDevis" NOT NULL DEFAULT 'BROUILLON',
    "contenu" JSONB NOT NULL,
    "sousTotalCents" BIGINT NOT NULL,
    "remiseCents" BIGINT NOT NULL DEFAULT 0,
    "taxeTauxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxeCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'HTG',
    "validiteJours" INTEGER NOT NULL DEFAULT 15,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "pdfPublicId" TEXT,
    "envoyeLe" TIMESTAMP(3),
    "vuLe" TIMESTAMP(3),
    "accepteLe" TIMESTAMP(3),
    "refuseLe" TIMESTAMP(3),
    "motifRefus" TEXT,
    "factureId" TEXT,
    "creeParId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "devisOrigineId" TEXT,
    "statut" "StatutFacture" NOT NULL DEFAULT 'EMISE',
    "contenu" JSONB NOT NULL,
    "sousTotalCents" BIGINT NOT NULL,
    "remiseCents" BIGINT NOT NULL DEFAULT 0,
    "taxeTauxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxeCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "payeCents" BIGINT NOT NULL DEFAULT 0,
    "devise" TEXT NOT NULL DEFAULT 'HTG',
    "echeanceLe" TIMESTAMP(3),
    "pdfPublicId" TEXT,
    "envoyeeLe" TIMESTAMP(3),
    "payeeLe" TIMESTAMP(3),
    "annuleeLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "avoirDeId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteurDocument" (
    "type" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompteurDocument_pkey" PRIMARY KEY ("type","annee")
);

-- CreateTable
CREATE TABLE "ParametresEntreprise" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "raisonSociale" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "siteWeb" TEXT,
    "nif" TEXT,
    "logoPublicId" TEXT,
    "banques" JSONB NOT NULL,
    "moncashNumero" TEXT,
    "natcashNumero" TEXT,
    "conditionsDevis" TEXT NOT NULL,
    "conditionsFacture" TEXT NOT NULL,
    "tauxTaxePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tauxChangeUSD" DECIMAL(12,6),
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametresEntreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentionPaiement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "factureId" TEXT,
    "fournisseur" "Fournisseur" NOT NULL,
    "montantCents" BIGINT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'HTG',
    "statut" "StatutPaiement" NOT NULL DEFAULT 'INITIE',
    "jetonFournisseur" TEXT,
    "urlRedirection" TEXT,
    "reponseCreation" JSONB,
    "cleIdempotence" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntentionPaiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "intentionId" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "factureId" TEXT,
    "fournisseur" "Fournisseur" NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'REUSSI',
    "montantCents" BIGINT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'HTG',
    "montantEncaisseCents" BIGINT,
    "deviseEncaissement" TEXT,
    "tauxChange" DECIMAL(12,6),
    "fraisCents" BIGINT NOT NULL DEFAULT 0,
    "refFournisseur" TEXT NOT NULL,
    "telephonePayeur" TEXT,
    "reponseBrute" JSONB,
    "banqueEmettrice" TEXT,
    "numeroCheque" TEXT,
    "dateCheque" TIMESTAMP(3),
    "dateEncaissementPrevue" TIMESTAMP(3),
    "justificatifPublicId" TEXT,
    "motifRejet" TEXT,
    "confirmeLe" TIMESTAMP(3),
    "saisiParId" TEXT,
    "valideParId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementWebhook" (
    "id" TEXT NOT NULL,
    "fournisseur" "Fournisseur" NOT NULL,
    "signature" TEXT,
    "empreinte" TEXT NOT NULL,
    "corps" JSONB NOT NULL,
    "entetes" JSONB NOT NULL,
    "traiteLe" TIMESTAMP(3),
    "erreur" TEXT,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenementWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorieRessource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategorieRessource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ressource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categorieId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "motsCles" TEXT[],
    "formats" JSONB NOT NULL,
    "apercuPublicId" TEXT NOT NULL,
    "licence" TEXT NOT NULL DEFAULT 'GRATUIT_USAGE_LIBRE',
    "auteur" TEXT,
    "nbTelechargements" INTEGER NOT NULL DEFAULT 0,
    "noteMoyenne" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "nbNotes" INTEGER NOT NULL DEFAULT 0,
    "publiee" BOOLEAN NOT NULL DEFAULT false,
    "miseEnAvant" BOOLEAN NOT NULL DEFAULT false,
    "publieeLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ressource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelechargementRessource" (
    "id" TEXT NOT NULL,
    "ressourceId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "ipHash" TEXT NOT NULL,
    "paysCode" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelechargementRessource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotationRessource" (
    "id" TEXT NOT NULL,
    "ressourceId" TEXT NOT NULL,
    "utilisateurId" TEXT,
    "ipHash" TEXT NOT NULL,
    "note" INTEGER NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotationRessource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL,
    "acteurId" TEXT,
    "acteurRole" "Role",
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "avant" JSONB,
    "apres" JSONB,
    "adresseIp" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageContact" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "sujet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traiteLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonneNewsletter" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "confirmeLe" TIMESTAMP(3),
    "desabonneLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbonneNewsletter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_codeClient_key" ON "Utilisateur"("codeClient");

-- CreateIndex
CREATE INDEX "Utilisateur_role_actif_idx" ON "Utilisateur"("role", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Session_jetonHash_key" ON "Session"("jetonHash");

-- CreateIndex
CREATE INDEX "Session_utilisateurId_expireLe_idx" ON "Session"("utilisateurId", "expireLe");

-- CreateIndex
CREATE UNIQUE INDEX "JetonUsageUnique_jetonHash_key" ON "JetonUsageUnique"("jetonHash");

-- CreateIndex
CREATE UNIQUE INDEX "CategorieService_slug_key" ON "CategorieService"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_categorieId_visible_ordre_idx" ON "Service"("categorieId", "visible", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "AttributService_serviceId_cle_key" ON "AttributService"("serviceId", "cle");

-- CreateIndex
CREATE UNIQUE INDEX "OptionAttribut_attributId_valeur_key" ON "OptionAttribut"("attributId", "valeur");

-- CreateIndex
CREATE INDEX "PalierQuantite_serviceId_quantiteMin_idx" ON "PalierQuantite"("serviceId", "quantiteMin");

-- CreateIndex
CREATE UNIQUE INDEX "VersionTarifs_numero_key" ON "VersionTarifs"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Realisation_slug_key" ON "Realisation"("slug");

-- CreateIndex
CREATE INDEX "Realisation_visible_miseEnAvant_ordre_idx" ON "Realisation"("visible", "miseEnAvant", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Commande_numero_key" ON "Commande"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Commande_cleIdempotence_key" ON "Commande"("cleIdempotence");

-- CreateIndex
CREATE INDEX "Commande_utilisateurId_creeLe_idx" ON "Commande"("utilisateurId", "creeLe");

-- CreateIndex
CREATE INDEX "Commande_statut_creeLe_idx" ON "Commande"("statut", "creeLe");

-- CreateIndex
CREATE INDEX "LigneCommande_commandeId_idx" ON "LigneCommande"("commandeId");

-- CreateIndex
CREATE INDEX "EvenementCommande_commandeId_creeLe_idx" ON "EvenementCommande"("commandeId", "creeLe");

-- CreateIndex
CREATE UNIQUE INDEX "FichierClient_publicId_key" ON "FichierClient"("publicId");

-- CreateIndex
CREATE INDEX "FichierClient_commandeId_statut_idx" ON "FichierClient"("commandeId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "BonATirer_commandeId_version_key" ON "BonATirer"("commandeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Devis_numero_key" ON "Devis"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Devis_factureId_key" ON "Devis"("factureId");

-- CreateIndex
CREATE INDEX "Devis_commandeId_idx" ON "Devis"("commandeId");

-- CreateIndex
CREATE INDEX "Devis_statut_expireLe_idx" ON "Devis"("statut", "expireLe");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numero_key" ON "Facture"("numero");

-- CreateIndex
CREATE INDEX "Facture_commandeId_idx" ON "Facture"("commandeId");

-- CreateIndex
CREATE INDEX "Facture_statut_echeanceLe_idx" ON "Facture"("statut", "echeanceLe");

-- CreateIndex
CREATE UNIQUE INDEX "IntentionPaiement_reference_key" ON "IntentionPaiement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "IntentionPaiement_cleIdempotence_key" ON "IntentionPaiement"("cleIdempotence");

-- CreateIndex
CREATE INDEX "IntentionPaiement_commandeId_statut_idx" ON "IntentionPaiement"("commandeId", "statut");

-- CreateIndex
CREATE INDEX "IntentionPaiement_statut_expireLe_idx" ON "IntentionPaiement"("statut", "expireLe");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_intentionId_key" ON "Paiement"("intentionId");

-- CreateIndex
CREATE INDEX "Paiement_statut_dateEncaissementPrevue_idx" ON "Paiement"("statut", "dateEncaissementPrevue");

-- CreateIndex
CREATE INDEX "Paiement_confirmeLe_idx" ON "Paiement"("confirmeLe");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_fournisseur_refFournisseur_key" ON "Paiement"("fournisseur", "refFournisseur");

-- CreateIndex
CREATE UNIQUE INDEX "EvenementWebhook_empreinte_key" ON "EvenementWebhook"("empreinte");

-- CreateIndex
CREATE UNIQUE INDEX "CategorieRessource_slug_key" ON "CategorieRessource"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Ressource_slug_key" ON "Ressource"("slug");

-- CreateIndex
CREATE INDEX "Ressource_categorieId_publiee_idx" ON "Ressource"("categorieId", "publiee");

-- CreateIndex
CREATE INDEX "Ressource_publiee_nbTelechargements_idx" ON "Ressource"("publiee", "nbTelechargements");

-- CreateIndex
CREATE INDEX "TelechargementRessource_ressourceId_creeLe_idx" ON "TelechargementRessource"("ressourceId", "creeLe");

-- CreateIndex
CREATE UNIQUE INDEX "NotationRessource_ressourceId_ipHash_key" ON "NotationRessource"("ressourceId", "ipHash");

-- CreateIndex
CREATE INDEX "JournalAudit_entite_entiteId_creeLe_idx" ON "JournalAudit"("entite", "entiteId", "creeLe");

-- CreateIndex
CREATE INDEX "JournalAudit_acteurId_creeLe_idx" ON "JournalAudit"("acteurId", "creeLe");

-- CreateIndex
CREATE UNIQUE INDEX "AbonneNewsletter_email_key" ON "AbonneNewsletter"("email");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributService" ADD CONSTRAINT "AttributService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAttribut" ADD CONSTRAINT "OptionAttribut_attributId_fkey" FOREIGN KEY ("attributId") REFERENCES "AttributService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PalierQuantite" ADD CONSTRAINT "PalierQuantite_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaService" ADD CONSTRAINT "MediaService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementCommande" ADD CONSTRAINT "EvenementCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichierClient" ADD CONSTRAINT "FichierClient_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichierClient" ADD CONSTRAINT "FichierClient_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneCommande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonATirer" ADD CONSTRAINT "BonATirer_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ressource" ADD CONSTRAINT "Ressource_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieRessource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelechargementRessource" ADD CONSTRAINT "TelechargementRessource_ressourceId_fkey" FOREIGN KEY ("ressourceId") REFERENCES "Ressource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotationRessource" ADD CONSTRAINT "NotationRessource_ressourceId_fkey" FOREIGN KEY ("ressourceId") REFERENCES "Ressource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotationRessource" ADD CONSTRAINT "NotationRessource_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
