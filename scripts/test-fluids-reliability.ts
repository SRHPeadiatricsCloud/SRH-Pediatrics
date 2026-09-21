/**
 * Feeds & fluids reliability: every silent assumption in calcNutrition now has
 * to announce itself. The arithmetic was already right (see test-nutrition.ts);
 * what was missing was that a wrong or incomplete input produced a confident
 * number with nothing on screen to say it was incomplete.
 *
 * Each case below was a real defect found by probing the calculator:
 *   - an unrecognised feed type priced as EBM, silently
 *   - "EBM + HMF" plus a fortifier sachet counted twice
 *   - dextrose% with no IV volume, so the dextrose energy vanished
 *   - volumes above the 250 cap clamped without a word
 *   - a fortifier on continuous feeds credited to 1 dose/day
 *   - the feed plan's own findings invisible outside the feed tab
 *   - per-feed volumes never resolving for callers that pass a weight
 *
 * Run with: npx tsx scripts/test-fluids-reliability.ts
 */
import assert from "node:assert/strict";
import { calcNutrition, resolveFeedPlan, type Clinical } from "../src/lib/clinical";

const fluids = (x: NonNullable<Clinical["fluids"]>): Clinical => ({ fluids: x });
const has = (n: ReturnType<typeof calcNutrition>, re: RegExp) => n.warnings.some((w) => re.test(w));
const count = (n: ReturnType<typeof calcNutrition>, re: RegExp) =>
  n.warnings.filter((w) => re.test(w)).length;

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

/* --- 1. An unrecognised feed type is no longer silently priced as EBM ------ */
const custom = calcNutrition(
  fluids({ feedType: "Similac Total Care 24", enteralMlKgDay: 150 }),
  1500,
);
ok(
  has(custom, /is not in the milk density table/),
  "a feed type outside the table is flagged",
);
ok(
  has(custom, /using 0\.67 kcal\/ml/),
  "and the warning names the density actually used",
);
ok(
  !has(calcNutrition(fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 150 }), 1500), /density table/),
  "a listed feed type raises nothing",
);
const noType = calcNutrition(fluids({ enteralMlKgDay: 150 }), 1500);
ok(has(noType, /No feed type chosen/), "feeds with no type at all are flagged");
ok(
  !has(calcNutrition(fluids({ enteralMlKgDay: 0 }), 1500), /No feed type chosen/),
  "but a baby who is NPO is not nagged about the feed type",
);

/* --- 2. Fortified feed type + a fortifier entry is a double count ---------- */
const twice = calcNutrition(
  fluids({
    feedType: "EBM + HMF",
    enteralMlKgDay: 150,
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 6,
  }),
  1500,
);
ok(has(twice, /counts it twice/), "fortified milk plus a fortifier is called out");
const once = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 150,
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 6,
  }),
  1500,
);
ok(!has(once, /counts it twice/), "plain EBM with a fortifier is the correct way in");

/* --- 3. Dextrose% with no IV volume ---------------------------------------- */
const dexNoIv = calcNutrition(
  fluids({ feedType: "NPO / Nil per oral", dextrosePct: 10, aminoAcid: 2 }),
  1000,
);
ok(dexNoIv.dextroseKcal === 0, "no IV volume means no dextrose energy");
ok(has(dexNoIv, /Dextrose 10% is recorded with no IV volume/), "and that is said out loud");
const dexWithIv = calcNutrition(
  fluids({ feedType: "NPO / Nil per oral", ivMlKgDay: 80, dextrosePct: 10, aminoAcid: 2 }),
  1000,
);
ok(dexWithIv.dextroseKcal > 0, "with an IV volume the dextrose is counted");
ok(!has(dexWithIv, /recorded with no IV volume/), "and no spurious warning fires");

/* --- 4. Volumes above the 250 cap say they were clamped -------------------- */
const overEnteral = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 300 }),
  1000,
);
ok(overEnteral.enteralMl === 250, "the enteral volume is capped at 250");
ok(has(overEnteral, /Enteral 300 .*used 250/), "and the clamp is reported with both numbers");

