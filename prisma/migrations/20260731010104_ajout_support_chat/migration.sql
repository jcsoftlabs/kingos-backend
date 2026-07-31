-- CreateEnum
CREATE TYPE "StatutConversationSupport" AS ENUM ('OUVERTE', 'FERMEE');

-- CreateEnum
CREATE TYPE "ExpediteurMessageSupport" AS ENUM ('CLIENT', 'STAFF');

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "disponibleSupport" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConversationSupport" (
    "id" TEXT NOT NULL,
    "nomContact" TEXT NOT NULL,
    "emailContact" TEXT NOT NULL,
    "telContact" TEXT,
    "statut" "StatutConversationSupport" NOT NULL DEFAULT 'OUVERTE',
    "origineSansAgent" BOOLEAN NOT NULL DEFAULT false,
    "derniereActiviteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSupport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageSupport" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "expediteur" "ExpediteurMessageSupport" NOT NULL,
    "auteurId" TEXT,
    "contenu" TEXT NOT NULL,
    "luParStaffLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageSupport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationSupport_statut_derniereActiviteLe_idx" ON "ConversationSupport"("statut", "derniereActiviteLe");

-- CreateIndex
CREATE INDEX "MessageSupport_conversationId_creeLe_idx" ON "MessageSupport"("conversationId", "creeLe");

-- AddForeignKey
ALTER TABLE "MessageSupport" ADD CONSTRAINT "MessageSupport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ConversationSupport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
