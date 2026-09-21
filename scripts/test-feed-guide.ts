/**
 * The feeding guide: weight bands, the day-by-day fluid ramp, the feeding
 * pathway phases, the targets, and the suggested prescription.
 *
 * These numbers are guidance, not orders — the feed tab shows them with their
 * rationale and the clinician applies or edits them. What is tested here is
 * that they are internally consistent and stay inside the published ranges.
 *
 * Run with: npx tsx scripts/test-feed-guide.ts
 */
import assert from "node:assert/strict";
import {
  applyProtocol,
  bandIntervalHours,
  dayRampFluid,
  feedPhase,
  FEED_PHASES,
  FORTIFY_AT_ML_KG_DAY,
  PROTOCOL_FIELDS,
  protocolInUse,
  STOP_LIPID_AT_ML_KG_DAY,
  suggestFluids,
  TARGET_FIELDS,
  targetsFor,
  WEIGHT_BANDS,
  weightBand,
} from "../src/lib/feed-guide";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

/* --- 1. Weight bands cover every baby from 500 g up, with no gaps ---------- */
const bands = WEIGHT_BANDS;
for (let i = 1; i < bands.length; i++) {
  assert.equal(bands[i].min, bands[i - 1].max + 1, `${bands[i - 1].label} and ${bands[i].label} must not overlap or leave a gap`);
}
ok(weightBand(500)?.id === "microprem", "a 500 g microprem lands in the smallest band");
ok(weightBand(750)?.id === "microprem", "750 g is the top of the microprem band");
ok(weightBand(751)?.id === "elbw", "751 g starts the ELBW band");
ok(weightBand(1000)?.id === "elbw", "1000 g is still ELBW");
ok(weightBand(1001)?.id === "vlbw", "1001 g is VLBW");
ok(weightBand(1500)?.id === "vlbw", "1500 g is still VLBW");
ok(weightBand(1501)?.id === "lbw", "1501 g is LBW");
ok(weightBand(2000)?.id === "lbw", "2000 g is still LBW");
ok(weightBand(2001)?.id === "bigger", "2001 g is the largest band");
ok(weightBand(3500)?.id === "bigger", "and a term baby still resolves");
ok(weightBand(undefined) === undefined, "no weight resolves to nothing");
ok(weightBand(0) === undefined, "a zero weight resolves to nothing");

/* --- 2. The fluid ramp rises by day and never passes full feeds ------------ */
const microprem = weightBand(600)!;
const elbw = weightBand(850)!;
const vlbw = weightBand(1200)!;
assert.deepEqual(
  [1, 2, 3, 4, 5, 8].map((d) => dayRampFluid(microprem, d)),
  [110, 140, 155, 170, 180, 180],
  "≤750 g: 110 on day 1, then up to the 180 ceiling",
);
assert.deepEqual(
  [1, 2, 3, 4].map((d) => dayRampFluid(elbw, d)),
  [100, 130, 145, 160],
  "751–1000 g reaches full feeds by day 4",
);
assert.deepEqual(
  [1, 2, 3, 4].map((d) => dayRampFluid(vlbw, d)),
  [90, 110, 135, 160],
  "1001–1500 g reaches full feeds by day 4",
);
ok(dayRampFluid(microprem, 1) === microprem.day1Fluid, "day 1 is the band's day-1 volume");
for (const b of bands) {
  for (const d of [1, 2, 3, 5, 10, 30]) {
    const v = dayRampFluid(b, d);
    ok(v <= b.fullFeedsRange[1], `${b.label} day ${d} stays within the ${b.fullFeedsRange[1]} ceiling (got ${v})`);
    ok(v >= b.day1FluidRange[0], `${b.label} day ${d} never falls below the day-1 floor (got ${v})`);
  }
  ok(dayRampFluid(b, 30) === b.fullFeedsRange[1], `${b.label} reaches full feeds well before day 30`);
}
ok(dayRampFluid(vlbw) === vlbw.day1Fluid, "no day of life means day 1");

