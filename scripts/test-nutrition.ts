import assert from "node:assert/strict";
import {
  calcNutrition,
  FORTIFIER_KCAL_PER_UNIT,
  FORTIFIER_PROTEIN_G_PER_UNIT,
  LIPID_PROTEIN_G_PER_G,
  type Clinical,
} from "../src/lib/clinical";

/**
 * Energy and protein must come from every source at once: enteral milk with or
 * without fortification, plus IV dextrose, amino acids and lipid.
 * Run with: npx tsx scripts/test-nutrition.ts
 */
const n = (fluids: NonNullable<Clinical["fluids"]>) => calcNutrition({ fluids });
const IV = { dextrosePct: 10, aminoAcid: 3, lipid: 2 };

/* --- 1. Unfortified EBM with IV nutrition -------------------------------- */
const plain = n({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 150, ivMlKgDay: 50, ...IV });
assert.equal(plain.density, 0.67);
assert.equal(plain.enteralKcal, 100.5, "150 ml x 0.67 kcal/ml");
assert.equal(plain.milkKcal, 100.5);
assert.equal(plain.fortKcal, 0);
assert.equal(plain.fortified, false);
assert.equal(plain.gir, 3.47, "10% x 50 ml/kg/d x 10 / 1440");
assert.equal(plain.dextroseG, 5);
assert.equal(plain.dextroseKcal, 17, "5 g x 3.4");
assert.equal(plain.aaKcal, 12, "3 g x 4");
assert.equal(plain.lipidKcal, 18, "2 g x 9");
assert.equal(plain.ivKcal, 47);
assert.equal(plain.totalKcal, 147.5, "enteral + IV");
assert.equal(plain.milkProtein, 1.65, "150 ml x 0.011 g/ml");
assert.equal(plain.aaProtein, 3);
assert.equal(plain.totalProtein, 4.65);

/* --- 2. The same feed fortified: 4 sachets per 100 ml -------------------- */
const fort = n({
  feedType: "Expressed breast milk (EBM)",
  enteralMlKgDay: 150,
  ivMlKgDay: 50,
  ...IV,
  fortificationName: "human milk fortifier",
  fortificationAmount: 4,
  fortificationAmountUnit: "sachet",
  fortificationFeedVolumeMl: 100,
});
assert.equal(fort.fortified, true);
assert.equal(fort.fortKcalPerMl, 0.16, "4 sachets x 4 kcal / 100 ml");
assert.equal(fort.fortProteinPerMl, 0.0132, "4 sachets x 0.33 g / 100 ml");
assert.equal(fort.effectiveKcalPerMl, 0.83, "0.67 + 0.16");
assert.equal(fort.effectiveProteinPerMl, 0.0242, "≈ 2.4 g/dl, the published fortified value");
assert.equal(fort.milkKcal, 100.5);
assert.equal(fort.fortKcal, 24, "150 ml x 0.16");
assert.equal(fort.enteralKcal, 124.5, "150 ml x 0.83");
assert.equal(fort.totalKcal, 171.5, "fortified enteral + the same IV");
assert.equal(fort.milkProtein, 1.65);
assert.equal(fort.fortProtein, 1.98);
assert.equal(fort.enteralProtein, 3.63);
assert.equal(fort.totalProtein, 6.63, "milk + fortifier + amino acids");
assert.ok(fort.totalKcal > plain.totalKcal, "fortifying must raise the total");
assert.ok(fort.totalProtein > plain.totalProtein, "fortifying must raise the protein");

/* --- 3. Fortifier recorded without a mixed volume is reported, not guessed - */
const noVol = n({
  feedType: "Expressed breast milk (EBM)",
  enteralMlKgDay: 150,
  fortificationAmount: 4,
});
assert.equal(noVol.fortified, true);
assert.equal(noVol.fortKcal, 0, "no mixed volume means no safe uplift");
assert.equal(noVol.totalKcal, plain.enteralKcal);
assert.ok(
  noVol.warnings.some((w) => w.includes("Feed volume mixed (ml)")),
  "must tell the clinician what is missing",
);

