import { describe, it, expect } from "vitest";
import { convertirDeviseEnGourdes } from "./service.js";

describe("convertirDeviseEnGourdes", () => {
  it("convertit un montant rond au taux courant", () => {
    // 100,00 USD au taux 135 → 13 500,00 HTG
    expect(convertirDeviseEnGourdes(10_000n, 135)).toBe(1_350_000n);
  });

  it("gère un taux décimal", () => {
    // 100,00 USD au taux 132,50 → 13 250,00 HTG
    expect(convertirDeviseEnGourdes(10_000n, 132.5)).toBe(1_325_000n);
  });

  it("arrondit au centime le plus proche plutôt que de tronquer", () => {
    // 0,01 USD au taux 135,55 → 1,3555 centime → 1 centime
    expect(convertirDeviseEnGourdes(1n, 135.55)).toBe(136n);
    // 33,33 USD au taux 135,55 → 451 788,15 centimes → arrondi à 451 788
    expect(convertirDeviseEnGourdes(3_333n, 135.55)).toBe(451_788n);
  });

  it("ne perd pas de précision sur un montant important", () => {
    // 50 000,00 USD au taux 135 → 6 750 000,00 HTG
    expect(convertirDeviseEnGourdes(5_000_000n, 135)).toBe(675_000_000n);
  });

  it("laisse le montant inchangé à un taux de 1", () => {
    expect(convertirDeviseEnGourdes(12_345n, 1)).toBe(12_345n);
  });
});