/* --- 3. Targets follow size and day ---------------------------------------- */
const tiny = targetsFor({ weightG: 600, dol: 1 });
assert.deepEqual(tiny.kcal, [115, 140], "a 600 g baby aims higher on energy");
assert.deepEqual(tiny.protein, [4, 4.5], "and higher on protein");
assert.deepEqual(tiny.fluids, [100, 120], "the day-1 fluid target is the ramp, not full feeds");
ok(/day 1 ramp/.test(tiny.basis), `the basis says why (${tiny.basis})`);

const vlbwLater = targetsFor({ weightG: 1200, dol: 10 });
assert.deepEqual(vlbwLater.fluids, [150, 160], "by day 10 the target is full feeds");
assert.deepEqual(vlbwLater.kcal, [110, 135]);
assert.deepEqual(vlbwLater.protein, [3.5, 4.5]);

const big = targetsFor({ weightG: 2200, dol: 12 });
assert.deepEqual(big.kcal, [100, 130], "a 2.2 kg preterm needs less per kg");
assert.deepEqual(big.protein, [3, 4]);

const unknown = targetsFor({});
ok(/Enter a weight/.test(unknown.basis), "no weight says so rather than guessing a band");
assert.deepEqual(unknown.kcal, [110, 135], "and falls back to the middle preterm range");

/* --- 4. The pathway phases -------------------------------------------------- */
ok(feedPhase({ weightG: 800, dol: 1 }).id === "stabilise", "day 1 with no feeds is stabilisation");
ok(feedPhase({ weightG: 800, dol: 5, enteralMlKgDay: 0 }).id === "advance", "still NPO on day 5 is flagged as feeds due");
ok(/feeds due to start/i.test(feedPhase({ weightG: 800, dol: 5, enteralMlKgDay: 0 }).label), "and the label says feeds are due");
ok(feedPhase({ weightG: 800, enteralMlKgDay: 20 }).id === "stabilise", "20 ml/kg/day is trophic");
ok(feedPhase({ weightG: 800, enteralMlKgDay: 60 }).id === "advance", "60 ml/kg/day is advancing");
ok(feedPhase({ weightG: 800, enteralMlKgDay: 120 }).id === "fortify", "120 ml/kg/day is past the fortification threshold");
ok(feedPhase({ weightG: 1200, enteralMlKgDay: 160, ivMlKgDay: 20 }).id === "wean", "full feeds with IV running is weaning");
ok(
  feedPhase({ weightG: 1200, enteralMlKgDay: 160, ivMlKgDay: 0, feedRoute: "Oral" }).id === "oral",
  "full feeds, IV off, by mouth — discharge territory",
);
const steps = FEED_PHASES.map((p) => p.id);
for (const ctx of [
  { weightG: 800, dol: 1 },
  { weightG: 800, enteralMlKgDay: 60 },
  { weightG: 800, enteralMlKgDay: 120 },
  { weightG: 1200, enteralMlKgDay: 160, ivMlKgDay: 20 },
  { weightG: 1200, enteralMlKgDay: 160, ivMlKgDay: 0, feedRoute: "Oral" },
]) {
  const ph = feedPhase(ctx);
  ok(steps[ph.step] === ph.id, `${ph.id} maps to its own position in the stepper`);
}

