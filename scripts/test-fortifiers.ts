/**
 * Fortifier products, fractional sachets, and doses per day.
 *
 * The rule being tested: the amount is a DOSE, given a number of times a day,
 * mixed into a known volume. Crediting that to the whole day's enteral volume
 * would overstate energy several-fold, so the uplift is scaled to the volume
 * that is actually fortified — which needs the weight to express per kg.
 *
 * Run with: npx tsx scripts/test-fortifiers.ts
 */
import assert from "node:assert/strict";
import {
  calcNutrition,
  FORTIFIER_CATALOG,
  fortifierById,
  type Clinical,
} from "../src/lib/clinical";

const fluids = (x: NonNullable<Clinical["fluids"]>): Clinical => ({ fluids: x });
const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

/* --- 1. Catalogue values match manufacturer data -------------------------- */
const prenan = fortifierById("prenan-fm85")!;
assert.equal(prenan.unit, "sachet");
assert.equal(prenan.kcalPerUnit, 4.35, "PreNAN FM 85: 435 kcal per 100 g powder");
assert.equal(prenan.proteinPerUnit, 0.355, "PreNAN FM 85: 35.5 g protein per 100 g");
assert.deepEqual([...prenan.steps], [0.25, 0.5, 1], "1/4, 1/2 and 1 sachet");
assert.equal(prenan.stepLabel(0.25), "1/4 sachet");
assert.equal(prenan.stepLabel(1), "1 sachet");

for (const id of ["mmf", "lhmf"]) {
  const p = fortifierById(id)!;
  assert.equal(p.unit, "sachet", `${id} is dosed in sachets`);
  assert.deepEqual([...p.steps], [0.25, 0.5, 1], `${id} offers 1/4, 1/2 and 1 sachet`);
  assert.equal(p.kcalPerUnit, 4.3);
  assert.equal(p.proteinPerUnit, 0.33);
}

const neocate = fortifierById("neocate")!;
assert.equal(neocate.unit, "g", "Neocate is weighed in grams");
assert.equal(neocate.kcalPerUnit, 4.87, "Neocate: 1 g provides 4.87 kcal");
assert.equal(round(neocate.proteinPerUnit, 3), 0.136, "13.5 g protein per 483 kcal");
assert.equal(Math.min(...neocate.steps), 0.5, "from 0.5 g");
assert.equal(Math.max(...neocate.steps), 1.5, "to 1.5 g");

const neosure = fortifierById("neosure")!;
assert.equal(neosure.kcalPerUnit, 5.13, "NeoSure: 513 kcal per 100 g");
assert.equal(neosure.proteinPerUnit, 0.15, "NeoSure: 15 g protein per 100 g");
assert.equal(FORTIFIER_CATALOG.length, 5);
assert.equal(fortifierById("does-not-exist"), undefined);

/* --- 2. The user's example: 0.5 g given 2 times -------------------------- */
// 1.5 kg baby, 8 feeds/day (3 hourly), 160 ml/kg/day enteral.
const dose = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "3 hourly",
    fortifierProductId: "neocate",
    fortificationAmount: 0.5,
    fortificationFeedVolumeMl: 100,
    fortificationDosesPerDay: 2,
  }),
  1500,
);
assert.equal(dose.fortDosesPerDay, 2);
assert.equal(dose.fortFeedsPerDay, 8, "3 hourly = 8 feeds/day");
assert.equal(round(dose.fortKcalPerMlInFeed, 5), 0.02435, "0.5 g x 4.87 kcal/g in 100 ml");
// Fortified volume = 100 ml x 2 doses = 200 ml/day = 133.3 ml/kg/day of 160.
assert.equal(round(dose.fortFraction, 3), 0.833, "only the fortified share is uplifted");
// fortKcal is contracted to 1 dp, so compare at that precision.
assert.equal(round(dose.fortKcal, 1), 3.2, "0.5 g x 2 doses x 4.87 = 4.87 kcal/day / 1.5 kg");
// Independent absolute check, not via the per-ml path.
const absoluteKcalPerKg = (0.5 * 2 * 4.87) / 1.5;
assert.equal(round(absoluteKcalPerKg, 4), 3.2467, "the absolute figure the per-ml path must land on");
assert.equal(round(dose.fortKcal, 1), round(absoluteKcalPerKg, 1), "matches the absolute dose");
assert.equal(round(dose.fortProtein, 2), round((0.5 * 2 * 0.136) / 1.5, 2));

