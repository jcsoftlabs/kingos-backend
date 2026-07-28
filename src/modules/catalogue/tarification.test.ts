import { describe, expect, it } from "vitest";
import { calculerPrix } from "./tarification.js";

describe("tarification — mode SURFACE", () => {
  it("calcule un banner 8ft x 4ft en vinyle 13oz avec œillets", () => {
    const r = calculerPrix({
      mode: "SURFACE",
      largeurPouces: 96,
      hauteurPouces: 48,
      quantite: 2,
      prixBaseCents: 35000n, // 350 HTG / ft²
      prixMinCents: 0n,
      surfaceMinFt2: "6",
      options: [
        { cle: "materiau", valeur: "vinyle-13oz", libelle: "Vinyle 13oz", coefficient: "1" },
        {
          cle: "finition",
          valeur: "oeillets",
          libelle: "Œillets tous les 30cm",
          supplementParUniteCents: 1500n,
        },
      ],
    });

    // surface = 96*48/144 = 32 ft²
    // prix base = 32 * 35000 = 1120000
    // supplement œillets = 32 * 1500 = 48000
    // prix unitaire = 1168000
    // total = 1168000 * 2 = 2336000
    expect(r.prixUnitaireCents).toBe(1168000n);
    expect(r.totalCents).toBe(2336000n);
  });

  it("applique la surface minimale de facturation", () => {
    const r = calculerPrix({
      mode: "SURFACE",
      largeurPouces: 12,
      hauteurPouces: 12, // 1 ft²
      quantite: 1,
      prixBaseCents: 35000n,
      prixMinCents: 0n,
      surfaceMinFt2: "6",
      options: [],
    });
    // surface facturée = 6 ft² (plancher), pas 1 ft²
    expect(r.totalCents).toBe(210000n);
  });

  it("respecte le prix plancher (prixMinCents)", () => {
    const r = calculerPrix({
      mode: "SURFACE",
      largeurPouces: 1,
      hauteurPouces: 1,
      quantite: 1,
      prixBaseCents: 100n,
      prixMinCents: 500000n, // plancher très haut
      options: [],
    });
    expect(r.prixUnitaireCents).toBe(500000n);
  });
});

describe("tarification — mode QUANTITE", () => {
  it("applique un palier avec prix unitaire dédié et remise", () => {
    const r = calculerPrix({
      mode: "QUANTITE",
      quantite: 50,
      prixBaseCents: 45000n,
      prixMinCents: 0n,
      options: [],
      palier: { quantiteMin: 50, quantiteMax: 99, remisePct: "10", prixUnitaireCents: 40000n },
    });
    // 40000 * 50 = 2000000, puis -10% = 1800000
    expect(r.totalCents).toBe(1800000n);
  });

  it("cumule coefficient et supplément fixe sans palier", () => {
    const r = calculerPrix({
      mode: "QUANTITE",
      quantite: 12,
      prixBaseCents: 50000n,
      prixMinCents: 0n,
      options: [
        { cle: "faces", valeur: "recto-verso", libelle: "Recto-verso", coefficient: "1.6" },
      ],
    });
    // 50000 * 1.6 = 80000, * 12 = 960000
    expect(r.totalCents).toBe(960000n);
  });
});

describe("tarification — mode FORFAIT", () => {
  it("multiplie simplement le prix forfaitaire par la quantité", () => {
    const r = calculerPrix({ mode: "FORFAIT", quantite: 1, prixBaseCents: 1500000n });
    expect(r.totalCents).toBe(1500000n);
    expect(r.prixUnitaireCents).toBe(1500000n);
  });
});
