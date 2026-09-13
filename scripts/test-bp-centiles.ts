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

console.log("BP centile pure-function tests passed");
