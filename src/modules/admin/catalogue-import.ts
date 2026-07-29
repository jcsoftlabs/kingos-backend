import { db } from "../../core/db.js";

/**
 * Import CSV du catalogue (une ligne = un service). Colonnes attendues,
 * dans cet ordre, avec en-tête en première ligne :
 *
 *   categorie_slug, categorie_nom, service_slug, service_nom, resume,
 *   description, mode, unite, prix_base_htg, prix_min_htg, delai_jours,
 *   surface_min_ft2, quantite_min, quantite_max, fichier_requis, visible
 *
 * - categorie_slug : identifiant de la catégorie (ex. "impression-grand-format").
 *   Si elle n'existe pas encore, elle est créée avec categorie_nom.
 * - service_slug : identifiant unique du service. Une ligne dont le slug
 *   existe déjà MET À JOUR ce service plutôt que d'en créer un doublon —
 *   un import est donc rejouable sans risque (corriger un prix = réimporter
 *   le même fichier corrigé).
 * - mode : SURFACE | QUANTITE | FORFAIT | SUR_DEVIS (voir le catalogue).
 * - prix_base_htg / prix_min_htg : en gourdes (ex. "350"), pas en centimes —
 *   c'est ce qu'un humain tape dans un tableur, la conversion se fait ici.
 * - fichier_requis / visible : "oui"/"non" (ou vide = valeur par défaut).
 *
 * Les attributs/options (matériau, finitions...) ne sont volontairement pas
 * couverts par ce format — cardinalité variable, mal adaptée à une ligne de
 * CSV. Ils se gèrent après import via le panneau "attributs" du catalogue.
 */

interface LigneImport {
  categorieSlug: string;
  categorieNom: string;
  serviceSlug: string;
  serviceNom: string;
  resume: string;
  description: string;
  mode: string;
  unite: string;
  prixBaseHtg: string;
  prixMinHtg: string;
  delaiJours: string;
  surfaceMinFt2: string;
  quantiteMin: string;
  quantiteMax: string;
  fichierRequis: string;
  visible: string;
}

const COLONNES_ATTENDUES = [
  "categorie_slug", "categorie_nom", "service_slug", "service_nom", "resume", "description", "mode", "unite",
  "prix_base_htg", "prix_min_htg", "delai_jours", "surface_min_ft2", "quantite_min", "quantite_max",
  "fichier_requis", "visible",
] as const;

const MODES_VALIDES = new Set(["SURFACE", "QUANTITE", "FORFAIT", "SUR_DEVIS"]);

/** Analyseur CSV minimal mais correct (RFC 4180) : champs entre guillemets, virgules et guillemets échappés à l'intérieur. Pas de champ multi-lignes. */
function analyserLigneCsv(ligne: string): string[] {
  const champs: string[] = [];
  let champ = "";
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === ",") {
      champs.push(champ);
      champ = "";
    } else {
      champ += c;
    }
  }
  champs.push(champ);
  return champs.map((c) => c.trim());
}

function centimesDepuisHtg(texte: string): bigint | undefined {
  if (!texte.trim()) return undefined;
  const nombre = Number(texte.replace(",", "."));
  if (Number.isNaN(nombre)) return undefined;
  return BigInt(Math.round(nombre * 100));
}

function booleenDepuisTexte(texte: string, defaut: boolean): boolean {
  const v = texte.trim().toLowerCase();
  if (!v) return defaut;
  return v === "oui" || v === "yes" || v === "true" || v === "1";
}

export interface ResultatImportCatalogue {
  categoriesCreees: number;
  servicesCrees: number;
  servicesModifies: number;
  erreurs: { ligne: number; message: string }[];
}

