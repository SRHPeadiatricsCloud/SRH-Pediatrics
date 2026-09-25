/**
 * Level III-B analytics engine: every number on the Analytics page must be
 * derivable from the raw store, and nothing may be invented where a field was
 * never recorded. All figures below are hand-counted from the fixtures.
 *
 * Run with: npx tsx scripts/test-analytics.ts
 */
import assert from "node:assert/strict";
import { computeAnalytics, type AnalyticsBaby } from "../src/lib/analytics";
import { crib2, gaBandFine, bwBandFine, ropEligible, sizeForGA } from "../src/lib/qi";
import type { StatProblem, StatVital } from "../src/lib/stats";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

const NOW = new Date(2026, 8, 30, 12, 0, 0); // 30 Sep 2026
const at = (y: number, mo: number, d: number, h = 10) => new Date(y, mo - 1, d, h).toISOString();

let nextId = 1;
type F = Partial<AnalyticsBaby> & { admitted: string };
const baby = (f: F): AnalyticsBaby => ({
  id: nextId++,
  babyName: `Baby ${nextId}`,
  uhid: f.uhid ?? `U${1000 + nextId}`,
  unit: f.unit ?? "nicu",
  status: f.status ?? "active",
  sex: f.sex ?? "Male",
  dob: f.dob ?? "",
  gestWeeks: f.gestWeeks ?? 36,
  gestDays: f.gestDays ?? 0,
  birthWeight: f.birthWeight ?? 2500,
  currentWeight: f.currentWeight ?? f.birthWeight ?? 2500,
  deliveryMode: f.deliveryMode ?? "NVD",
  inborn: f.inborn ?? true,
  acuity: f.acuity ?? "stable",
  consultant: f.consultant ?? "",
  insurance: f.insurance ?? "",
  apgar1: f.apgar1 ?? null,
  apgar5: f.apgar5 ?? null,
  createdAt: f.admitted,
  updatedAt: f.updatedAt ?? null,
  clinical: f.clinical ?? null,
});

/* -------------------------------- fixtures ------------------------------- */
// a1: 26+2 wk, 800 g, complete CRIB-II inputs, survives; ROP eligible+screened;
//     KMC; on EBM; ventilated; antibiotic course recorded.
const a1 = baby({
  admitted: at(2026, 9, 2), dob: at(2026, 9, 2), gestWeeks: 26, gestDays: 2, birthWeight: 800, currentWeight: 950,
  sex: "Male",
  clinical: {
    resp: { mode: "SIMV" },
    fluids: { totalMlKgDay: 160, feedType: "EBM", gir: 10, kcal: 90 },
    eventLog: { VENTILATION: { starting: "2/9/26" }, ANTIBIOTICS_1: { date: "3/9/26" }, ROP1: { date: "20/9/26", result: "immature" } },
    lines: [{ name: "UVC", day: 1 }, { name: "PICC", day: 3 }],
    growth: [{ at: at(2026, 9, 3), weight: 770 }, { at: at(2026, 9, 20), weight: 950 }],
    qi: {
      antenatal: { steroids: "complete" },
      admission: { tempC: 34.5, baseExcess: -12 },
      respiratory: { ventDays: 14, o2At36Pma: undefined },
      infection: { los: true, culturePositive: true, organism: "Klebsiella", antibioticDays: 10 },
      lines: { uvcDays: 5, piccDays: 12 },
      feeding: { firstFeedDay: 3, fullFeedDay: 18, exclusiveHumanMilk: true },
      kmc: { started: true, hoursPerDay: 6 },
      rop: { screened: true },
    },
  },
});

// a2: 30 wk, 1300 g, died at 12 h (early mortality), cause sepsis via problems.
const a2 = baby({
  admitted: at(2026, 9, 5), dob: at(2026, 9, 5), gestWeeks: 30, birthWeight: 1300, status: "death",
  sex: "Female", acuity: "critical",
  clinical: {
    qi: {
      antenatal: { steroids: "none" },
      admission: { tempC: 35.5, baseExcess: -16, ppv: true, chestCompressions: true, epinephrine: true },
    },
    dischargeRecord: { at: at(2026, 9, 5, 22), date: "2026-09-05", outcome: "death", summary: "early onset sepsis with shock", signedBy: "Dr" },
  },
});

