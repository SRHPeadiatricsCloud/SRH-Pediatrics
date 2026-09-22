import assert from "node:assert/strict";
import { calcNutrition, resolveFeedPlan, type Clinical } from "../src/lib/clinical";

/**
 * Sample cases for the enteral feed plan.
 *
 * The plan drives the enteral volume only; IV fluids are always entered by
 * hand and are never derived or overwritten. Each case below maps to one of
 * the SAMPLE babies created by src/app/api/seed/route.ts, so the same numbers
 * can be checked by eye in the UI. Run with: npx tsx scripts/test-feed-plan.ts
 */
const WT = 1.5; // kg
const fluids = (f: NonNullable<Clinical["fluids"]>) => ({ fluids: f });

/* --- Case A: increasing, increase given IV today, IV typed to match ------- */
const a = resolveFeedPlan(
  { feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: 20, feedFreq: "3 hourly" },
  WT,
);
assert.equal(a.enteralMlKgDay, 130);
assert.equal(a.ivMlKgDay, 20, "the typed IV is used as-is");
assert.equal(a.ivSuggestedMlKgDay, 20);
assert.equal(a.tomorrowEnteralMlKgDay, 150);
assert.equal(a.totalFluidsMlKgDay, 150);
assert.equal(a.reconciled, true);
assert.equal(a.feedsPerDay, 8);
assert.equal(a.perFeedMl, 24.38);
assert.deepEqual(a.notes, []);
const an = calcNutrition(
  fluids({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: 20, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(an.ivMl, 20);
assert.equal(an.ivKcal, 6.8, "IV dextrose energy must be counted");
// Preterm formula updated to exact lab value 0.79 kcal/ml (was 0.8):
// Enteral 130 x 0.79 = 102.7 + IV 6.8 = 109.5 kcal/kg/day
assert.equal(an.totalKcal, 109.5);

/* --- Case B: static feeds with IV fluids running alongside ---------------- */
// TFI is Total Fluid Intake: Enteral + IV = TFI.
// When TFI is 150 and IV is 30, enteral = 120 so total fluids = 150.
const b = resolveFeedPlan(
  { feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 30, feedFreq: "3 hourly" },
  WT,
);
assert.equal(b.enteralMlKgDay, 120, "enteral + IV must equal TFI");
assert.equal(b.ivMlKgDay, 30, "a prescribed IV is kept");
assert.equal(b.ivSuggestedMlKgDay, 30);
assert.equal(b.totalFluidsMlKgDay, 150, "total fluids perfectly equals TFI target");
assert.equal(b.reconciled, true);
assert.equal(b.perFeedMl, 22.5); // 120 * 1.5 / 8 = 22.5
assert.equal(b.notes.length, 0);
const bn = calcNutrition(
  fluids({ feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 30, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(bn.ivKcal, 10.2, "30 ml/kg/d of 10% dextrose = 3 g/kg/d x 3.4");
// 120 x 0.79 = 94.8 + 10.2 = 105.0
assert.equal(bn.totalKcal, 105);

/* --- Case C: increasing, increase is tomorrow's feed target -------------- */
// TFI 150, IV 25 => enteral today = 125, total = 150 (TFI target), tomorrow = 145 (+20)
const c = resolveFeedPlan(
  {
    feedPlan: "increasing",
    tfiMlKgDay: 150,
    feedIncrementMlKgDay: 20,
    increaseAppliesTo: "tomorrow-target",
    ivMlKgDay: 25,
    feedFreq: "3 hourly",
  },
  WT,
);
assert.equal(c.enteralMlKgDay, 125, "enteral today is 150 - 25 IV");
assert.equal(c.tomorrowEnteralMlKgDay, 145, "tomorrow is enteral + 20 increment");
assert.equal(c.ivMlKgDay, 25);
assert.equal(c.ivSuggestedMlKgDay, 25);
assert.equal(c.totalFluidsMlKgDay, 150, "total fluids matches TFI target 150");
assert.equal(c.reconciled, true);
const cn = calcNutrition(
  fluids({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", ivMlKgDay: 25, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(cn.ivKcal, 8.5);
// 125 x 0.79 = 98.75 + 8.5 = 107.25 -> 107.3
assert.equal(cn.totalKcal, 107.3);

/* --- Case D: static, no IV (plain divided feeds) -------------------------- */
const d = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 160, feedFreq: "2 hourly" }, WT);
assert.equal(d.enteralMlKgDay, 160);
assert.equal(d.ivMlKgDay, 0);
assert.equal(d.totalFluidsMlKgDay, 160);
assert.equal(d.reconciled, true);
assert.equal(d.feedsPerDay, 12);
assert.equal(d.perFeedMl, 20);
// 160 x 0.79 = 126.4
assert.equal(calcNutrition(fluids({ feedPlan: "static", tfiMlKgDay: 160, feedType: "Preterm formula", feedFreq: "2 hourly" })).totalKcal, 126.4);

/* --- Case E: guard - IV above the TFI remainder is reported, not hidden --- */
const e = resolveFeedPlan(
  { feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: 40, feedFreq: "3 hourly" },
  WT,
);
assert.equal(e.enteralMlKgDay, 110, "enteral is 150 - 40 IV = 110");
assert.equal(e.ivMlKgDay, 40, "still 40 - the plan reports, it does not override");
assert.equal(e.ivSuggestedMlKgDay, 40);
assert.equal(e.totalFluidsMlKgDay, 150);
assert.equal(e.reconciled, true);
// with enteral correctly reduced by IV, fluids perfectly equal TFI
assert.equal(e.notes.length, 0);

/* --- The IV field is a pass-through: whatever is typed is what is used ---- */
for (const iv of [0, 5, 20, 30, 120, 250]) {
  assert.equal(
    resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: iv, feedFreq: "3 hourly" }, WT).ivMlKgDay,
    iv,
    `IV ${iv} must survive a static plan unchanged`,
  );
  assert.equal(
    resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: iv, feedFreq: "3 hourly" }, WT).ivMlKgDay,
    iv,
    `IV ${iv} must survive an increasing plan unchanged`,
  );
}

/* --- Edge cases ----------------------------------------------------------- */
const over = resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 20, feedIncrementMlKgDay: 30, feedFreq: "2 hourly" }, 1);
assert.equal(over.enteralMlKgDay, 0, "enteral floors at 0");
assert.equal(over.ivSuggestedMlKgDay, 20, "the whole TFI is still available as IV");
assert.equal(over.ivMlKgDay, 0);

const clamped = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 300, feedFreq: "3 hourly" }, WT);
assert.equal(clamped.tfi, 250);
assert.equal(clamped.notes.some((n) => n.includes("clamped")), true);