/* --- 5. A 600 g baby on day 1 ---------------------------------------------- */
const day1 = suggestFluids({ weightG: 600, dol: 1, gestWeeks: 25 });
ok(day1.fields.enteralMlKgDay === 10, `trophic start for ≤750 g is 10 ml/kg/day (got ${day1.fields.enteralMlKgDay})`);
ok(day1.fluidTarget === 110, "total fluids on day 1 are the ramp, not the feeds");
ok(day1.usesPlan === false, "the plan is not used while the IV carries the fluid");
ok(day1.fields.tfiMlKgDay === undefined, "so no TFI target is written");
ok(day1.fields.totalMlKgDay === 110, "the total is written directly instead");
ok(day1.fields.ivMlKgDay === 100, "and the IV carries the other 100 ml/kg/day");
ok(day1.fields.feedFreq === "2 hourly", "2-hourly below 1250 g");
ok(day1.fields.feedIncrementMlKgDay === 15, "advance 15 ml/kg/day at this size");
ok(day1.fields.feedPlan === "increasing", "an increase means the increasing plan");
ok(day1.fields.dextrosePct >= 5 && day1.fields.dextrosePct <= 25, `dextrose stays between D5 and D25 (got D${day1.fields.dextrosePct})`);
ok(day1.fields.aminoAcid === 2.5, "amino acids start at 2.5 g/kg/day for a microprem");
ok(day1.fields.lipid === 1, "lipid starts at 1 g/kg/day");
ok(day1.fields.fortifierProductId === undefined, "no fortifier on day 1");
ok(
  day1.notes.some((n) => /Not yet time to fortify/.test(n)),
  "and it says why not",
);
ok(/Day 1 · ≤750 g/.test(day1.headline), `headline names the day and the size (${day1.headline})`);
ok(day1.phase.id === "stabilise", "the phase describes where the baby is, not where the plan would take them");

// A baby who has not been fed by day 10 still starts on trophic volumes, and the
// guide says so rather than jumping to the day-10 ramp.
const overdue = suggestFluids({ weightG: 1080, dol: 10, enteralMlKgDay: 0, ivMlKgDay: 0 });
ok(overdue.fields.enteralMlKgDay === 20, `starting volume is trophic, not the ramp (got ${overdue.fields.enteralMlKgDay})`);
ok(overdue.fields.ivMlKgDay === 140, "and the IV carries the rest of the day-10 fluid target");
ok(overdue.phase.id === "advance", "the phase still says feeds are due, because none are recorded");
ok(
  overdue.notes.some((n) => /No enteral feeds recorded on day 10/.test(n)),
  "and the delay is called out explicitly",
);
ok(
  feedPhase({ weightG: 1080, dol: 10, enteralMlKgDay: 20 }).id === "stabilise",
  "once the trophic feeds are on the chart the strip reads trophic",
);

// The suggestion must be internally consistent with the plan resolver.
ok(
  day1.fields.enteralMlKgDay + day1.fields.ivMlKgDay === day1.fluidTarget,
  "enteral + IV reconciles to the fluid target it suggests",
);

/* --- 6. A 1200 g baby on day 6, already on 120 ml/kg/day of fortified milk - */
const day6 = suggestFluids({
  weightG: 1200,
  dol: 6,
  gestWeeks: 30,
  enteralMlKgDay: 120,
  enteralProteinGKgDay: 3.75,
});
ok(day6.fields.enteralMlKgDay === 150, `advance 30 ml/kg/day to 150 (got ${day6.fields.enteralMlKgDay})`);
ok(day6.fields.feedIncrementMlKgDay === 10, "the last step to full feeds is capped, not a full 30");
ok(day6.fields.fortifierProductId === "lhmf", "fortification is on past 100 ml/kg/day");
ok(day6.fields.fortificationAmount === 1, "full strength, not half");
ok(day6.fields.fortificationDosesPerDay === 8, "3-hourly feeds means 8 doses a day");
ok(day6.fields.lipid === 0, `IV lipid stops at ${STOP_LIPID_AT_ML_KG_DAY} ml/kg/day of fortified milk`);
ok(day6.fields.aminoAcid === 0, "fortified milk already covers the protein target, so IV amino acids stop");
ok(day6.fields.feedFreq === "3 hourly", "3-hourly above 1250 g");