// a3: 25 wk, 650 g, died day 10, NEC documented.
const a3 = baby({
  admitted: at(2026, 9, 8), dob: at(2026, 9, 8), gestWeeks: 25, birthWeight: 650, status: "death", inborn: false,
  clinical: {
    eventLog: { NEC: { date: "15/9/26", result: "Bell IIIB" }, BLOOD_CULTURE_1: { date: "9/9/26" } },
    qi: { admission: { tempC: 36.8, baseExcess: -8 }, neuro: { ivhGrade: 3 } },
    dischargeRecord: { at: at(2026, 9, 18), date: "2026-09-18", outcome: "death", summary: "", signedBy: "Dr" },
  },
});

// a4: 38 wk, 1500 g (SGA term), discharged day 6, jaundice-free; ROP not eligible.
const a4 = baby({
  admitted: at(2026, 9, 10), dob: at(2026, 9, 10), gestWeeks: 38, birthWeight: 1500, currentWeight: 1650, status: "discharged",
  sex: "Female",
  clinical: {
    fluids: { feedType: "Formula" },
    dischargeRecord: { at: at(2026, 9, 16), date: "2026-09-16", outcome: "discharged", summary: "well", signedBy: "Dr", weightAtDischarge: 1650 },
    qi: { discharge: { feedingAtDischarge: "breast", readmitted28d: true, readmissionReason: "feeding" } },
  },
});

// a5: 39 wk, 3200 g, active, term admission.
const a5 = baby({ admitted: at(2026, 9, 12), dob: at(2026, 9, 12), gestWeeks: 39, birthWeight: 3200 });

// a6: 32 wk, 1700 g, active, on CPAP; no qi captured anywhere → coverage gaps.
const a6 = baby({
  admitted: at(2026, 9, 15), dob: at(2026, 9, 15), gestWeeks: 32, birthWeight: 1700,
  clinical: { resp: { mode: "CPAP" }, fluids: { feedType: "Donor milk" } },
});

// a7: 24 wk, 550 g, active — extreme prematurity; IVH grade 4 recorded.
const a7 = baby({
  admitted: at(2026, 8, 20), dob: at(2026, 8, 20), gestWeeks: 24, birthWeight: 550, currentWeight: 700,
  clinical: {
    qi: {
      admission: { tempC: 36.9, baseExcess: -6 },
      neuro: { ivhGrade: 4, seizures: true },
      respiratory: { ventDays: 30, o2At36Pma: "low-flow oxygen" },
      transfusions: { prbc: 3, platelets: 1 },
      feeding: { pnDays: 21 },
    },
    eventLog: { VENTILATION: { starting: "20/8/26" } },
  },
});

// a8: transferred out; duplicate UHID with a5 for the duplicate check.
const a8 = baby({
  admitted: at(2026, 8, 25), uhid: a5.uhid, gestWeeks: 34, birthWeight: 2100, status: "transferred",
  clinical: { dischargeRecord: { at: at(2026, 9, 4), date: "2026-09-04", outcome: "transferred", summary: "", signedBy: "Dr" } },
});

// a9: implausible record for the data-quality scorecard (GA 20 wk).
const a9 = baby({ admitted: at(2026, 8, 28), gestWeeks: 20, birthWeight: 6500 });

const ROWS = [a1, a2, a3, a4, a5, a6, a7, a8, a9];

const VITALS: StatVital[] = [
  { babyId: a1.id, recordedAt: at(2026, 9, 2, 11), temp: 36.2, hr: 150 },
  { babyId: a1.id, recordedAt: at(2026, 9, 3, 8), temp: 36.9, hr: 145 },
  { babyId: a5.id, recordedAt: at(2026, 9, 12, 11), temp: 36.6 },
  { babyId: a6.id, recordedAt: at(2026, 9, 15, 11), temp: 37.9 },
];

const PROBLEMS: StatProblem[] = [
  { babyId: a2.id, system: "Infection", label: "Early onset sepsis", status: "active", onsetAt: at(2026, 9, 5) },
  { babyId: a3.id, system: "GI", label: "NEC", status: "active", onsetAt: at(2026, 9, 15) },
];