const overIv = calcNutrition(
  fluids({ feedType: "NPO / Nil per oral", ivMlKgDay: 300, dextrosePct: 10 }),
  1000,
);
ok(overIv.ivMl === 250, "the IV volume is capped at 250");
ok(
  count(overIv, /exceeds the 250 cap|above the 250 cap/) === 1,
  `the IV clamp is reported once, not twice (got ${overIv.warnings.filter((w) => /250 cap/.test(w)).length})`,
);
ok(overIv.gir === 17.36, "and the GIR is derived from the clamped 250, not the typed 300");

/* --- 5. A fortifier on continuous / on-demand feeds ------------------------ */
const continuous = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "continuous",
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
  }),
  1500,
);
ok(continuous.fortDosesPerDay === 1, "with no times/day and no fixed feeds, one dose is assumed");
ok(continuous.fortKcal < 5, "which credits almost none of the day's feeds");
ok(
  has(continuous, /only 1 dose\/day of fortifier has been counted/),
  "so the chart is told the number is an under-count",
);
const continuousFixed = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "continuous",
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 6,
  }),
  1500,
);
ok(
  !has(continuousFixed, /only 1 dose\/day/),
  "entering the times per day clears it",
);
ok(continuousFixed.fortKcal > continuous.fortKcal, "and the energy rises accordingly");

/* --- 6. Fortifier with no enteral volume, and with no weight --------------- */
const noEnteral = calcNutrition(
  fluids({
    feedType: "NPO / Nil per oral",
    enteralMlKgDay: 0,
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
    fortificationDosesPerDay: 6,
  }),
  1500,
);
ok(has(noEnteral, /no enteral volume/), "a fortifier with no feeds says why it counts nothing");
ok(
  !has(noEnteral, /exceeds the recorded enteral volume/),
  "and it does not claim the volume was 'capped' when there is none",
);

const noWeight = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 160,
    feedFreq: "3 hourly",
    fortifierProductId: "lhmf",
    fortificationAmount: 1,
    fortificationFeedVolumeMl: 25,
  }),
);
ok(noWeight.fortFraction === 1, "without a weight the fortifier is credited to the whole day");
ok(has(noWeight, /upper bound until the weight is entered/), "and that is labelled an upper bound");

/* --- 7. The feed plan's findings reach every consumer ---------------------- */
const overTfi = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    feedPlan: "static",
    tfiMlKgDay: 150,
    ivMlKgDay: 30,
    feedFreq: "3 hourly",
  }),
  1500,
);
ok(
  has(overTfi, /exceed the TFI target 150 by 30/),
  "enteral + IV above the TFI target is a warning, not just a feed-tab note",
);
const hugeTfi = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", feedPlan: "static", tfiMlKgDay: 300, feedFreq: "3 hourly" }),
  1500,
);
ok(has(hugeTfi, /TFI 300 .*clamped/), "a TFI above the cap is reported");
ok(hugeTfi.feedPlan.tfi === 250, "and clamped to 250");

/* --- 8. Per-feed volume resolves for any caller that passes a weight ------- */
const perFeed = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    feedPlan: "static",
    tfiMlKgDay: 150,
    feedFreq: "3 hourly",
  }),
  1500,
);
ok(perFeed.feedPlan.perFeedMl === 28.13, "calcNutrition now resolves ml per feed from the weight");
const directPlan = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 150, feedFreq: "3 hourly" }, 1.5);
ok(
  perFeed.feedPlan.perFeedMl === directPlan.perFeedMl,
  "and it agrees with calling the resolver directly",
);

/* --- 9. A manual override that contradicts the inputs ---------------------- */
const girClash = calcNutrition(
  fluids({ feedType: "NPO / Nil per oral", ivMlKgDay: 80, dextrosePct: 12.5, gir: 3, girManual: true }),
  900,
);
ok(girClash.gir === 3, "the manual GIR is still the one used");
ok(has(girClash, /Manual GIR 3 mg\/kg\/min disagrees with 6\.94/), "but a GIR that contradicts D% x IV is flagged");
const girFine = calcNutrition(
  fluids({ feedType: "NPO / Nil per oral", ivMlKgDay: 80, dextrosePct: 12.5, gir: 6.5, girManual: true }),
  900,
);
ok(!has(girFine, /disagrees with/), "a manual GIR within 1 mg/kg/min of the derived value is left alone");

