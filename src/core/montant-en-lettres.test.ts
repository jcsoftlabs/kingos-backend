import { describe, expect, it } from "vitest";
import { montantEnLettres, montantHTGEnLettres } from "./montant-en-lettres.js";

describe("montantEnLettres", () => {
  it("gère zéro", () => {
    expect(montantEnLettres(0)).toBe("zéro");
  });

  it("gère les nombres simples", () => {
    expect(montantEnLettres(1)).toBe("un");
    expect(montantEnLettres(21)).toBe("vingt-et-un");
    expect(montantEnLettres(80)).toBe("quatre-vingts");
    expect(montantEnLettres(81)).toBe("quatre-vingt-un");
  });

  it("gère les nombres à trois chiffres (le cas 80 dans une centaine, piège classique)", () => {
    expect(montantEnLettres(100)).toBe("cent");
    expect(montantEnLettres(180)).toBe("cent quatre-vingts");
    expect(montantEnLettres(200)).toBe("deux cents");
    expect(montantEnLettres(201)).toBe("deux cent un");
  });

  it("gère les dix-sept à dix-neuf (composés, pas dans la table de base)", () => {
    expect(montantEnLettres(17)).toBe("dix-sept");
    expect(montantEnLettres(19)).toBe("dix-neuf");
  });

  it("gère soixante-dix à quatre-vingt-dix-neuf", () => {
    expect(montantEnLettres(70)).toBe("soixante-dix");
    expect(montantEnLettres(71)).toBe("soixante-et-onze");
    expect(montantEnLettres(90)).toBe("quatre-vingt-dix");
    expect(montantEnLettres(99)).toBe("quatre-vingt-dix-neuf");
  });

  it("gère les milliers", () => {
    expect(montantEnLettres(1000)).toBe("mille");
    expect(montantEnLettres(2000)).toBe("deux mille");
    expect(montantEnLettres(1500)).toBe("mille cinq cents");
  });

  it("gère un million (le cas explicitement cité par le plan)", () => {
    expect(montantEnLettres(1_000_000)).toBe("un million");
    expect(montantEnLettres(2_500_000)).toBe("deux millions cinq cent mille");
  });

  it("gère les négatifs", () => {
    expect(montantEnLettres(-50)).toBe("moins cinquante");
  });
});

describe("montantHTGEnLettres", () => {
  it("tronque les centimes et accorde gourde(s)", () => {
    // 1168000 centimes = 11680 HTG
    expect(montantHTGEnLettres(1168000n)).toBe("onze mille six cent quatre-vingts gourdes");
    expect(montantHTGEnLettres(100n)).toBe("un gourde"); // 1 HTG — cas limite singulier
  });

  it("le cas 80 (quatre-vingts) au pluriel exact, testé explicitement par le plan", () => {
    expect(montantHTGEnLettres(8000n)).toBe("quatre-vingts gourdes");
  });
});
