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
assert.equal(an.totalKcal, 110.8);

/* --- Case B: static feeds with IV fluids running alongside ---------------- */
const b = resolveFeedPlan(
  { feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 30, feedFreq: "3 hourly" },
  WT,
);
assert.equal(b.enteralMlKgDay, 150);
assert.equal(b.ivMlKgDay, 30, "a prescribed IV must never be zeroed by a static plan");
assert.equal(b.ivSuggestedMlKgDay, 0);
assert.equal(b.totalFluidsMlKgDay, 180);
assert.equal(b.reconciled, false);
assert.equal(b.perFeedMl, 28.13);
assert.equal(b.notes.length, 1);
assert.match(b.notes[0], /Total fluids 180 ml\/kg\/day exceed the TFI target 150 by 30/);
const bn = calcNutrition(
  fluids({ feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 30, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(bn.ivKcal, 10.2, "30 ml/kg/d of 10% dextrose = 3 g/kg/d x 3.4");
assert.equal(bn.totalKcal, 130.2, "was 120 before the IV energy fix");

/* --- Case C: increasing, increase is tomorrow's feed target -------------- */
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
assert.equal(c.enteralMlKgDay, 150, "today runs at the full TFI");
assert.equal(c.tomorrowEnteralMlKgDay, 170, "steps up by the increase");
assert.equal(c.ivMlKgDay, 25);
assert.equal(c.ivSuggestedMlKgDay, 0);
assert.equal(c.totalFluidsMlKgDay, 175);
const cn = calcNutrition(
  fluids({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", ivMlKgDay: 25, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(cn.ivKcal, 8.5);
assert.equal(cn.totalKcal, 128.5);

/* --- Case D: static, no IV (plain divided feeds) -------------------------- */
const d = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 160, feedFreq: "2 hourly" }, WT);
assert.equal(d.enteralMlKgDay, 160);
assert.equal(d.ivMlKgDay, 0);
assert.equal(d.totalFluidsMlKgDay, 160);
assert.equal(d.reconciled, true);
assert.equal(d.feedsPerDay, 12);
assert.equal(d.perFeedMl, 20);
assert.equal(calcNutrition(fluids({ feedPlan: "static", tfiMlKgDay: 160, feedType: "Preterm formula", feedFreq: "2 hourly" })).totalKcal, 128);

/* --- Case E: guard - IV above the TFI remainder is reported, not hidden --- */
const e = resolveFeedPlan(
  { feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: 40, feedFreq: "3 hourly" },
  WT,
);
assert.equal(e.enteralMlKgDay, 130);
assert.equal(e.ivMlKgDay, 40, "still 40 - the plan reports, it does not override");
assert.equal(e.ivSuggestedMlKgDay, 20);
assert.equal(e.totalFluidsMlKgDay, 170);
assert.equal(e.reconciled, false);
assert.match(e.notes[0], /exceed the TFI target 150 by 20/);

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
assert.equal(legacy.totalKcal, 80);

/* --- A manual GIR still wins over derivation ------------------------------ */
const manual = calcNutrition(fluids({ enteralMlKgDay: 100, feedType: "Preterm formula", ivMlKgDay: 50, dextrosePct: 10, gir: 6, girManual: true }));
assert.equal(manual.gir, 6);
assert.equal(manual.girSource, "manual");

console.log("Feed plan sample cases passed (A-E + IV pass-through + edges + legacy)");