/* ------------------------------ pure helpers ----------------------------- */
ok(gaBandFine(23, 6) === "<24 wk", "GA band <24");
ok(gaBandFine(24, 0) === "24–25+6 wk", "GA band 24");
ok(gaBandFine(27, 6) === "26–27+6 wk", "GA band 27+6");
ok(gaBandFine(28) === "28–29+6 wk", "GA band 28");
ok(gaBandFine(36, 6) === "34–36+6 wk", "GA band 36+6");
ok(gaBandFine(37) === "≥37 wk", "GA band 37");
ok(bwBandFine(499) === "<500 g", "BW band <500");
ok(bwBandFine(999) === "750–999 g", "BW band 999");
ok(bwBandFine(1249) === "1000–1249 g", "BW band 1249");
ok(bwBandFine(2500) === "≥2500 g", "BW band 2500");
ok(ropEligible(34, 0, 3000) === true, "ROP eligible at exactly 34 wk");
ok(ropEligible(35, 0, 1750) === true, "ROP eligible by weight 1750 g");
ok(ropEligible(35, 0, 1800) === false, "not ROP eligible");
ok(sizeForGA(1500, 38, 0, "Female") === "SGA", "1500 g at 38 wk is SGA (Fenton)");
ok(sizeForGA(3200, 39, 0, "Male") === "AGA", "3200 g at 39 wk is AGA");
ok(sizeForGA(4500, 40, 0, "Male") === "LGA", "4500 g at 40 wk is LGA");

/* CRIB-II known values */
const c1 = crib2({ sex: "Male", gestWeeks: 26, birthWeightG: 800, tempC: 34.5, baseExcess: -12 });
ok(c1.score === 15 && c1.level === "III" && c1.complete, `CRIB-II 15/III (got ${c1.score}/${c1.level})`);
ok(c1.components.weight === 5 && c1.components.gestation === 3 && c1.components.temperature === 4 && c1.components.baseExcess === 2, "CRIB-II components");
const c2 = crib2({ sex: "Female", gestWeeks: 32, birthWeightG: 1800, tempC: 36.8, baseExcess: -5 });
ok(c2.score === 0 && c2.level === "I", "CRIB-II 0/I for a stable preterm");
const c3 = crib2({ sex: "Male", gestWeeks: 23, birthWeightG: 500, tempC: 34.0, baseExcess: -18 });
ok(c3.score === 1 + 8 + 6 + 4 + 3, "CRIB-II worst case = 22 on the implemented table");
ok(crib2({ sex: "Male", gestWeeks: 30, birthWeightG: 1200 }).complete === false, "missing temp/BE → incomplete, never estimated");

/* ------------------------------ the report ------------------------------- */
const rep = computeAnalytics(ROWS, VITALS, PROBLEMS, NOW);

/* data quality */
ok(rep.dataQuality.records === 9, "nine records");
ok(rep.dataQuality.duplicates === 1, "one duplicated UHID");
ok(rep.dataQuality.implausible.some((m) => m.includes("gestation 20")), "implausible gestation flagged");
ok(rep.dataQuality.implausible.some((m) => m.includes("6500")), "implausible birth weight flagged");
ok(rep.dataQuality.missing.antenatalSteroids === 7, "steroids missing for 7 of 9");
ok(rep.dataQuality.missing.consultant === 9, "consultant missing everywhere");
ok(rep.dataQuality.observations === 4, "four observations counted");

/* activity */
ok(rep.activity.total === 9, "total admissions");
ok(rep.activity.months.find((m) => m.month === "2026-09")?.admissions === 6, "six September admissions");
ok(rep.activity.months.find((m) => m.month === "2026-08")?.admissions === 3, "three August admissions");
ok(rep.activity.inborn.pct === 88.9, `inborn 8/9 = 88.9% (got ${rep.activity.inborn.pct})`);
ok(rep.activity.transfersOut === 1, "one transfer out");
ok(rep.activity.emergencyProxy.n === 1, "critical/guarded proxy for emergencies");

/* case mix */
const cmRow = (label: string) => rep.caseMix.gaBands.find((r) => r.label === label)?.n ?? -1;
ok(cmRow("24–25+6 wk") === 2 && cmRow("26–27+6 wk") === 1, "fine GA bands (a3 25 wk + a7 24 wk)");
ok(cmRow("≥37 wk") === 2, "two term babies");
ok(rep.caseMix.elbw === 3 && rep.caseMix.vlbw === 4, "ELBW/VLBW counts");
ok((rep.caseMix.sizeForGa.find((r) => r.label === "SGA")?.n ?? 0) >= 1, "the 1500 g term baby classifies SGA");
ok(rep.caseMix.steroids.find((r) => r.label === "complete")?.n === 1, "steroids tallied");
ok(rep.caseMix.steroids.find((r) => r.label === "Not recorded")?.n === 7, "steroids coverage honest");