/* --- 7. A 850 g baby on day 4, mid-advancement ------------------------------ */
const day4 = suggestFluids({ weightG: 850, dol: 4, enteralMlKgDay: 100, enteralProteinGKgDay: 2.5 });
ok(day4.fields.enteralMlKgDay === 120, "advance 20 ml/kg/day for 751–1000 g");
ok(day4.fields.aminoAcid === 1.5, "the IV covers the protein gap the feeds leave (4 − 2.5)");
ok(day4.fields.lipid === 0, "lipid stops at 100 ml/kg/day of enteral");
ok(day4.fields.dextrosePct >= 5 && day4.fields.dextrosePct <= 25, `dextrose stays achievable (got D${day4.fields.dextrosePct})`);
ok(day4.fields.ivMlKgDay === 40, "the IV makes up 160 − 120");

/* --- 8. Half strength when fortification has just started ------------------ */
// 751-1000 g advances 20 ml/kg/day, so 85 lands on 105 — just over the line.
const justFortifying = suggestFluids({ weightG: 850, dol: 5, enteralMlKgDay: 85, enteralProteinGKgDay: 1.1 });
ok(justFortifying.fields.enteralMlKgDay === 105, `advancing 20 ml/kg/day to 105 (got ${justFortifying.fields.enteralMlKgDay})`);
ok(justFortifying.fields.fortificationAmount === 0.5, "half strength (1:50) when it has just begun");
ok(
  justFortifying.notes.some((n) => /half strength for 48 h/.test(n)),
  "and it says to step up after 48 h",
);

/* --- 9. A baby already ahead of the ramp is not pulled back ---------------- */
const ahead = suggestFluids({ weightG: 1200, dol: 2, enteralMlKgDay: 100, enteralProteinGKgDay: 1.1 });
ok(ahead.fields.enteralMlKgDay >= 100, "never suggests less feed than the baby is already on");
ok(
  ahead.notes.some((n) => /ahead of the day-2 fluid ramp/.test(n)),
  "and it notes that the feeds are ahead of the ramp",
);

/* --- 10. Guard rails -------------------------------------------------------- */
ok(FORTIFY_AT_ML_KG_DAY === 100, "fortification threshold is 100 ml/kg/day");
for (const ctx of [
  { weightG: 500, dol: 1 },
  { weightG: 600, dol: 3 },
  { weightG: 900, dol: 7 },
  { weightG: 1400, dol: 10 },
  { weightG: 2100, dol: 14 },
  {},
]) {
  const g = suggestFluids(ctx);
  const f = g.fields;
  ok(f.enteralMlKgDay >= 0 && f.enteralMlKgDay <= 250, `enteral within limits (${f.enteralMlKgDay})`);
  ok(
    f.tfiMlKgDay === undefined || (f.tfiMlKgDay >= 0 && f.tfiMlKgDay <= 250),
    `TFI within limits when set (${f.tfiMlKgDay})`,
  );
  ok(
    f.totalMlKgDay === undefined || (f.totalMlKgDay >= 0 && f.totalMlKgDay <= 250),
    `total fluids within limits when set (${f.totalMlKgDay})`,
  );
  ok(f.ivMlKgDay >= 0 && f.ivMlKgDay <= 250, `IV within limits (${f.ivMlKgDay})`);
  ok(f.dextrosePct >= 5 && f.dextrosePct <= 25, `dextrose between D5 and D25 (${f.dextrosePct})`);
  ok(f.aminoAcid >= 0 && f.aminoAcid <= 4.5, `amino acids within 0–4.5 (${f.aminoAcid})`);
  ok(f.lipid >= 0 && f.lipid <= 3, `lipid within 0–3 (${f.lipid})`);
  ok(Math.abs(f.enteralMlKgDay + f.ivMlKgDay - g.fluidTarget) < 0.01, "enteral + IV = the fluid target");
  ok(f.enteralMlKgDay <= g.fluidTarget + 0.01, "feeds never exceed the fluid target");
  ok(
    g.usesPlan
      ? f.tfiMlKgDay === g.fluidTarget && f.totalMlKgDay === undefined
      : f.tfiMlKgDay === undefined && f.totalMlKgDay === g.fluidTarget,
    `${g.usesPlan ? "plan" : "direct"} mode writes the fluid target to exactly one field`,
  );
  // With the plan, the resolver must agree with what the suggestion promised.
  if (g.usesPlan) {
    ok(f.feedPlan === "increasing" || f.feedPlan === "static", "a valid plan mode is chosen");
    ok(f.enteralMlKgDay >= g.fluidTarget - 0.5, "and the plan's enteral volume equals the fluid target");
  }
  for (const key of Object.keys(f)) {
    ok(g.why[key] !== undefined, `every suggested field carries a rationale (${key})`);
  }
}

