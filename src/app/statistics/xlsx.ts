/**
 * Excel export for the month-end Statistics report.
 *
 * Built client-side with SheetJS (`xlsx`) — the package is imported lazily so
 * it never lands in the main page bundle. The workbook mirrors the on-screen
 * report: one sheet per section, plus an admissions register and a raw
 * day-by-day census sheet so the unit can pivot the figures itself.
 */
import { downloadXlsx } from "./xlsx-helpers";
import type { CountRow, MonthStats } from "@/lib/stats";
import { formatMonthLabel } from "@/lib/discharge";

type Cell = string | number | null;

function bandToAoa(rows: { label: string; admitted: number; deaths: number }[]): Cell[][] {
  return [
    ["Band", "Admitted", "Deaths", "Mortality %"],
    ...rows.map((r) => [
      r.label,
      r.admitted,
      r.deaths,
      r.admitted > 0 ? Math.round((r.deaths / r.admitted) * 1000) / 10 : 0,
    ] as Cell[]),
  ];
}

function losToAoa(rows: { label: string; discharged: number; avgLos: number | null }[]): Cell[][] {
  return [
    ["Band", "Left unit", "Avg LOS (days)"],
    ...rows.map((r) => [r.label, r.discharged, r.avgLos ?? "—"] as Cell[]),
  ];
}