/* --- 4. Per-product overrides beat the defaults -------------------------- */
const custom = n({
  feedType: "Expressed breast milk (EBM)",
  enteralMlKgDay: 150,
  fortificationAmount: 1,
  fortificationFeedVolumeMl: 25,
  fortifierKcalPerUnit: 5,
  fortifierProteinPerUnit: 0.4,
});
assert.equal(custom.fortKcalPerMl, 0.2, "1 unit x 5 kcal / 25 ml");
assert.equal(custom.fortProteinPerMl, 0.016);
assert.equal(custom.effectiveKcalPerMl, 0.87);
assert.equal(custom.fortKcal, 30, "150 ml x 0.2");

/* --- 5. Fortification also applies when a feed plan drives the volume ---- */
const planned = n({
  feedPlan: "increasing",
  tfiMlKgDay: 150,
  feedIncrementMlKgDay: 20,
  ivMlKgDay: 20,
  feedType: "Expressed breast milk (EBM)",
  fortificationAmount: 4,
  fortificationFeedVolumeMl: 100,
});
assert.equal(planned.feedPlan.enteralMlKgDay, 130, "plan sets the enteral volume");
assert.equal(planned.enteralKcal, 107.9, "130 ml x 0.83 kcal/ml");
assert.equal(planned.fortKcal, 20.8, "130 ml x 0.16");
assert.equal(planned.enteralProtein, 3.15, "130 ml x 0.0242");

/* --- 6. NPO on full parenteral nutrition: protein comes from AA alone ---- */
const tpn = n({ feedType: "NPO / Nil per oral", enteralMlKgDay: 0, ivMlKgDay: 120, dextrosePct: 12.5, aminoAcid: 3.5, lipid: 3 });
assert.equal(tpn.enteralKcal, 0);
assert.equal(tpn.milkProtein, 0);
assert.equal(tpn.aaProtein, 3.5);
assert.equal(tpn.totalProtein, 3.5);
assert.equal(tpn.gir, 10.42, "12.5% x 120 x 10 / 1440");
assert.equal(tpn.dextroseG, 15);
assert.equal(tpn.dextroseKcal, 51);
assert.equal(tpn.lipidKcal, 27);
assert.equal(tpn.aaKcal, 14, "3.5 g x 4");
assert.equal(tpn.ivKcal, 92, "dextrose 51 + AA 14 + lipid 27");
assert.equal(tpn.totalKcal, 92);

/* --- 7. Lipid carries energy but no usable protein ----------------------- */
assert.equal(LIPID_PROTEIN_G_PER_G, 0);
const lipidOnly = n({ feedType: "NPO / Nil per oral", ivMlKgDay: 80, lipid: 3 });
assert.equal(lipidOnly.lipidKcal, 27);
assert.equal(lipidOnly.lipidProtein, 0);
assert.equal(lipidOnly.totalProtein, 0);

/* --- 8. Defaults are the documented HMF values --------------------------- */
assert.equal(FORTIFIER_KCAL_PER_UNIT, 4);
assert.equal(FORTIFIER_PROTEIN_G_PER_UNIT, 0.33);

/* --- 9. Totals are the sum of the printed breakdown ---------------------- */
for (const c of [plain, fort, custom, planned, tpn]) {
  assert.equal(
    Math.round((c.milkKcal + c.fortKcal + c.dextroseKcal + c.aaKcal + c.lipidKcal) * 10) / 10,
    c.totalKcal,
    "energy breakdown must add up to the total",
  );
  assert.equal(
    Math.round((c.milkProtein + c.fortProtein + c.aaProtein + c.lipidProtein) * 100) / 100,
    c.totalProtein,
    "protein breakdown must add up to the total",
  );
}

console.log("Nutrition source-breakdown tests passed (feeds, fortification, IV, protein)");