/* --- the unit's own protocol figures ------------------------------------- */

const unitBand = weightBand(1200)!;

// The published bands must never be mutated: two babies on different protocols
// share the same band objects, so a change for one would leak into the other.
ok(applyProtocol(unitBand, { increment: 10 }) !== unitBand, "applying a protocol returns a new band");
ok(unitBand.increment === 30, `the published band is untouched (${unitBand.increment})`);
ok(applyProtocol(unitBand, { increment: 10 })?.increment === 10, "the override is applied");
ok(applyProtocol(unitBand, undefined)?.increment === 30, "no protocol means the published figures");
ok(applyProtocol(unitBand, {})?.increment === 30, "an empty protocol means the published figures");
ok(applyProtocol(undefined, { increment: 10 }) === undefined, "no weight still means no band");

// An override moves the band that is quoted beside it, so the rationale never
// shows a published range the unit has just replaced.
const day1Band = applyProtocol(weightBand(600)!, { day1Fluid: 80 })!;
ok(day1Band.day1Fluid === 80, "the day-1 fluid follows the protocol");
ok(day1Band.day1FluidRange[1] === 100, `and the quoted range moves with it (${day1Band.day1FluidRange.join("-")})`);
ok(dayRampFluid(day1Band, 1) === 80, "so the day-1 ramp is the protocol's number");

const fullFeeds = applyProtocol(unitBand, { fullFeeds: 180 })!;
ok(fullFeeds.fullFeeds === 180, "full feeds follow the protocol");
ok(fullFeeds.fullFeedsRange[1] === 180, `and the full-feed range moves with it (${fullFeeds.fullFeedsRange.join("-")})`);
ok(dayRampFluid(fullFeeds, 12) === 180, "so the ramp can now reach the protocol's full feeds");

const interval = applyProtocol(unitBand, { feedIntervalHours: 3 })!;
ok(interval.feedFreq === "3 hourly", "the feed interval follows the protocol");
ok(bandIntervalHours(interval) === 3, "and reads back as hours");
ok(bandIntervalHours(unitBand) === 3, "the published VLBW interval is already 3-hourly");

// Absurd input is clamped, never shipped: a mistyped 9999 must not become a
// 9999 ml/kg/day prescription.
ok(applyProtocol(unitBand, { day1Fluid: 9999 })?.day1Fluid === 250, "an impossible day-1 fluid is clamped to 250");
ok(applyProtocol(unitBand, { increment: -50 })?.increment === 0, "a negative advance is clamped to 0");
ok(applyProtocol(unitBand, { aaStart: 99 })?.aaStart === 4.5, "an impossible amino acid start is clamped");
ok(applyProtocol(unitBand, { girStart: 0 })?.girStart === 2, "an impossible GIR start is clamped");
ok(applyProtocol(unitBand, { day1Fluid: Number.NaN })?.day1Fluid === unitBand.day1Fluid, "a non-number falls back to the published figure");

ok(protocolInUse(undefined) === false, "no protocol is not in use");
ok(protocolInUse({}) === false, "an empty protocol is not in use");
ok(protocolInUse({ increment: undefined }) === false, "all-undefined is not in use");
ok(protocolInUse({ increment: 10 }) === true, "one figure makes it in use");

