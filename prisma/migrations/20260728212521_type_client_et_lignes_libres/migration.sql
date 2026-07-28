-- CreateEnum
CREATE TYPE "TypeClient" AS ENUM ('PARTICULIER', 'ENTREPRISE', 'ONG', 'INSTITUTION_ETATIQUE');

-- DropIndex
DROP INDEX "ressource_recherche_idx";

-- AlterTable
ALTER TABLE "Commande" ADD COLUMN     "typeClient" "TypeClient" NOT NULL DEFAULT 'PARTICULIER';

-- AlterTable
ALTER TABLE "LigneCommande" ADD COLUMN     "descriptionLibre" TEXT,
ALTER COLUMN "serviceId" DROP NOT NULL;
