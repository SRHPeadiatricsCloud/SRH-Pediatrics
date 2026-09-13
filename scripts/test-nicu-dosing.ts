import assert from "node:assert/strict";
import { getNicuDrug } from "../src/lib/nicu-dosing";

const dose = (id: string, input: Parameters<ReturnType<typeof getNicuDrug>["calculate"]>[0]) => getNicuDrug(id).calculate(input);

const ampicillin = dose("ampicillin", { drugId: "ampicillin", weightKg: 1, gestationalAgeWeeks: 34, postnatalAgeDays: 7, strength: 50 });
assert.equal(ampicillin.calculatedAmount, "50 mg");
assert.equal(ampicillin.frequency, "BD (every 12 h)");
assert.equal(ampicillin.volume, "1 mL");

const amikacin = dose("amikacin", { drugId: "amikacin", weightKg: 0.8, gestationalAgeWeeks: 28, postnatalAgeDays: 14, strength: 50 });
assert.equal(amikacin.calculatedAmount, "16 mg");
assert.equal(amikacin.frequency, "every 42 h");

const gentamicin = dose("gentamicin", { drugId: "gentamicin", weightKg: 2.5, gestationalAgeWeeks: 35, postnatalAgeDays: 7, strength: 10 });
assert.equal(gentamicin.calculatedAmount, "10 mg");
assert.equal(gentamicin.frequency, "every 24 h");

const vancomycin = dose("vancomycin", { drugId: "vancomycin", weightKg: 3, gestationalAgeWeeks: 30, postnatalAgeDays: 10, postmenstrualAgeWeeks: 35, strength: 5 });
assert.equal(vancomycin.volume, "9 mL");
assert.equal(vancomycin.frequency, "every 12 h");

const caffeine = dose("caffeine", { drugId: "caffeine", weightKg: 1.2, gestationalAgeWeeks: 29, postnatalAgeDays: 3, strength: 10 });
assert.match(caffeine.volume ?? "", /Loading 1.2 mL/);
assert.match(caffeine.volume ?? "", /maintenance 0.6 mL–1.2 mL/);

const fixed = dose("zincovit", { drugId: "zincovit", weightKg: 1, gestationalAgeWeeks: 34, postnatalAgeDays: 10 });
assert.equal(fixed.volume, undefined);
assert.equal(fixed.calculatedAmount, "0.5 mL per dose");

console.log("NICU dose calculation tests passed");
