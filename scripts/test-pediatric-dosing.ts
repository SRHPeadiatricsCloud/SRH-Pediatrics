import assert from "node:assert/strict";
import { calculatePediatricDose, getPediatricDrug, type PediatricDrug } from "../src/lib/pediatric-dosing";

const dose = (id: string, weightKg: number, ageYears: number, strength?: number, regimenIndex = 0) => calculatePediatricDose(getPediatricDrug(id), { weightKg, ageYears, strength }, regimenIndex);

const paracetamol = dose("paracetamol", 12, 4, 24, 1);
assert.equal(paracetamol.calculatedAmount, "120–180 mg");
assert.equal(paracetamol.frequency, "Q4–6 h; max 90 mg/kg/day");
assert.equal(paracetamol.volume, "5–7.5 mL");

const cefepime = dose("cefepime", 20, 8, 100, 1);
assert.equal(cefepime.calculatedAmount, "1000 mg");
assert.equal(cefepime.volume, "10 mL");
assert.match(cefepime.caution, /renal\/hepatic function/);

const fixed = dose("montelukast", 15, 3, 4, 0);
assert.equal(fixed.calculatedAmount, "4 mg");
assert.equal(fixed.volume, "1 mL");

const bsaOnly: PediatricDrug = {
  id: "bsa-test", name: "BSA test", group: "Other", strengthUnit: "mg/mL", regimens: [{
    condition: "BSA regimen", regimen: "100 mg/m²/day", rule: { low: 100, unit: "mg/m2/day", frequency: "OD", route: "IV" },
  }],
};
const missingHeight = calculatePediatricDose(bsaOnly, { weightKg: 20, ageYears: 8 });
assert.match(missingHeight.caution, /Enter height/);
const withHeight = calculatePediatricDose(bsaOnly, { weightKg: 20, ageYears: 8, heightCm: 110, strength: 100 });
assert.equal(withHeight.calculatedAmount, "78.17 mg");
assert.equal(withHeight.volume, "0.78 mL");
assert.match(withHeight.rule, /BSA 0.78 m²/);

const manual = calculatePediatricDose(getPediatricDrug("levofloxacin"), { weightKg: 20, ageYears: 8 }, 1);
assert.match(manual.caution, /non-weight dosing/);

console.log("Paediatric dose calculation tests passed");
