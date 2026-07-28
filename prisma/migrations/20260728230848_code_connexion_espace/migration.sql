-- CreateTable
CREATE TABLE "CodeConnexionEspace" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeConnexionEspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodeConnexionEspace_email_creeLe_idx" ON "CodeConnexionEspace"("email", "creeLe");