export async function exportStatsXlsx(stats: MonthStats): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const monthLabel = formatMonthLabel(stats.month);
  const title = `SRH Pediatrics — ${monthLabel} — ${stats.unit === "all" ? "All units" : stats.unit.toUpperCase()}`;

  const add = (name: string, aoa: Cell[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = (aoa[0] ?? []).map((_, c) => {
      const w = Math.max(...aoa.map((r) => String(r[c] ?? "").length), 10);
      return { wch: Math.min(Math.max(w + 2, 10), 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // ---- Overview ----------------------------------------------------------
  const o = stats.outcomes;
  add("Overview", [
    [title],
    [],
    ["Measure", monthLabel, stats.prev ? `Previous (${stats.prev.month})` : "Previous"],
    ["Admissions", stats.admissions, stats.prev?.admissions ?? "—"],
    ["Departures", stats.departures.total, stats.prev?.departures ?? "—"],
    ["Deaths", stats.departures.death, stats.prev?.deaths ?? "—"],
    ["Patient-days", stats.patientDays, stats.prev?.patientDays ?? "—"],
    ["Average daily census", stats.avgDailyCensus, stats.prev?.avgDailyCensus ?? "—"],
    ["Peak census", stats.peakCensus, "—"],
    ["End-of-month census", stats.endOfPeriodCensus, "—"],
    ["Average length of stay (days)", o.avgLosDays ?? "—", "—"],
    ["Mortality %", o.mortalityPct ?? "—", "—"],
    ["Survival to discharge %", o.survivalToDischargePct ?? "—", "—"],
    ["Still in unit", o.active, "—"],
    ["Discharged home", o.discharged, "—"],
    ["Transferred", o.transferred, "—"],
    ["Average discharge weight (g)", o.avgDischargeWeightG ?? "—", "—"],
  ]);

  // ---- Daily census & flow ------------------------------------------------
  add("Daily census & flow", [
    ["Day", "Census", "Admissions", "Departures"],
    ...stats.census.map((c, i) => [
      c.day,
      c.n,
      stats.flowByDay[i]?.admissions ?? 0,
      stats.flowByDay[i]?.departures ?? 0,
    ] as Cell[]),
  ]);

  // ---- Demographics -------------------------------------------------------
  add("Demographics", [
    ["Section", "Parameter", "Count"],
    ...([
      ["Sex", stats.sex],
      ["Place of birth", stats.place],
      ["Gestational age", stats.gestBands],
      ["Birth weight", stats.weightBands],
      ["Delivery mode", stats.deliveryModes],
      ["Acuity on admission", stats.acuity],
      ["Insurance", stats.insurance],
      ["Consultant", stats.consultants],
      ["Blood group", stats.bloodGroups],
    ] as [string, CountRow[]][]).flatMap(([section, rows]) =>
      rows.map((r) => [section, r.label, r.n] as Cell[]),
    ),
    ["", "", ""],
    ["Apgar 5' < 7", "", stats.apgar5Below7],
    ["Apgar 1' < 7", "", stats.apgar1Below7],
    ["Mean birth length (cm)", "", stats.meanBirthLength ?? "—"],
    ["Mean birth head circ. (cm)", "", stats.meanBirthHc ?? "—"],
  ]);

  // ---- Interventions & events --------------------------------------------
  add("Interventions & events", [
    ["Section", "Parameter", "Count"],
    ...([
      ["Intervention", stats.interventions],
      ["Feeding milestone", stats.milestones],
      ["Screening", stats.screens],
      ["Respiratory mode (active)", stats.respiratoryModes],
      ["Line in situ", stats.lines],
    ] as [string, CountRow[]][]).flatMap(([section, rows]) =>
      rows.map((r) => [section, r.label, r.n] as Cell[]),
    ),
    ["", "", ""],
    ["Babies on drugs", "", stats.drugs.babiesOnDrugs],
    ...stats.drugs.top.map((r) => ["Drug", r.label, r.n] as Cell[]),
  ]);

  // ---- Growth & nutrition -------------------------------------------------
  const g = stats.growth;
  add("Growth & nutrition", [
    ["Measure", "Value"],
    ["Babies with weight charts", g.withWeights],
    ["Avg max weight loss (%)", g.avgMaxLossPct ?? "—"],
    ["Avg day to regain birth weight", g.avgRegainDay ?? "—"],
    ["Avg weight velocity (g/kg/day)", g.avgVelocity ?? "—"],
    ["Avg fluids (ml/kg/day, active)", g.avgFluidsMlKgDay ?? "—"],
    ["Human milk rate (%)", g.humanMilkPct ?? "—"],
    ["Avg GIR (active)", stats.avgGir ?? "—"],
    ["Avg kcal (active)", stats.avgKcal ?? "—"],
    ["On TPN (active)", stats.tpnBabies],
    ["", ""],
    ["Velocity category", "Babies"],
    ...stats.growthCategories.map((r) => [r.label, r.n] as Cell[]),
  ]);

  // ---- Vitals & problems --------------------------------------------------
  const v = stats.vitals;
  add("Vitals & problems", [
    ["Measure", "Value"],
    ["Observations recorded", v.observations],
    ["Babies monitored", v.babies],
    ["Heart rate (avg / min / max)", `${v.hr.avg ?? "—"} / ${v.hr.min ?? "—"} / ${v.hr.max ?? "—"}`],
    ["Resp rate (avg / min / max)", `${v.rr.avg ?? "—"} / ${v.rr.min ?? "—"} / ${v.rr.max ?? "—"}`],
    ["SpO2 (avg / min / max)", `${v.spo2.avg ?? "—"} / ${v.spo2.min ?? "—"} / ${v.spo2.max ?? "—"}`],
    ["Temperature (avg / min / max)", `${v.temp.avg ?? "—"} / ${v.temp.min ?? "—"} / ${v.temp.max ?? "—"}`],
    ["Fever episodes (≥38 °C)", v.fever],
    ["Hypothermia episodes (<36 °C)", v.hypothermia],
    ["Hypoglycaemia (RBS <47)", v.hypoglycemia],
    ["Desaturations (SpO2 <90)", v.desaturations],
    ["Avg urine output (ml/kg/hr)", v.avgUrine ?? "—"],
    ["", ""],
    ["New problems", stats.problems.newCount],
    ["Problems still active", stats.problems.active],
    ["Problems resolved", stats.problems.resolved],
    ["", ""],
    ["Problem (top)", "Count"],
    ...stats.problems.top.map((r) => [r.label, r.n] as Cell[]),
  ]);

  // ---- Outcomes by band ---------------------------------------------------
  add("Outcomes by band", [
    ["Gestational age — mortality"],
    ...bandToAoa(stats.mortalityByGa).slice(1),
    [],
    ["Birth weight — mortality"],
    ...bandToAoa(stats.mortalityByWeight).slice(1),
    [],
    ["Gestational age — length of stay"],
    ...losToAoa(stats.losByGa).slice(1),
    [],
    ["Birth weight — length of stay"],
    ...losToAoa(stats.losByWeight).slice(1),
  ]);

  // ---- Admissions register ------------------------------------------------
  add("Admissions register", [
    ["UHID", "Name", "Unit", "Sex", "GA", "Birth wt", "Status", "Consultant", "Admitted"],
    ...stats.cohort.map((b) => [
      b.uhid,
      b.babyName,
      (b.unit ?? "").toUpperCase(),
      b.sex,
      `${b.gestWeeks}+${b.gestDays ?? 0}`,
      b.birthWeight,
      b.status,
      b.consultant || "—",
      String(b.createdAt).slice(0, 10),
    ] as Cell[]),
  ]);

  const base = title.replace(/[^\w]+/g, "-").toLowerCase();
  downloadXlsx(XLSX, wb, `${base}-statistics.xlsx`);
}
