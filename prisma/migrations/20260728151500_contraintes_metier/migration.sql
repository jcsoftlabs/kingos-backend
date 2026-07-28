-- Contraintes et fonctions que Prisma ne sait pas exprimer nativement.
-- Voir docs/PLAN_IMPLEMENTATION_KINGOS.md section 3.10.

-- 1. Numérotation atomique des documents (CMD, DEV, FAC, AVO), sans collision de concurrence
CREATE OR REPLACE FUNCTION prochain_numero(p_type text, p_annee int)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v int;
BEGIN
  INSERT INTO "CompteurDocument"(type, annee, dernier) VALUES (p_type, p_annee, 1)
  ON CONFLICT (type, annee) DO UPDATE SET dernier = "CompteurDocument".dernier + 1
  RETURNING dernier INTO v;
  RETURN p_type || '-' || p_annee || '-' || lpad(v::text, 6, '0');
END $$;

-- 2. Le montant payé d'une facture ne peut pas dépasser son total
ALTER TABLE "Facture" ADD CONSTRAINT facture_paye_coherent
  CHECK ("payeCents" >= 0 AND "payeCents" <= "totalCents");

-- 3. Montants de paiement non nuls (les remboursements sont portés en négatif)
ALTER TABLE "Paiement" ADD CONSTRAINT paiement_montant_non_nul CHECK ("montantCents" <> 0);

-- 4. Un paiement acquis porte toujours une date de confirmation, et réciproquement
ALTER TABLE "Paiement" ADD CONSTRAINT paiement_confirmation_coherente
  CHECK (("statut" = 'REUSSI') = ("confirmeLe" IS NOT NULL));

-- 5. Note bornée entre 1 et 5
ALTER TABLE "NotationRessource" ADD CONSTRAINT note_bornee CHECK (note BETWEEN 1 AND 5);

-- 6. Une seule facture active par commande (les annulées ne comptent pas)
CREATE UNIQUE INDEX facture_active_unique ON "Facture"("commandeId")
  WHERE statut <> 'ANNULEE';

-- 7. Recherche plein texte française, accents ignorés, sur les ressources graphiques
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "Ressource" ADD COLUMN "rechercheVec" tsvector;

CREATE OR REPLACE FUNCTION maj_recherche_ressource() RETURNS trigger AS $$
BEGIN
  NEW."rechercheVec" :=
      setweight(to_tsvector('french', unaccent(coalesce(NEW.titre,''))), 'A')
   || setweight(to_tsvector('french', unaccent(array_to_string(NEW."motsCles",' '))), 'B')
   || setweight(to_tsvector('french', unaccent(coalesce(NEW.description,''))), 'C');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recherche_ressource
  BEFORE INSERT OR UPDATE ON "Ressource"
  FOR EACH ROW EXECUTE FUNCTION maj_recherche_ressource();

CREATE INDEX ressource_recherche_idx ON "Ressource" USING GIN ("rechercheVec");