/* mortality */
ok(rep.mortality.deaths === 2, "two deaths");
ok(rep.mortality.rate.pct === 22.2, `mortality 2/9 (got ${rep.mortality.rate.pct})`);
ok(rep.mortality.byTiming.find((r) => r.label === "<24 h")?.n === 1, "a2 died within 24 h of admission");
ok(rep.mortality.byTiming.find((r) => r.label === ">7 days")?.n === 1, "a3 died after 7 days");
ok(rep.mortality.byCause.find((r) => r.label === "Sepsis")?.n === 1, "cause grouped: sepsis");
ok(rep.mortality.byCause.find((r) => r.label === "NEC")?.n === 1, "cause grouped: NEC");
ok(rep.mortality.byGa.find((r) => r.label === "24–25+6 wk")?.deaths === 1, "death lands in 24–25 wk band");
ok(rep.mortality.bySex.find((r) => r.label === "Female")?.deaths === 1, "female death counted");
ok(rep.mortality.byPlace.find((r) => r.label === "Outborn")?.deaths === 1, "outborn death counted");
ok(rep.mortality.register.length === 2, "mortality register rows");

/* CRIB-II report */
ok(rep.crib2.coverage.n === 4, `4 of 9 fully scoreable (got ${rep.crib2.coverage.n})`);
ok(rep.crib2.levels.find((l) => l.level === "III")?.n === 2, "a1 and a7 score level III");
ok(rep.crib2.levels.find((l) => l.level === "III")?.deaths === 0, "level III survivors");
ok(rep.crib2.levels.find((l) => l.level === "II")?.n === 2, "a2 and a3 score level II");
ok(rep.crib2.levels.find((l) => l.level === "II")?.mortalityPct === 100, "level II observed mortality 100% (small numbers — read cautiously)");

/* respiratory */
ok(rep.respiratory.ventilation.n === 2, "two ventilated babies (event log)");
ok(rep.respiratory.cpap.n === 1, "one on CPAP");
ok(rep.respiratory.medianVentDays === 22, "median vent days from QI fields");
ok(rep.respiratory.ventDaysCoverage.n === 2 && rep.respiratory.ventDaysCoverage.denom === 2, "vent-day coverage over ventilated");
ok(rep.respiratory.bpdCoverage.denom === 3, "BPD-eligible denominator: <32 wk or <1500 g survivors");
ok(rep.respiratory.bpd.n === 1 && rep.respiratory.bpd.denom === 1, "a7 is the one BPD case among the one recorded");
ok(rep.respiratory.bpdCoverage.pct === 33.3, `BPD recorded for 1/3 (got ${rep.respiratory.bpdCoverage.pct})`);

/* resuscitation */
ok(rep.resuscitation.tempCoverage.n === 7, "temperatures from first observation + QI field");
ok(rep.resuscitation.normothermia.n === 3, "three normothermic admissions");
ok(rep.resuscitation.hypothermia === 3, "three hypothermic admissions");
ok(rep.resuscitation.drIntubation === 0 && rep.resuscitation.compressions === 1 && rep.resuscitation.epinephrine === 1, "advanced resuscitation captured");

/* infection */
ok(rep.infection.antibioticExposure.n === 1, "antibiotic exposure from event log");
ok(rep.infection.culturesSent.n === 1, "one culture sent");
ok(rep.infection.culturePositive === 1, "one culture positive");
ok(rep.infection.positivity.pct === 100, "positivity over cultures sent");
ok(rep.infection.lineDays === 17, "line days 5+12");
ok(rep.infection.clabsiRate === null || rep.infection.clabsi === 0, "no CLABSI recorded → no invented rate");
ok(rep.infection.medianAntibioticDays === 10, "antibiotic days from QI field");
ok(rep.infection.organisms.find((r) => r.label === "Klebsiella")?.n === 1, "organism tallied");

