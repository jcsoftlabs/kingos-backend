-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('NOUVELLE', 'EN_COURS', 'TRAITEE', 'REJETEE');

-- CreateTable
CREATE TABLE "DemandeSpeciale" (
    "id" TEXT NOT NULL,
    "nomContact" TEXT NOT NULL,
    "emailContact" TEXT NOT NULL,
    "telContact" TEXT,
    "description" TEXT NOT NULL,
    "statut" "StatutDemande" NOT NULL DEFAULT 'NOUVELLE',
    "notesInternes" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteeLe" TIMESTAMP(3),

    CONSTRAINT "DemandeSpeciale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeSpeciale_statut_creeLe_idx" ON "DemandeSpeciale"("statut", "creeLe");