/* --- 3. Without doses/day, every feed is fortified (legacy behaviour) ----- */
const everyFeed = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "3 hourly",
    fortifierProductId: "neocate",
    fortificationAmount: 0.5,
    fortificationFeedVolumeMl: 100,
  }),
  1500,
);
assert.equal(everyFeed.fortDosesPerDay, 8, "defaults to every feed");
assert.equal(everyFeed.fortFraction, 1, "the whole enteral volume is fortified");
assert.ok(everyFeed.fortKcal > dose.fortKcal, "fortifying every feed gives more energy");

/* --- 4. Fractional sachets ------------------------------------------------ */
const half = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "2 hourly",
    fortifierProductId: "mmf",
    fortificationAmount: 0.5,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 12,
  }),
  1500,
);
assert.equal(round(half.fortKcalPerMlInFeed, 3), 0.086, "1/2 sachet x 4.3 kcal in 25 ml");
assert.equal(half.fortFraction, 1, "25 ml x 12 doses = 300 ml/day, more than the 160 ml/kg/day enteral");
assert.ok(
  half.warnings.some((w) => /exceeds the recorded enteral volume/.test(w)),
  "warns when the fortified volume outruns the enteral volume",
);

const quarter = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    fortifierProductId: "prenan-fm85",
    fortificationAmount: 0.25,
    fortificationFeedVolumeMl: 25,
  }),
  1500,
);
assert.equal(round(quarter.fortKcalPerMlInFeed, 4), round((0.25 * 4.35) / 25, 4));

/* --- 5. More doses than feeds is flagged ---------------------------------- */
const over = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "4 hourly",
    fortifierProductId: "mmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 9,
  }),
  1500,
);
assert.equal(over.fortFeedsPerDay, 6);
assert.ok(
  over.warnings.some((w) => /9 feeds\/day/.test(w) && /6 feeds\/day/.test(w)),
  "flags a dose count above the feed count",
);
// 25 ml x 9 doses / 1.5 kg = 150 ml/kg/day, still inside the 160 ml/kg/day enteral.
assert.equal(round(over.fortFraction, 3), 0.938, "the fortified share is 150 of 160 ml/kg/day");
assert.ok(over.fortFraction < 1, "so it is not credited to the whole day");
assert.equal(
  over.warnings.filter((w) => /exceeds the recorded enteral volume/.test(w)).length,
  0,
  "and no over-volume warning fires when it fits",
);

/* --- 6. Per-record overrides still beat the catalogue --------------------- */
const override = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    fortifierProductId: "mmf",
    fortifierKcalPerUnit: 5,
    fortifierProteinPerUnit: 0.4,
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
  }),
  1500,
);
assert.equal(round(override.fortKcalPerMlInFeed, 3), 0.2, "the chart's value wins over the table");

/* --- 7. A product with no amount contributes nothing ---------------------- */
const none = calcNutrition(fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 160, fortifierProductId: "mmf" }), 1500);
assert.equal(none.fortified, false);
assert.equal(none.fortKcal, 0);
assert.equal(none.fortDosesPerDay, 0);

/* --- 8. Breakdown still reconciles --------------------------------------- */
for (const c of [dose, everyFeed, half, quarter, over, override]) {
  assert.equal(round(c.milkKcal + c.fortKcal, 1), c.enteralKcal, "milk + fortifier = enteral energy");
  assert.equal(round(c.milkProtein + c.fortProtein, 2), c.enteralProtein, "protein breakdown reconciles");
  assert.equal(round(c.milkKcal + c.fortKcal + c.dextroseKcal + c.aaKcal + c.lipidKcal, 1), c.totalKcal);
}

console.log("Fortifier tests passed (product values, fractional sachets, doses per day)");