/* NEC & feeding */
ok(rep.necFeeding.nec.n === 1, "one NEC");
ok(rep.necFeeding.necByGa.find((r) => r.label === "24–25+6 wk")?.nec === 1, "NEC in the right GA band");
ok(rep.necFeeding.firstFeed.median === 3, "first feed day 3");
ok(rep.necFeeding.fullFeed.median === 18, "full feeds day 18");
ok(rep.necFeeding.pn.median === 21, "PN days recorded");

/* nutrition */
ok(rep.nutrition.withGrowthCharts === 1, "one baby has a two-point weight chart");
ok(rep.nutrition.avgMaxLossPct === 3.8, `max loss (800→770) = 3.8% (got ${rep.nutrition.avgMaxLossPct})`);
ok(rep.nutrition.avgVelocity !== null, "velocity computed");
ok(rep.nutrition.humanMilkNow.pct === 40, "EBM+donor among the five active babies");

/* lines */
ok(rep.lines.uvc === 1 && rep.lines.picc === 1, "lines counted");

/* neuro */
ok(rep.neuro.anyIvh === 2 && rep.neuro.severeIvh === 2, "two severe IVH");
ok(rep.neuro.seizures === 1, "seizures counted");
ok(rep.neuro.severeIvhInExtreme.denom === 1, "extreme-preterm survivors with IVH recorded");

/* ROP */
ok(rep.rop.eligible === 6, "six ROP-eligible survivors");
ok(rep.rop.screened === 1, "only a1 has screening recorded");
ok(rep.rop.missed === 5, "five eligible infants have no screening record");

/* transfusions */
ok(rep.transfusions.babies.n === 1, "one baby transfused");
ok(rep.transfusions.prbc === 3 && rep.transfusions.platelets === 1, "units tallied");

/* LOS */
ok(rep.los.n === 3, "three babies left the unit");
ok(rep.los.median !== null, "median LOS available");
ok(rep.los.byGa.find((r) => r.label === "≥37 wk")?.median === 6, "term LOS 6 days");
ok(rep.los.prolonged[0]?.uhid === a7.uhid, "longest current stay first");

/* discharge */
ok(rep.discharge.home === 1 && rep.discharge.transferred === 1 && rep.discharge.death === 2, "discharge outcomes");
ok(rep.discharge.avgWeightG === 1650, "discharge weight from the record");
ok(rep.discharge.avgPma !== null && Math.abs(rep.discharge.avgPma! - 38.9) < 0.2, `derived PMA ≈38.9 (got ${rep.discharge.avgPma})`);
ok(rep.discharge.readmitted28d === 1, "readmission flag counted");

/* KMC & milk */
ok(rep.kmcMilk.kmcEligible === 8, "KMC-eligible cohort (all but term 3200 g)");
ok(rep.kmcMilk.kmcStarted.n === 1, "one KMC recorded");
ok(rep.kmcMilk.kmcHours === 6, "KMC hours averaged");

/* trends */
ok(rep.trends.length === 2, "two months of trends");
ok(rep.trends.find((t) => t.month === "2026-09")?.deaths === 2, "September deaths in the trend");

/* indicators */
const iNorm = rep.indicators.find((i) => i.indicator.includes("normothermia"));
ok(iNorm?.status === "flag", "normothermia below the 90% reference is flagged");
const iMort = rep.indicators.find((i) => i.indicator === "NICU mortality");
ok(iMort?.value === "22.2%" && iMort.status === "no-data", "mortality shown without a bundled benchmark");
ok(rep.indicators.length === 12, "twelve dashboard indicators");

/* pareto & subgroups & gaps */
ok(rep.pareto[0]?.label === "Severe IVH" || rep.pareto[0]?.label === "NEC" || rep.pareto[0]?.label === "Culture-positive sepsis" || rep.pareto[0]?.label === "BPD" || rep.pareto[0]?.label === "ROP (any stage)", "pareto led by a real complication");
ok(rep.pareto.reduce((a, p) => a + p.n, 0) === 7, "pareto totals the complications");
ok(rep.subgroups.find((s) => s.label === "ELBW")?.mortalityPct === 33.3, "ELBW mortality 1/3");
ok(rep.gaps.length >= 8, "data gaps listed honestly");

console.log(`✓ analytics: ${checks} checks passed`);
