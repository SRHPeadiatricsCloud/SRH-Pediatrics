/**
 * The four added calculators, checked against hand-computed reference values.
 * Run with: npx tsx scripts/test-new-calcs.ts
 */
import assert from "node:assert/strict";
import { CALCULATORS } from "../src/lib/calculators";

const get = (id: string) => {
  const c = CALCULATORS.find((x) => x.id === id);
  assert.ok(c, `calculator ${id} exists`);
  return c!;
};
let pass = 0;
const t = (n: string, c: boolean, extra = "") => { c ? pass++ : (console.log("FAIL:", n, extra), (process.exitCode = 1)); };

/* --- Hypernatraemia ------------------------------------------------------ */
const hn = get("hypernatremia");
// 10 kg, Na 170: TBW 6 L, deficit 6 x (170/140 - 1) = 1.286 L, over 60 h = 21.4 ml/h
const hnR = hn.compute({ wt: 10, na: 170, tbw: 0.6, rate: 0.5, maint: 0 });
t("hypernatraemia deficit is 1.29 L", hnR.value === "1.29 L free water deficit", hnR.value);
t("hypernatraemia cites 60 h", /over 60 h/.test(hnR.interpretation ?? ""), hnR.interpretation);
t("hypernatraemia free-water rate is 21.4 ml/h", /free water 21.4 ml\/h/.test(hnR.interpretation ?? ""), hnR.interpretation);
t("hypernatraemia adds maintenance when given", /maintenance 60 ml\/h = 81 ml\/h/.test(hn.compute({ wt: 10, na: 170, tbw: 0.6, rate: 0.5, maint: 60 }).interpretation ?? ""));
t("hypernatraemia is crit at >=170", hnR.severity === "crit", hnR.severity);
t("hypernatraemia says no deficit below 145", /Not hypernatraemic/.test(hn.compute({ wt: 10, na: 142, tbw: 0.6, rate: 0.5, maint: 0 }).interpretation ?? ""));

/* --- Potassium ----------------------------------------------------------- */
const k = get("potassium-correction");
// 10 kg, K 2.5 -> target 4: (4-2.5) x 0.4 x 10 = 6 mmol; peripheral 0.5 mmol/kg/h = 5 -> 1.2 h
const kR = k.compute({ wt: 10, k: 2.5, target: 4, site: 0, vol: 100 });
t("potassium deficit is 6 mmol", kR.value === "6.0 mmol K+ deficit" || kR.value.startsWith("6.0 mmol"), kR.value);
t("potassium rate respects 0.5 mmol/kg/h", /= 0.50 mmol\/kg\/h/.test(kR.interpretation ?? ""), kR.interpretation);
t("potassium flags over-concentration", /ABOVE the 40 mmol\/L/.test(kR.interpretation ?? ""), kR.interpretation);
t("potassium offers the dilution volume", /Dilute into at least 150 ml/.test(kR.note ?? ""), kR.note);
const kCentral = k.compute({ wt: 10, k: 2.5, target: 4, site: 1, vol: 200 });
t("central allows 80 mmol/L", /within the 80 mmol\/L central limit/.test(kCentral.interpretation ?? ""), kCentral.interpretation);
t("potassium says none needed at target", /no replacement needed/.test(k.compute({ wt: 10, k: 4.2, target: 4, site: 0, vol: 100 }).interpretation ?? ""));
t("potassium is crit below 2.5", k.compute({ wt: 10, k: 2.2, target: 4, site: 0, vol: 100 }).severity === "crit");

/* --- FENa ---------------------------------------------------------------- */
const fena = get("fena");
// (20 x 1) / (140 x 100) x 100 = 0.143% -> prerenal
const fR = fena.compute({ una: 20, pna: 140, ucr: 100, pcr: 1, age: 1, uur: 0, pur: 0 });
t("FENa is 0.14%", fR.value === "FENa 0.14%", fR.value);
t("FENa reads prerenal at 0.14%", /prerenal/.test(fR.interpretation ?? ""), fR.interpretation);
// Neonatal cut-off: FENa 1.5% is prerenal in a neonate but intrinsic in a child
const neo = fena.compute({ una: 210, pna: 140, ucr: 100, pcr: 1, age: 0, uur: 0, pur: 0 });
t("FENa 1.5% is prerenal in a neonate", /prerenal/.test(neo.interpretation ?? "") && /2.5% neonatal/.test(neo.interpretation ?? ""), neo.interpretation);
const child = fena.compute({ una: 210, pna: 140, ucr: 100, pcr: 1, age: 1, uur: 0, pur: 0 });
t("the same value is intrinsic in a child", /intrinsic/.test(child.interpretation ?? ""), child.interpretation);
// FEUrea = (100 x 1) / (30 x 100) x 100 = 3.33%
const withUrea = fena.compute({ una: 20, pna: 140, ucr: 100, pcr: 1, age: 1, uur: 100, pur: 30 });
t("FEUrea is reported when urea is given", /FEUrea 3.3% — prerenal/.test(withUrea.interpretation ?? ""), withUrea.interpretation);
t("FENa guards zero urine creatinine", /greater than zero/.test(fena.compute({ una: 20, pna: 140, ucr: 0, pcr: 1, age: 1, uur: 0, pur: 0 }).note ?? ""));

/* --- DKA ----------------------------------------------------------------- */
const dka = get("dka");
// 20 kg, 7.5% -> 1500 ml deficit; maintenance 1000 + 10x50 = 1500; over 36 h = 83 ml/h
const dR = dka.compute({ wt: 20, glu: 500, na: 130, hco3: 8, ph: 7.1, k: 4, deh: 7.5, over: 36 });
t("DKA total rate is 83 ml/h", dR.value === "83 ml/h total fluids", dR.value);
t("DKA quotes the deficit and maintenance", /Deficit 1500 ml \(7.5%\) \+ maintenance 1500 ml/.test(dR.interpretation ?? ""), dR.interpretation);
t("DKA insulin is 1.00-2.00 U/h for 20 kg", /Insulin 1.00–2.00 U\/h/.test(dR.interpretation ?? ""), dR.interpretation);
// corrected Na = 130 + 1.6 x (500-100)/100 = 136.4
t("DKA corrected sodium is 136.4", /Corrected Na⁺ 136.4/.test(dR.interpretation ?? ""), dR.interpretation);
// effective osmolality = 2x130 + 500/18 = 287.8
t("DKA effective osmolality is 288", /effective osmolality 288/.test(dR.interpretation ?? ""), dR.interpretation);
t("DKA is crit at pH < 7.2", dka.compute({ wt: 20, glu: 500, na: 130, hco3: 8, ph: 7.1, k: 4, deh: 7.5, over: 36 }).severity === "warn");
t("DKA is crit at pH < 7", dka.compute({ wt: 20, glu: 500, na: 130, hco3: 4, ph: 6.9, k: 4, deh: 10, over: 48 }).severity === "crit");
t("DKA holds insulin when K is low", /HOLD insulin/.test(dka.compute({ wt: 20, glu: 500, na: 130, hco3: 8, ph: 7.1, k: 2.2, deh: 7.5, over: 36 }).interpretation ?? ""));
t("DKA warns about cerebral oedema", /cerebral-oedema risk/.test(dR.note ?? "") && /mannitol/.test(dR.note ?? ""));

console.log(`new calculators: ${pass} passed, ${process.exitCode ? "SOME FAILED" : "0 failed"}`);
