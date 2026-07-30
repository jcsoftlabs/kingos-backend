import { db } from "../../core/db.js";

/**
 * Import CSV de la liste clients existante avant le CRM (une ligne = un
 * client). Colonnes attendues, dans cet ordre, avec en-tête en première
 * ligne :
 *
 *   email, nom_contact, entreprise, type_client, telephone, adresse_livraison
 *
 * - email : identifiant unique du client. Une ligne dont l'e-mail existe déjà
 *   (fiche Client ou commande passée) MET À JOUR la fiche plutôt que d'en
 *   créer un doublon — un import est donc rejouable sans risque.
 * - type_client : PARTICULIER | ENTREPRISE | ONG | INSTITUTION_ETATIQUE
 *   (vide = PARTICULIER).
 */

const COLONNES_ATTENDUES = ["email", "nom_contact", "entreprise", "type_client", "telephone", "adresse_livraison"] as const;
const TYPES_VALIDES = new Set(["PARTICULIER", "ENTREPRISE", "ONG", "INSTITUTION_ETATIQUE"]);

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

export interface ResultatImportClients {
  clientsCrees: number;
  clientsModifies: number;
  erreurs: { ligne: number; message: string }[];
}

export async function importerClientsCsv(texteCsv: string): Promise<ResultatImportClients> {
  const lignes = texteCsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignes.length === 0) {
    return { clientsCrees: 0, clientsModifies: 0, erreurs: [{ ligne: 0, message: "Fichier vide" }] };
  }

  const enTete = analyserLigneCsv(lignes[0]!).map((c) => c.toLowerCase());
  const manquantes = COLONNES_ATTENDUES.filter((c) => !enTete.includes(c));
  if (manquantes.length > 0) {
    return {
      clientsCrees: 0,
      clientsModifies: 0,
      erreurs: [{ ligne: 1, message: `Colonnes manquantes : ${manquantes.join(", ")}` }],
    };
  }

  const resultat: ResultatImportClients = { clientsCrees: 0, clientsModifies: 0, erreurs: [] };
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (let i = 1; i < lignes.length; i++) {
    const numeroLigne = i + 1;
    const valeurs = analyserLigneCsv(lignes[i]!);
    const champs = Object.fromEntries(enTete.map((cle, idx) => [cle, valeurs[idx] ?? ""])) as Record<string, string>;

    const email = (champs.email ?? "").toLowerCase();
    const nomContact = champs.nom_contact ?? "";
    const entreprise = champs.entreprise ?? "";
    const typeClient = (champs.type_client ?? "").toUpperCase() || "PARTICULIER";
    const telephone = champs.telephone ?? "";
    const adresseLivraison = champs.adresse_livraison ?? "";

    if (!email || !nomContact || !telephone) {
      resultat.erreurs.push({ ligne: numeroLigne, message: "email, nom_contact et telephone sont obligatoires" });
      continue;
    }
    if (!regexEmail.test(email)) {
      resultat.erreurs.push({ ligne: numeroLigne, message: `e-mail "${email}" invalide` });
      continue;
    }
    if (!TYPES_VALIDES.has(typeClient)) {
      resultat.erreurs.push({
        ligne: numeroLigne,
        message: `type_client "${typeClient}" invalide — attendu PARTICULIER, ENTREPRISE, ONG ou INSTITUTION_ETATIQUE`,
      });
      continue;
    }

    try {
      const donnees = {
        nomContact,
        entreprise: entreprise || null,
        typeClient: typeClient as "PARTICULIER" | "ENTREPRISE" | "ONG" | "INSTITUTION_ETATIQUE",
        telContact: telephone,
        adresseLivraison: adresseLivraison || null,
      };

      const existant = await db.client.findUnique({ where: { email } });
      if (existant) {
        await db.client.update({ where: { email }, data: donnees });
        resultat.clientsModifies++;
      } else {
        await db.client.create({ data: { email, ...donnees } });
        resultat.clientsCrees++;
      }
    } catch (erreur) {
      resultat.erreurs.push({ ligne: numeroLigne, message: erreur instanceof Error ? erreur.message : "Erreur inconnue" });
    }
  }

  return resultat;
}