export async function importerCatalogueCsv(texteCsv: string): Promise<ResultatImportCatalogue> {
  const lignes = texteCsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignes.length === 0) {
    return { categoriesCreees: 0, servicesCrees: 0, servicesModifies: 0, erreurs: [{ ligne: 0, message: "Fichier vide" }] };
  }

  const enTete = analyserLigneCsv(lignes[0]!).map((c) => c.toLowerCase());
  const manquantes = COLONNES_ATTENDUES.filter((c) => !enTete.includes(c));
  if (manquantes.length > 0) {
    return {
      categoriesCreees: 0,
      servicesCrees: 0,
      servicesModifies: 0,
      erreurs: [{ ligne: 1, message: `Colonnes manquantes : ${manquantes.join(", ")}` }],
    };
  }

  const resultat: ResultatImportCatalogue = { categoriesCreees: 0, servicesCrees: 0, servicesModifies: 0, erreurs: [] };
  const categoriesConnues = new Map<string, string>(); // slug -> id, en cache pour tout l'import

  for (let i = 1; i < lignes.length; i++) {
    const numeroLigne = i + 1;
    const valeurs = analyserLigneCsv(lignes[i]!);
    const champs = Object.fromEntries(enTete.map((cle, idx) => [cle, valeurs[idx] ?? ""])) as Record<string, string>;

    const l: LigneImport = {
      categorieSlug: champs.categorie_slug ?? "",
      categorieNom: champs.categorie_nom ?? "",
      serviceSlug: champs.service_slug ?? "",
      serviceNom: champs.service_nom ?? "",
      resume: champs.resume ?? "",
      description: champs.description ?? "",
      mode: (champs.mode ?? "").toUpperCase(),
      unite: champs.unite ?? "",
      prixBaseHtg: champs.prix_base_htg ?? "",
      prixMinHtg: champs.prix_min_htg ?? "",
      delaiJours: champs.delai_jours ?? "",
      surfaceMinFt2: champs.surface_min_ft2 ?? "",
      quantiteMin: champs.quantite_min ?? "",
      quantiteMax: champs.quantite_max ?? "",
      fichierRequis: champs.fichier_requis ?? "",
      visible: champs.visible ?? "",
    };

    if (!l.categorieSlug || !l.serviceSlug || !l.serviceNom || !l.resume || !l.description) {
      resultat.erreurs.push({ ligne: numeroLigne, message: "categorie_slug, service_slug, service_nom, resume et description sont obligatoires" });
      continue;
    }
    if (!MODES_VALIDES.has(l.mode)) {
      resultat.erreurs.push({ ligne: numeroLigne, message: `mode "${l.mode}" invalide — attendu SURFACE, QUANTITE, FORFAIT ou SUR_DEVIS` });
      continue;
    }
    const prixBaseCents = centimesDepuisHtg(l.prixBaseHtg);
    if (l.prixBaseHtg.trim() && prixBaseCents === undefined) {
      resultat.erreurs.push({ ligne: numeroLigne, message: `prix_base_htg "${l.prixBaseHtg}" n'est pas un nombre` });
      continue;
    }

    try {
      let categorieId = categoriesConnues.get(l.categorieSlug);
      if (!categorieId) {
        const categorieExistante = await db.categorieService.findUnique({ where: { slug: l.categorieSlug } });
        if (categorieExistante) {
          categorieId = categorieExistante.id;
        } else {
          const categorie = await db.categorieService.create({
            data: { slug: l.categorieSlug, nom: l.categorieNom || l.categorieSlug },
          });
          categorieId = categorie.id;
          resultat.categoriesCreees++;
        }
        categoriesConnues.set(l.categorieSlug, categorieId);
      }

      const donneesService = {
        categorieId,
        nom: l.serviceNom,
        resume: l.resume,
        description: l.description,
        mode: l.mode as "SURFACE" | "QUANTITE" | "FORFAIT" | "SUR_DEVIS",
        unite: l.unite || undefined,
        prixBaseCents: prixBaseCents ?? 0n,
        prixMinCents: centimesDepuisHtg(l.prixMinHtg) ?? 0n,
        delaiJours: l.delaiJours.trim() ? Number(l.delaiJours) : 3,
        surfaceMinFt2: l.surfaceMinFt2.trim() ? Number(l.surfaceMinFt2) : undefined,
        quantiteMin: l.quantiteMin.trim() ? Number(l.quantiteMin) : 1,
        quantiteMax: l.quantiteMax.trim() ? Number(l.quantiteMax) : undefined,
        fichierRequis: booleenDepuisTexte(l.fichierRequis, true),
        visible: booleenDepuisTexte(l.visible, true),
      };

      const existant = await db.service.findUnique({ where: { slug: l.serviceSlug } });
      if (existant) {
        await db.service.update({ where: { id: existant.id }, data: donneesService });
        resultat.servicesModifies++;
      } else {
        await db.service.create({ data: { slug: l.serviceSlug, ...donneesService } });
        resultat.servicesCrees++;
      }
    } catch (erreur) {
      resultat.erreurs.push({ ligne: numeroLigne, message: erreur instanceof Error ? erreur.message : "Erreur inconnue" });
    }
  }

  return resultat;
}