// The targets follow the protocol, and a band typed the wrong way round is
// corrected rather than shipped.
const published = targetsFor({ weightG: 1200, dol: 6 });
const proteinTarget = targetsFor({ weightG: 1200, dol: 6, protocol: { proteinMin: 4, proteinMax: 5 } });
ok(proteinTarget.protein[0] === 4 && proteinTarget.protein[1] === 5, `the protein target follows the protocol (${proteinTarget.protein.join("-")})`);
ok(published.protein[0] === 3.5, "and the published target is unchanged");
ok(/unit protocol/.test(proteinTarget.basis), `the basis says the protocol is applied (${proteinTarget.basis})`);
ok(!/unit protocol/.test(published.basis), "the published basis does not claim a protocol");
const reversed = targetsFor({ weightG: 1200, dol: 6, protocol: { kcalMin: 150, kcalMax: 90 } });
ok(reversed.kcal[0] === 90 && reversed.kcal[1] === 150, `a reversed target band is corrected (${reversed.kcal.join("-")})`);
const fullFeedsTarget = targetsFor({ weightG: 1200, dol: 30, protocol: { fullFeeds: 180 } });
ok(fullFeedsTarget.fluids[1] === 180, `the fluid target follows the protocol's full feeds (${fullFeedsTarget.fluids.join("-")})`);

// Every overridable figure has a published value to show as its placeholder.
for (const field of PROTOCOL_FIELDS) {
  const value = field.published(unitBand);
  ok(Number.isFinite(value) && value > 0, `${field.key} has a usable published value (${value})`);
  ok(value >= field.min && value <= field.max, `${field.key}'s published value sits inside its own input range (${value} vs ${field.min}-${field.max})`);
}
for (const field of TARGET_FIELDS) {
  const value = field.published(published);
  ok(Number.isFinite(value) && value > 0, `${field.key} has a usable published value (${value})`);
  ok(value >= field.min && value <= field.max, `${field.key}'s published value sits inside its own input range (${value})`);
}

// The suggestion itself follows the protocol.
const suggested = suggestFluids({ weightG: 1200, dol: 6, enteralMlKgDay: 120 });
const slower = suggestFluids({ weightG: 1200, dol: 6, enteralMlKgDay: 120, protocol: { increment: 10 } });
ok(suggested.fields.enteralMlKgDay === 150, `the published advance gives 150 (${suggested.fields.enteralMlKgDay})`);
ok(slower.fields.enteralMlKgDay === 130, `a 10 ml/kg/day protocol advance gives 130 (${slower.fields.enteralMlKgDay})`);
ok(slower.notes.some((n) => /unit's protocol/.test(n)), "the suggestion says whose figures it used");
ok(!suggested.notes.some((n) => /unit's protocol/.test(n)), "and stays quiet when the published figures are used");

const firstFeed = suggestFluids({ weightG: 600, dol: 1, protocol: { feedStart: 25 } });
ok(firstFeed.fields.enteralMlKgDay === 25, `the protocol's first feed volume is used (${firstFeed.fields.enteralMlKgDay})`);

const aaProtocol = suggestFluids({ weightG: 600, dol: 1, protocol: { aaStart: 2 } });
ok(aaProtocol.fields.aminoAcid === 2, `the protocol's amino acid start is used (${aaProtocol.fields.aminoAcid})`);

const girProtocol = suggestFluids({ weightG: 600, dol: 1, protocol: { girStart: 6 } });
ok(girProtocol.fields.dextrosePct > suggestFluids({ weightG: 600, dol: 1 }).fields.dextrosePct,
   `a higher protocol GIR asks for more dextrose (${girProtocol.fields.dextrosePct})`);

// The phase thresholds move with the protocol's full-feed volume, so a baby at
// 150 ml/kg/day is not called "full feeds" by a unit that aims for 180.
ok(feedPhase({ weightG: 1200, enteralMlKgDay: 155, ivMlKgDay: 0 }).id === "wean", "155 is full feeds on the published figures");
ok(feedPhase({ weightG: 1200, enteralMlKgDay: 155, ivMlKgDay: 0, protocol: { fullFeeds: 180 } }).id === "fortify",
   "and still advancing for a unit whose full feeds is 180");


console.log(`Feed guide tests passed (${checks} checks)`);