const kcalDrift = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 150, kcal: 200, kcalManual: true }),
  1500,
);
ok(has(kcalDrift, /manual energy of 200 .*calculate 100\.5/), "a stale manual energy is flagged against the inputs");
const kcalClose = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 150, kcal: 102, kcalManual: true }),
  1500,
);
ok(!has(kcalClose, /manual energy/), "a manual energy within 5 kcal/kg/day is not noise");

/* --- 10. A stored total that contradicts enteral + IV ---------------------- */
const staleTotal = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 100, ivMlKgDay: 20, totalMlKgDay: 150 }),
  1500,
);
ok(has(staleTotal, /Recorded total fluids 150 .*enteral 100 \+ IV 20 = 120/), "a stale total is reconciled against the inputs");
ok(
  !has(
    calcNutrition(fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 100, ivMlKgDay: 20, totalMlKgDay: 120 }), 1500),
    /Recorded total fluids/,
  ),
  "and a total that matches is not flagged",
);

/* --- 11. Energy below the target says so, not just below basal -------------- */
const underTarget = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 20,
    ivMlKgDay: 140,
    dextrosePct: 7,
    aminoAcid: 3.5,
    lipid: 3,
  }),
  1080,
  { dol: 10 },
);
ok(underTarget.totalKcal > 80, "this plan clears the basal floor");
ok(underTarget.totalKcal < underTarget.kcalTarget[0], "but sits under the energy target");
ok(
  has(underTarget, /is below the 110–135 target for 1001–1500 g/),
  "so the shortfall against the target is named, with the basis",
);
ok(
  !has(underTarget, /below basal needs/),
  "and the basal warning is not repeated on top of it",
);
// Full-volume unfortified EBM is still short of the energy target — which is
// the whole reason fortification exists — so the warning should stand.
const unfortified = calcNutrition(
  fluids({ feedType: "Expressed breast milk (EBM)", enteralMlKgDay: 160, ivMlKgDay: 0 }),
  1080,
  { dol: 10 },
);
ok(unfortified.totalKcal === 107.2, `160 ml/kg/day of EBM is 107.2 kcal/kg/day (got ${unfortified.totalKcal})`);
ok(
  has(unfortified, /is below the 110–135 target/),
  "so full unfortified feeds are still flagged as short on energy",
);
// The same volume, fortified, reaches the target and is left alone.
const fortified = calcNutrition(
  fluids({ feedType: "EBM + HMF", enteralMlKgDay: 160, ivMlKgDay: 0 }),
  1080,
  { dol: 10 },
);
ok(fortified.totalKcal >= fortified.kcalTarget[0], "fortified milk at full feeds reaches the target");
ok(!has(fortified, /is below the .* target/), "and no shortfall is claimed");

/* --- 12. The arithmetic itself is unchanged -------------------------------- */
const reference = calcNutrition(
  fluids({
    feedType: "Expressed breast milk (EBM)",
    enteralMlKgDay: 150,
    ivMlKgDay: 50,
    dextrosePct: 10,
    aminoAcid: 3,
    lipid: 2,
  }),
  1500,
);
assert.equal(reference.totalKcal, 147.5, "the reference case still lands on 147.5 kcal/kg/day");
assert.equal(reference.totalProtein, 4.65, "and 4.65 g/kg/day protein");
assert.equal(reference.enteralKcal, 100.5);
assert.equal(reference.ivKcal, 47);
assert.equal(reference.gir, 3.47);
for (const n of [custom, twice, once, overEnteral, overIv, continuousFixed, perFeed, staleTotal]) {
  assert.equal(
    Math.round((n.milkKcal + n.fortKcal) * 10) / 10,
    n.enteralKcal,
    "milk + fortifier still reconciles to the enteral energy",
  );
  assert.equal(
    Math.round((n.enteralKcal + n.ivKcal) * 10) / 10,
    n.totalKcal,
    "enteral + IV still reconciles to the total",
  );
}

console.log(`Fluids reliability tests passed (${checks} checks + arithmetic invariants)`);
