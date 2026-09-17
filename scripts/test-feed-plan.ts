import assert from "node:assert/strict";
import { calcNutrition, resolveFeedPlan, type Clinical } from "../src/lib/clinical";

/**
 * Sample cases for the feeds & nutrition plan.
 *
 * Each case below maps to one of the SAMPLE babies created by
 * src/app/api/seed/route.ts, so the same numbers can be checked by eye in the
 * UI. Run with: npx tsx scripts/test-feed-plan.ts
 */
const WT = 1.5; // kg
const fluids = (f: NonNullable<Clinical["fluids"]>) => ({ fluids: f });

/* --- Case A: increasing, increase given IV today, IV = remainder ---------- */
const a = resolveFeedPlan(
  { feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, feedFreq: "3 hourly" },
  WT,
);
assert.equal(a.enteralMlKgDay, 130);
assert.equal(a.ivMlKgDay, 20);
assert.equal(a.tomorrowEnteralMlKgDay, 150);
assert.equal(a.totalFluidsMlKgDay, 150);
assert.equal(a.reconciled, true);
assert.equal(a.feedsPerDay, 8);
assert.equal(a.perFeedMl, 24.38);
const an = calcNutrition(
  fluids({ ...{ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, feedFreq: "3 hourly" }, feedType: "Preterm formula", dextrosePct: 10 }),
);
assert.equal(an.ivMl, 20);
assert.equal(an.ivKcal, 6.8, "IV dextrose energy must be counted");
assert.equal(an.totalKcal, 110.8);

/* --- Case B: static with IV fluids entered alongside ---------------------- */
const b = resolveFeedPlan(
  { feedPlan: "static", tfiMlKgDay: 150, ivSource: "entered", ivMlKgDay: 30, feedFreq: "3 hourly" },
  WT,
);
assert.equal(b.enteralMlKgDay, 150);
assert.equal(b.ivMlKgDay, 30, "entered IV must not be zeroed");
assert.equal(b.totalFluidsMlKgDay, 180);
assert.equal(b.perFeedMl, 28.13);
const bn = calcNutrition(
  fluids({ feedPlan: "static", tfiMlKgDay: 150, ivSource: "entered", ivMlKgDay: 30, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(bn.ivKcal, 10.2, "30 ml/kg/d of 10% dextrose = 3 g/kg/d x 3.4");
assert.equal(bn.totalKcal, 130.2, "was 120 before the entered-IV fix");

/* --- Case C: increasing, increase is tomorrow's feed target -------------- */
const c = resolveFeedPlan(
  {
    feedPlan: "increasing",
    tfiMlKgDay: 150,
    feedIncrementMlKgDay: 20,
    increaseAppliesTo: "tomorrow-target",
    ivSource: "entered",
    ivMlKgDay: 25,
    feedFreq: "3 hourly",
  },
  WT,
);
assert.equal(c.enteralMlKgDay, 150, "today runs at the full TFI");
assert.equal(c.tomorrowEnteralMlKgDay, 170, "steps up by the increase");
assert.equal(c.ivMlKgDay, 25);
assert.equal(c.totalFluidsMlKgDay, 175);
const cn = calcNutrition(
  fluids({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", ivSource: "entered", ivMlKgDay: 25, feedType: "Preterm formula", dextrosePct: 10, feedFreq: "3 hourly" }),
);
assert.equal(cn.ivKcal, 8.5);
assert.equal(cn.totalKcal, 128.5);

/* --- Case D: static, no IV (plain divided feeds) -------------------------- */
const d = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 160, feedFreq: "2 hourly" }, WT);
assert.equal(d.enteralMlKgDay, 160);
assert.equal(d.ivMlKgDay, 0);
assert.equal(d.reconciled, true);
assert.equal(d.feedsPerDay, 12);
assert.equal(d.perFeedMl, 20);

/* --- Case E: guard - entered IV must never vanish silently ---------------- */
const e = resolveFeedPlan(
  { feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 30, feedFreq: "3 hourly" },
  WT,
);
assert.equal(e.ivSource, "remainder");
assert.equal(
  e.notes.some((n) => n.includes("energy is currently excluded")),
  true,
  "a prescribed IV that the plan cannot account for must warn",
);
assert.equal(
  resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", feedFreq: "3 hourly" }).notes.some(
    (n) => n.includes("if IV fluids are running"),
  ),
  true,
  "tomorrow-target with remainder IV must explain the zero remainder",
);

/* --- Edge cases ----------------------------------------------------------- */
const over = resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 20, feedIncrementMlKgDay: 30, feedFreq: "2 hourly" }, 1);
assert.equal(over.enteralMlKgDay, 0, "enteral floors at 0");
assert.equal(over.ivMlKgDay, 20, "IV capped at TFI");

const clamped = resolveFeedPlan({ feedPlan: "static", tfiMlKgDay: 300, feedFreq: "3 hourly" }, WT);
assert.equal(clamped.tfi, 250);
assert.equal(clamped.notes.some((n) => n.includes("clamped")), true);

const tomorrowClamped = resolveFeedPlan({ feedPlan: "increasing", tfiMlKgDay: 240, feedIncrementMlKgDay: 20, increaseAppliesTo: "tomorrow-target", feedFreq: "3 hourly" }, WT);
assert.equal(tomorrowClamped.tomorrowEnteralMlKgDay, 250, "next 24 h target is capped");

assert.equal(resolveFeedPlan({ feedPlan: "static", feedFreq: "3 hourly" }).active, false, "no TFI means the plan is inactive");

/* --- Legacy records without a plan keep the old behaviour ----------------- */
const legacy = calcNutrition(fluids({ enteralMlKgDay: 100, feedType: "Preterm formula" }));
assert.equal(legacy.feedPlan.active, false);
assert.equal(legacy.enteralMl, 100);
assert.equal(legacy.totalKcal, 80);

/* --- A manual GIR still wins over derivation ------------------------------ */
const manual = calcNutrition(fluids({ enteralMlKgDay: 100, feedType: "Preterm formula", ivMlKgDay: 50, dextrosePct: 10, gir: 6, girManual: true }));
assert.equal(manual.gir, 6);
assert.equal(manual.girSource, "manual");

console.log("Feed plan sample cases passed (A-E + edges + legacy)");