const tomorrowClamped = resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 240, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", feedFreq: "3 hourly" }, WT);
assert.equal(tomorrowClamped.tomorrowEnteralMlKgDay, 250, "next 24 h target is capped");

// An inactive plan still reports the typed IV so callers never lose it.
const noPlan = resolveFeedPlan({ ivMlKgDay: 45, feedFreq: "3 hourly" });
assert.equal(noPlan.active, false, "no TFI means the plan is inactive");
assert.equal(noPlan.ivMlKgDay, 45);

/* --- Legacy records without a plan keep the old behaviour ----------------- */
const legacy = calcNutrition(fluids({ enteralMlKgDay: 100, feedType: "Preterm formula" }));
assert.equal(legacy.feedPlan.active, false);
assert.equal(legacy.enteralMl, 100);
// 100 x 0.79 = 79
assert.equal(legacy.totalKcal, 79);

/* --- A manual GIR still wins over derivation ------------------------------ */
const manual = calcNutrition(fluids({ enteralMlKgDay: 100, feedType: "Preterm formula", ivMlKgDay: 50, dextrosePct: 10, gir: 6, girManual: true }));
assert.equal(manual.gir, 6);
assert.equal(manual.girSource, "manual");

console.log("Feed plan sample cases passed (A-E + IV pass-through + edges + legacy)");
