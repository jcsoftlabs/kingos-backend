-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nomContact" TEXT NOT NULL,
    "entreprise" TEXT,
    "typeClient" "TypeClient" NOT NULL DEFAULT 'PARTICULIER',
    "telContact" TEXT NOT NULL,
    "adresseLivraison" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");
