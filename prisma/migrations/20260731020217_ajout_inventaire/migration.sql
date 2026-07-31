-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('ENTREE', 'SORTIE', 'AJUSTEMENT');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "articleInventaireId" TEXT,
ADD COLUMN     "consommationParUnite" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "ArticleInventaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT,
    "unite" TEXT NOT NULL,
    "quantiteActuelle" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "seuilAlerte" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleInventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite" DECIMAL(12,4) NOT NULL,
    "motif" TEXT,
    "commandeId" TEXT,
    "auteurId" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleInventaire_nom_idx" ON "ArticleInventaire"("nom");

-- CreateIndex
CREATE INDEX "MouvementStock_articleId_creeLe_idx" ON "MouvementStock"("articleId", "creeLe");

-- CreateIndex
CREATE INDEX "MouvementStock_commandeId_idx" ON "MouvementStock"("commandeId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_articleInventaireId_fkey" FOREIGN KEY ("articleInventaireId") REFERENCES "ArticleInventaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleInventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
