/**
 * Month-end statistics: census, flow, demographics, interventions, growth and
 * outcomes must all agree with the raw charts, no matter how the month is
 * filtered or which day the report is run.
 *
 * The numbers are hand-counted here so any regression in the engine shows up
 * as a named assertion, and every date is LOCAL — the same convention as the
 * discharge archive.
 *
 * Run with: npx tsx scripts/test-stats.ts
 */
import assert from "node:assert/strict";
import {
  computeMonthStats,
  monthDays,
  daysInMonth,
  prevMonth,
  gestBand,
  birthWeightBand,
  dayKey,
  monthOf,
  type StatBaby,
} from "../src/lib/stats";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

/** A fixed "now" — mid October 2026, so September is complete and October is in progress. */
const NOW = new Date(2026, 9, 15, 12, 0, 0);
const at = (y: number, mo: number, d: number, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

let nextId = 1;
type Factory = {
  admitted: string;
  status?: string;
  unit?: string;
  sex?: string;
  dob?: string;
  gestWeeks?: number;
  gestDays?: number;
  birthWeight?: number;
  currentWeight?: number;
  deliveryMode?: string;
  inborn?: boolean;
  acuity?: string;
  consultant?: string;
  insurance?: string;
  apgar1?: number | null;
  apgar5?: number | null;
  clinical?: StatBaby["clinical"];
};
const baby = (f: Factory): StatBaby => ({
  id: nextId++,
  babyName: `Baby ${nextId}`,
  uhid: `U${1000 + nextId}`,
  unit: f.unit ?? "nicu",
  status: f.status ?? "active",
  sex: f.sex ?? "Male",
  dob: f.dob ?? "",
  gestWeeks: f.gestWeeks ?? 36,
  gestDays: f.gestDays ?? 0,
  birthWeight: f.birthWeight ?? 2500,
  currentWeight: f.currentWeight ?? f.birthWeight ?? 2500,
  deliveryMode: f.deliveryMode ?? "NVD",
  inborn: f.inborn ?? false,
  acuity: f.acuity ?? "standard",
  consultant: f.consultant ?? "Dr A",
  insurance: f.insurance ?? "cash",
  apgar1: f.apgar1 ?? null,
  apgar5: f.apgar5 ?? null,
  createdAt: f.admitted,
  clinical: f.clinical ?? null,
});

const SEP = "2026-09";

const b1 = baby({
  admitted: at(2026, 9, 1),
  dob: at(2026, 9, 1),
  inborn: true,
  gestWeeks: 30, gestDays: 3, birthWeight: 1400, currentWeight: 1600,
  apgar1: 7, apgar5: 8,
  clinical: {
    fluids: { totalMlKgDay: 150, feedType: "EBM" },
    resp: { mode: "CPAP" },
    lines: [{ name: "UVC" }],
    eventLog: { CPAP: { date: "1/9/26" } },
    growth: [{ at: at(2026, 9, 3), weight: 1380 }],
  },
});

const b2 = baby({
  admitted: at(2026, 9, 5),
  status: "discharged",
  sex: "Female",
  dob: at(2026, 8, 20),
  gestWeeks: 38, birthWeight: 2800, currentWeight: 2900,
  deliveryMode: "LSCS", apgar5: 6,
  clinical: {
    growth: [
      { at: at(2026, 8, 21), weight: 2750 },
      { at: at(2026, 8, 23), weight: 2650 },
      { at: at(2026, 9, 10), weight: 2900 },
    ],
    dischargeRecord: { at: at(2026, 9, 20), date: "2026-09-20", outcome: "discharged", summary: "", signedBy: "Test", weightAtDischarge: 2900 },
  },
});

const b3 = baby({
  admitted: at(2026, 9, 8),
  status: "death",
  dob: at(2026, 9, 1),
  gestWeeks: 26, gestDays: 2, birthWeight: 700,
  consultant: "Dr B",
  clinical: {
    drugs: [{ name: "Amikacin" }],
    dischargeRecord: { at: at(2026, 9, 25), date: "2026-09-25", outcome: "death", summary: "", signedBy: "Test" },
  },
});

const b4 = baby({
  admitted: at(2026, 9, 10),
  status: "transferred",
  dob: at(2026, 8, 10),
  gestWeeks: 34, birthWeight: 2000,
  clinical: { dischargeRecord: { at: at(2026, 9, 28), date: "2026-09-28", outcome: "transferred", summary: "", signedBy: "Test", unitAtDischarge: "MCU" } },
});

const b5 = baby({
  admitted: at(2026, 9, 12),
  dob: at(2026, 9, 12),
  gestWeeks: 34, birthWeight: 2000, currentWeight: 2400,
  clinical: {
    resp: { mode: "HFNC" },
    growth: [
      { at: at(2026, 9, 12), weight: 1950 },
      { at: at(2026, 10, 1), weight: 2400 },
    ],
  },
});

// Admitted in August, discharged in September: counts for September departures and census, not admissions.
const b6 = baby({ admitted: at(2026, 8, 1), dob: at(2026, 7, 28), gestWeeks: 39, birthWeight: 3100, status: "discharged",
  clinical: { dischargeRecord: { at: at(2026, 9, 3), date: "2026-09-03", outcome: "discharged", summary: "", signedBy: "Test", weightAtDischarge: 3200 } } });

// Deleted chart: must never appear anywhere.
const b7 = baby({ admitted: at(2026, 9, 15), status: "deleted" });

// Another unit: excluded from the NICU report, included under "all".
const b8 = baby({ admitted: at(2026, 9, 15), unit: "picu", gestWeeks: 40, birthWeight: 3300 });

const ROWS = [b1, b2, b3, b4, b5, b6, b7, b8];

/* ------------------------------ calendar ------------------------------- */
ok(monthDays("2026-09").length === 30, "September has 30 local days");
ok(monthDays("2026-09")[0] === "2026-09-01", "month days start on the 1st");
ok(daysInMonth("2026-02") === 28, "2026 is not a leap year");
ok(prevMonth("2026-09") === "2026-08", "previous month of September");
ok(prevMonth("2026-01") === "2025-12", "previous month rolls the year");
ok(dayKey(at(2026, 9, 30, 23)) === "2026-09-30", "dayKey is local");
ok(monthOf(at(2026, 10, 1, 0, 5)) === "2026-10", "monthOf is local");
ok(gestBand(27.9) === "Extremely preterm (<28 wk)", "GA band edge: 27+6");
ok(gestBand(32) === "Moderate–late preterm (32–36 wk)", "GA band 32 wk");
ok(birthWeightBand(750) === "VLBW (750–999 g)", "weight band edge: 750 g");
ok(birthWeightBand(2500) === "≥2500 g", "weight band edge: 2500 g");

/* --------------------------- September cohort --------------------------- */
const s = computeMonthStats(ROWS, SEP, "nicu", NOW);

ok(s.admissions === 5, `September NICU admissions are 5 (got ${s.admissions})`);
ok(!s.cohort.some((b) => b.status === "deleted"), "deleted charts never enter the cohort");
ok(!s.cohort.some((b) => b.unit !== "nicu"), "the unit filter keeps foreign units out");
ok(computeMonthStats(ROWS, SEP, "all", NOW).admissions === 6, "all-units admissions include the PICU baby");
ok(s.admissionsByDay.find((d) => d.day === "2026-09-01")?.n === 1, "admission bars land on the right day");

/* departures */
ok(s.departures.discharged === 2, "two discharges in September (cohort + carry-over)");
ok(s.departures.transferred === 1, "one transfer in September");
ok(s.departures.death === 1, "one death in September");
ok(s.departures.total === 4, "four departures in total");

/* census & patient-days — hand counted */
ok(s.patientDays === 101, `patient-days are 101 (got ${s.patientDays})`);
ok(s.avgDailyCensus === 3.4, `average daily census is 3.4 (got ${s.avgDailyCensus})`);
ok(s.peakCensus === 5, "peak census is 5");
ok(s.endOfPeriodCensus === 2, "end-of-month census is 2 (b1, b5 still in)");
ok(s.census.find((c) => c.day === "2026-09-20")?.n === 4, "a discharge day no longer counts that baby");
ok(s.census.find((c) => c.day === "2026-09-15")?.n === 5, "mid-month census counts all five in-house");

/* demographics */
const row = (rows: { label: string; n: number }[], label: string) => rows.find((r) => r.label === label)?.n ?? 0;
ok(row(s.sex, "Male") === 4 && row(s.sex, "Female") === 1, "sex split 4M/1F");
ok(row(s.place, "Inborn") === 1 && row(s.place, "Outborn") === 4, "inborn/outborn split");
ok(row(s.gestBands, "Extremely preterm (<28 wk)") === 1, "one extremely preterm");
ok(row(s.gestBands, "Term (≥37 wk)") === 1, "one term baby");
ok(row(s.gestBands, "Moderate–late preterm (32–36 wk)") === 2, "two moderate–late preterms");
ok(row(s.weightBands, "ELBW (<750 g)") === 1, "one ELBW");
ok(row(s.weightBands, "1500–2499 g") === 2, "two babies in 1500–2499 g");
ok(row(s.deliveryModes, "LSCS") === 1, "one LSCS");
ok(s.apgar5Below7 === 1, "one baby with Apgar5 < 7");
ok(row(s.consultants, "Dr B") === 1, "consultant tally per chart");

/* interventions */
ok(row(s.interventions, "CPAP") === 1, "CPAP counted once (event log or resp mode)");
ok(row(s.interventions, "Nasal HFNC / flow") === 1, "HFNC from resp mode");
ok(row(s.interventions, "UVC") === 1, "UVC counted");
ok(row(s.interventions, "Antibiotics") === 1, "antibiotics from the drug list");
ok(row(s.interventions, "Mechanical ventilation") === 0, "no ventilations this month");

/* growth & nutrition */
ok(s.growth.withWeights === 2, "two babies have growth series");
ok(s.growth.avgMaxLossPct === 3.9, `average max weight loss 3.9% (got ${s.growth.avgMaxLossPct})`);
ok(s.growth.avgRegainDay === 20, `average regain day 20 (got ${s.growth.avgRegainDay})`);
ok(s.growth.avgVelocity === 6.8, `average velocity 6.8 g/kg/d (got ${s.growth.avgVelocity})`);
ok(s.growth.avgFluidsMlKgDay === 150, "fluids snapshot from the active cohort only");
ok(s.growth.humanMilkPct === 50, "human-milk rate over the active cohort");

/* outcomes */
ok(s.outcomes.active === 2, "two still active from the cohort");
ok(s.outcomes.discharged === 1 && s.outcomes.transferred === 1 && s.outcomes.death === 1, "cohort outcomes split");
ok(s.outcomes.mortalityPct === 50, "mortality among discharges+deaths is 50%");
ok(s.outcomes.survivalToDischargePct === 50, "survival to discharge is 50%");
ok(s.outcomes.avgLosDays === 34.7, `average LOS 34.7 d (got ${s.outcomes.avgLosDays})`);
ok(s.outcomes.avgDischargeWeightG === 2900, "average discharge weight");

/* previous-month comparison */
ok(s.prev?.month === "2026-08", "prev month is August");
ok(s.prev?.admissions === 1, "August admitted one baby (b6)");
ok(s.prev?.departures === 0, "no August departures");
ok(s.prev?.patientDays === 31, `August patient-days 31 (got ${s.prev?.patientDays})`);
ok(s.prev?.avgDailyCensus === 1, "August average daily census is 1");

/* -------------------- in-progress month uses elapsed days ------------------ */
const o = computeMonthStats(ROWS, "2026-10", "nicu", NOW);
ok(o.census.length === 31, "October still lists 31 calendar days");
const elapsed = o.census.filter((c) => c.day <= dayKey(NOW));
ok(elapsed.length === 15, "only elapsed days drive the averages");
ok(o.patientDays === 30, "October patient-days count elapsed days only");
ok(o.avgDailyCensus === 2, "October average daily census is 2");
ok(o.admissions === 0, "no October admissions in the fixtures");

/* -------------------- all-units rollup ------------------------------- */
const all = computeMonthStats(ROWS, SEP, "all", NOW);
ok(row(all.admissionsByUnit, "NICU") === 5 && row(all.admissionsByUnit, "PICU") === 1, "admissions split by unit");
ok(all.patientDays === 117, "all-units patient-days add the PICU carry-over");

console.log(`✓ stats: ${checks} checks passed`);
