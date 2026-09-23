import assert from "node:assert/strict";
import { calculateNeonatalBp, calculatePediatricBp } from "../src/lib/bpCentiles";

const pediatric = calculatePediatricBp({ sex: "male", ageYears: 10, heightCm: 141.3, sbp: 100, dbp: 62 });
assert.equal(pediatric.heightPercentile, 50);
assert.deepEqual(pediatric.thresholds.sbp, { p5: null, p50: 100, p90: 112, p95: 116, p95Plus12: 128 });
assert.equal(pediatric.classification.overall.category, "normal");

const elevated = calculatePediatricBp({ sex: "male", ageYears: 10, heightCm: 141.3, sbp: 112, dbp: 75 });
assert.equal(elevated.classification.sbp.category, "elevated");
assert.equal(elevated.classification.dbp.category, "elevated");

const stage2 = calculatePediatricBp({ sex: "male", ageYears: 10, heightCm: 141.3, sbp: 128, dbp: 71 });
assert.equal(stage2.classification.sbp.category, "stage2");

const adolescent = calculatePediatricBp({ sex: "female", ageYears: 14, heightCm: 161.3, sbp: 129, dbp: 82 });
assert.equal(adolescent.classification.sbp.category, "elevated");
assert.equal(adolescent.classification.dbp.category, "stage1");
assert.equal(adolescent.classification.overall.category, "stage1");

const neonatal = calculateNeonatalBp({ mode: "preterm", sex: "female", gestationalAgeWeeks: 32, postnatalDay: 4, sbp: 77, dbp: 50 });
assert.deepEqual(neonatal.thresholds.sbp, { p5: 46, p50: 58, p90: 68, p95: 77, p95Plus12: null });
assert.equal(neonatal.classification.sbp.category, "stage2");
assert.equal(neonatal.classification.dbp.category, "stage2");

assert.throws(() => calculateNeonatalBp({ mode: "preterm", sex: "male", gestationalAgeWeeks: 37, postnatalDay: 4, sbp: 70, dbp: 40 }));
assert.throws(() => calculatePediatricBp({ sex: "male", ageYears: 10.5, heightCm: 140, sbp: 100, dbp: 60 }));

/* --- 24-31 weeks: observed ranges, explicitly not percentiles ------------- */
for (const ga of [24, 26, 28, 29, 31]) {
  const r = calculateNeonatalBp({ mode: "preterm", sex: "male", gestationalAgeWeeks: ga, postnatalDay: 7, sbp: 52, dbp: 30 });
  assert.equal(r.basis, "observed-range", `${ga} weeks has no centile table`);
  assert.ok(r.observedRange, `${ga} weeks reports its observed range`);
  assert.ok(r.mapLowerLimit === ga, `MAP lower limit equals gestational age (${ga})`);
  assert.match(r.sourceNote, /not a percentile/, "the note must say a range is not a percentile");
}
const ga26 = calculateNeonatalBp({ mode: "preterm", sex: "female", gestationalAgeWeeks: 26, postnatalDay: 4, sbp: 52, dbp: 30 });
assert.deepEqual(ga26.observedRange, { sbp: [48, 58], dbp: [22, 36] }, "24-28 wk band from the published guidance");
const ga30 = calculateNeonatalBp({ mode: "preterm", sex: "female", gestationalAgeWeeks: 30, postnatalDay: 4, sbp: 52, dbp: 30 });
assert.deepEqual(ga30.observedRange, { sbp: [47, 59], dbp: [24, 34] }, "29-32 wk band");
assert.throws(
  () => calculateNeonatalBp({ mode: "preterm", sex: "male", gestationalAgeWeeks: 23, postnatalDay: 4, sbp: 50, dbp: 30 }),
  /24/,
  "below 24 weeks is still rejected rather than guessed",
);

/* --- 32-36 weeks still use the Samanta centiles --------------------------- */
const ga32 = calculateNeonatalBp({ mode: "preterm", sex: "male", gestationalAgeWeeks: 32, postnatalDay: 7, sbp: 62, dbp: 42 });
assert.equal(ga32.basis, "centile");
assert.equal(ga32.observedRange, undefined);
assert.equal(ga32.thresholds.sbp.p50, 62);

/* --- 18 years reads the published 17-year row ----------------------------- */
const y18 = calculatePediatricBp({ sex: "male", ageYears: 18, heightCm: 175.8, sbp: 128, dbp: 78 });
const y17 = calculatePediatricBp({ sex: "male", ageYears: 17, heightCm: 175.8, sbp: 128, dbp: 78 });
assert.deepEqual(y18.thresholds, y17.thresholds, "18 is read against the 17-year row, not invented");
assert.match(y18.sourceNote, /Age 18 is read against the published 17-year row/);
assert.throws(() => calculatePediatricBp({ sex: "male", ageYears: 19, heightCm: 175, sbp: 128, dbp: 78 }), /1 through 18/);

console.log("BP centile pure-function tests passed");
