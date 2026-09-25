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
  type MonthExtras,
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
  bloodGroup?: string;
  birthLength?: number;
  birthHc?: number;
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
  birthLength: f.birthLength ?? 0,
  birthHc: f.birthHc ?? 0,
  bloodGroup: f.bloodGroup ?? "Unknown",
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
  birthLength: 41, birthHc: 28, bloodGroup: "O+",
  apgar1: 7, apgar5: 8,
  clinical: {
    fluids: { totalMlKgDay: 150, feedType: "EBM", gir: 8, kcal: 80 },
    resp: { mode: "CPAP" },
    lines: [{ name: "UVC", day: 1 }],
    drugs: [{ name: "Caffeine" }],
    eventLog: {
      CPAP: { date: "1/9/26" },
      FIRST_FEED: { date: "2/9/26", result: "EBM 2ml" },
      BLOOD_CULTURE_1: { date: "1/9/26", result: "sent" },
    },
    growth: [{ at: at(2026, 9, 3), weight: 1380 }],
  },
});

const b2 = baby({
  admitted: at(2026, 9, 5),
  status: "discharged",
  sex: "Female",
  dob: at(2026, 8, 20),
  gestWeeks: 38, birthWeight: 2800, currentWeight: 2900,
  birthLength: 49, birthHc: 34, bloodGroup: "A+",
  deliveryMode: "LSCS", apgar1: 4, apgar5: 6,
  clinical: {
    eventLog: {
      CUS1: { date: "8/9/26", result: "normal" },
      FULL_FEED: { date: "12/9/26", result: "full enteral" },
      PHOTOTHERAPY: { date: "7/9/26" },
    },
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
    fluids: { tpn: true, feedType: "Donor milk" },
    eventLog: { ROP1: { date: "28/9/26", result: "zone II" } },
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

/* Companion records for the September window. */
const EXTRAS: MonthExtras = {
  vitals: [
    { babyId: b1.id, recordedAt: at(2026, 9, 2, 8), hr: 150, rr: 55, spo2: 95, temp: 36.4, rbs: 60, urineMlKgHr: 2 },
    { babyId: b1.id, recordedAt: at(2026, 9, 3, 8), hr: 142, rr: 48, spo2: 97, temp: 36.8, rbs: 52 },
    { babyId: b3.id, recordedAt: at(2026, 9, 9, 8), hr: 180, rr: 70, spo2: 85, temp: 38.5, rbs: 40 },
    { babyId: b3.id, recordedAt: at(2026, 9, 10, 8), hr: 176, spo2: 88, temp: 35.8 },
    // Outside the September window — must never count.
    { babyId: b1.id, recordedAt: at(2026, 10, 5, 8), hr: 160, temp: 37 },
    // Another unit — excluded by the NICU filter.
    { babyId: b8.id, recordedAt: at(2026, 9, 16, 8), hr: 120 },
  ],
  problems: [
    { babyId: b3.id, system: "GI", label: "NEC", status: "active", onsetAt: at(2026, 9, 10) },
    { babyId: b2.id, system: "Respiratory", label: "RDS", status: "resolved", onsetAt: at(2026, 9, 6), resolvedAt: at(2026, 9, 18) },
    // Onset in August — not a new September problem.
    { babyId: b6.id, system: "Respiratory", label: "TTN", status: "resolved", onsetAt: at(2026, 8, 25), resolvedAt: at(2026, 8, 28) },
  ],
  handovers: [
    { babyId: b1.id, createdAt: at(2026, 9, 15, 19), acknowledgedBy: "Dr A" },
    { babyId: b5.id, createdAt: at(2026, 9, 20, 19), acknowledgedBy: "" },
    { babyId: b5.id, createdAt: at(2026, 10, 2, 19), acknowledgedBy: "" },
  ],
  tasks: [
    { babyId: b1.id, createdAt: at(2026, 9, 4, 9), done: true },
    { babyId: b3.id, createdAt: at(2026, 9, 9, 9), done: true },
    { babyId: b5.id, createdAt: at(2026, 9, 25, 9), done: false },
  ],
};

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
const s = computeMonthStats(ROWS, SEP, "nicu", NOW, EXTRAS);

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
ok(row(s.interventions, "Antibiotics") === 2, "antibiotics from the drug lists (b1, b3)");
ok(row(s.interventions, "Phototherapy") === 1, "phototherapy from the event log (b2)");
ok(row(s.interventions, "Blood culture sent") === 1, "blood culture from the event log (b1)");
ok(row(s.interventions, "Mechanical ventilation") === 0, "no ventilations this month");

/* growth & nutrition */
ok(s.growth.withWeights === 2, "two babies have growth series");
ok(s.growth.avgMaxLossPct === 3.9, `average max weight loss 3.9% (got ${s.growth.avgMaxLossPct})`);
ok(s.growth.avgRegainDay === 20, `average regain day 20 (got ${s.growth.avgRegainDay})`);
ok(s.growth.avgVelocity === 6.8, `average velocity 6.8 g/kg/d (got ${s.growth.avgVelocity})`);
ok(s.growth.avgFluidsMlKgDay === 150, "fluids snapshot from the active cohort only");
ok(s.growth.humanMilkPct === 100, "human-milk rate counts EBM and donor milk");

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

/* --------------------------- deep blocks (4.0) --------------------------- */
/* vitals — September window only, NICU only */
ok(s.vitals.observations === 4, `4 September NICU observations (got ${s.vitals.observations})`);
ok(s.vitals.babies === 2, "observations cover two babies");
ok(s.vitals.fever === 1, "one fever episode (38.5)");
ok(s.vitals.hypothermia === 1, "one hypothermia episode (35.8)");
ok(s.vitals.hypoglycemia === 1, "one hypoglycaemia (RBS 40)");
ok(s.vitals.desaturations === 2, "two desaturations (85, 88)");
ok(s.vitals.hr.max === 180 && s.vitals.hr.min === 142, "heart-rate range across the window");
ok(s.vitals.avgUrine === 2, "urine output averaged");

/* problems */
ok(s.problems.newCount === 2, "two problems with September onset");
ok(s.problems.active === 1, "NEC still active");
ok(s.problems.resolved === 1, "RDS resolved in September");
ok(row(s.problems.bySystem, "GI") === 1 && row(s.problems.bySystem, "Respiratory") === 1, "problems grouped by system");

/* daily flow */
ok(s.flowByDay.find((f) => f.day === "2026-09-01")?.admissions === 1, "flow chart admission on the 1st");
ok(s.flowByDay.find((f) => f.day === "2026-09-20")?.departures === 1, "flow chart departure on the 20th");
ok(s.flowByDay.reduce((a, f) => a + f.departures, 0) === 4, "flow departures sum to the month total");

/* mortality & LOS by band */
ok(s.mortalityByGa.find((r) => r.label === "Extremely preterm (<28 wk)")?.deaths === 1, "the ELBW death lands in the <28 wk band");
ok(s.mortalityByGa.find((r) => r.label === "Extremely preterm (<28 wk)")?.admitted === 1, "band admits counted");
ok(s.mortalityByWeight.find((r) => r.label === "ELBW (<750 g)")?.deaths === 1, "the death lands in the ELBW weight band");
ok(s.losByGa.find((r) => r.label === "Term (≥37 wk)")?.avgLos === 31, "term LOS from the discharged cohort baby");
ok(s.losByWeight.find((r) => r.label === "≥2500 g")?.avgLos === 31, "term-weight LOS matches");

/* milestones & screens */
ok(row(s.milestones, "First feed") === 1, "first feed milestone");
ok(row(s.milestones, "Full feeds") === 1, "full feeds milestone");
ok(row(s.screens, "Cranial ultrasound (CUS 1–3)") === 1, "CUS screen counted");
ok(row(s.screens, "ROP screen (1–2)") === 1, "ROP screen counted");

/* snapshot blocks */
ok(row(s.respiratoryModes, "CPAP") === 1 && row(s.respiratoryModes, "HFNC") === 1, "respiratory snapshot of the active cohort");
ok(row(s.lines, "UVC") === 1, "line names tallied");
ok(s.drugs.babiesOnDrugs === 2, "two babies on drugs");
ok(row(s.drugs.top, "Caffeine") === 1 && row(s.drugs.top, "Amikacin") === 1, "top drugs listed");
ok(s.bloodGroups.length === 3, "blood groups tallied");
ok(row(s.bloodGroups, "O+") === 1, "blood group counts");

/* growth categories & feeds detail */
ok(row(s.growthCategories, "Slow (<12 g/kg/day)") === 2, "both velocities are slow");
ok(s.avgGir === 8 && s.avgKcal === 80, "GIR and kcal snapshot from the active cohort");
ok(s.tpnBabies === 1, "one baby on TPN");

/* demographics extras */
ok(s.apgar1Below7 === 1, "one baby with Apgar1 < 7");
ok(s.meanBirthLength === 45 && s.meanBirthHc === 31, "mean birth length & head circumference");

/* ward activity */
ok(s.activity.handovers === 2 && s.activity.acknowledged === 1, "September handovers, one acknowledged");
ok(s.activity.tasksCreated === 3 && s.activity.tasksDone === 2, "September tasks, two done");

/* registers for export */
ok(s.departureRows.length === 4, "departure register holds the four babies who left");
ok(s.cohort.length === s.admissions, "cohort feeds the admissions register");

console.log(`✓ stats: ${checks} checks passed`);
