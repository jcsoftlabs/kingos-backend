-- CreateEnum
CREATE TYPE "StatutContrat" AS ENUM ('ACTIF', 'SUSPENDU', 'RESILIE', 'EXPIRE');

-- AlterTable
ALTER TABLE "Commande" ADD COLUMN     "contratId" TEXT;

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "emailClient" TEXT NOT NULL,
    "nomClient" TEXT NOT NULL,
    "entreprise" TEXT,
    "objet" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "statut" "StatutContrat" NOT NULL DEFAULT 'ACTIF',
    "remisePct" DECIMAL(5,2),
    "delaiPaiementJours" INTEGER,
    "notes" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrat_numero_key" ON "Contrat"("numero");

-- CreateIndex
CREATE INDEX "Contrat_emailClient_idx" ON "Contrat"("emailClient");

-- CreateIndex
CREATE INDEX "Contrat_statut_idx" ON "Contrat"("statut");

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "Contrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
