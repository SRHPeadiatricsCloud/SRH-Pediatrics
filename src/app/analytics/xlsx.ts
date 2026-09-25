/**
 * Excel export for the NICU Analytics & QI report. SheetJS is imported
 * lazily so the dashboard itself stays light. Every sheet carries the same
 * figures as the on-screen report, with numerators and denominators intact —
 * nothing is invented where data was never captured.
 */
import { downloadXlsx } from "../statistics/xlsx-helpers";
import type { AnalyticsReport, CountRow } from "@/lib/analytics";

type Cell = string | number | null;

const rowsAoa = (rows: CountRow[]): Cell[][] => rows.map((r) => [r.label, r.n]);

export async function exportAnalyticsXlsx(rep: AnalyticsReport): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: Cell[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = (aoa[0] ?? []).map((_, c) => ({
      wch: Math.min(Math.max(...aoa.map((r) => String(r[c] ?? "").length), 10) + 2, 44),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  const d = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v);

  add("Executive summary", [
    ["SRH Pediatrics — NICU Analytics & Quality Improvement"],
    ["Generated", new Date().toLocaleString("en-IN")],
    [],
    ["Measure", "Value", "Detail"],
    ["Admissions", rep.activity.total, `${rep.activity.perMonth}/month average`],
    ["Mortality", `${d(rep.mortality.rate.pct)}%`, `${rep.mortality.deaths} deaths`],
    ["Survival", `${d(rep.mortality.survival.pct)}%`, ""],
    ["Inborn", `${d(rep.activity.inborn.pct)}%`, ""],
    ["ELBW admissions", rep.caseMix.elbw, `VLBW ${rep.caseMix.vlbw}`],
    ["Median LOS (days)", d(rep.los.median), `mean ${d(rep.los.mean)}`],
    ["Antibiotic exposure", `${d(rep.infection.antibioticExposure.pct)}%`, ""],
    ["Admission normothermia", `${d(rep.resuscitation.normothermia.pct)}%`, `coverage ${d(rep.resuscitation.tempCoverage.pct)}%`],
  ]);

  add("Data quality", [
    ["Check", "Value"],
    ["Records", rep.dataQuality.records],
    ["Duplicate UHIDs", rep.dataQuality.duplicates],
    ["Implausible values", rep.dataQuality.implausible.length],
    ["Observations", rep.dataQuality.observations],
    [],
    ["Missing variable", "Count"],
    ...Object.entries(rep.dataQuality.missing).map(([k, n]) => [k, n] as Cell[]),
    [],
    ["Implausible value flags"],
    ...(rep.dataQuality.implausible.length ? rep.dataQuality.implausible.map((x) => [x] as Cell[]) : [["None detected"]]),
  ]);

  add("Activity", [
    ["Month", "Admissions"],
    ...rep.activity.months.map((x) => [x.month, x.admissions] as Cell[]),
    [],
    ["Day of week", "Admissions"],
    ...rowsAoa(rep.activity.byDayOfWeek),
    [],
    ["Unit", "Admissions"],
    ...rowsAoa(rep.activity.byUnit),
  ]);

  add("Case mix", [
    ["Section", "Band", "Count"],
    ...rep.caseMix.gaBands.map((r) => ["Gestational age", r.label, r.n] as Cell[]),
    ...rep.caseMix.bwBands.map((r) => ["Birth weight", r.label, r.n] as Cell[]),
    ...rep.caseMix.sizeForGa.map((r) => ["Size for GA", r.label, r.n] as Cell[]),
    ...rep.caseMix.steroids.map((r) => ["Antenatal steroids", r.label, r.n] as Cell[]),
    ...rep.caseMix.sex.map((r) => ["Sex", r.label, r.n] as Cell[]),
    ...rep.caseMix.delivery.map((r) => ["Delivery", r.label, r.n] as Cell[]),
    ["", "", ""],
    ["ELBW", rep.caseMix.elbw, ""],
    ["VLBW", rep.caseMix.vlbw, ""],
    ["Mean gestation (wk)", rep.caseMix.meanGestation, ""],
    ["Mean birth weight (g)", rep.caseMix.meanBirthWeight, ""],
  ]);

  add("Mortality", [
    ["Band", "Admitted", "Deaths"],
    ...rep.mortality.byGa.map((r) => [`GA ${r.label}`, r.admitted, r.deaths] as Cell[]),
    ...rep.mortality.byBw.map((r) => [`BW ${r.label}`, r.admitted, r.deaths] as Cell[]),
    [],
    ["Timing", "Deaths"],
    ...rowsAoa(rep.mortality.byTiming),
    [],
    ["Cause group", "Deaths"],
    ...rowsAoa(rep.mortality.byCause),
    [],
    ["UHID", "GA", "BW", "Inborn", "Timing", "Cause group"],
    ...rep.mortality.register.map((r) => [r.uhid, r.ga, r.bw, r.inborn ? "Yes" : "No", r.timing, r.cause] as Cell[]),
  ]);

  add("CRIB-II", [
    ["Level", "Band", "Scored", "Deaths", "Observed mortality %"],
    ...rep.crib2.levels.map((l) => [
      l.level,
      l.level === "I" ? "0–5" : l.level === "II" ? "6–10" : l.level === "III" ? "11–15" : ">15",
      l.n,
      l.deaths,
      d(l.mortalityPct),
    ] as Cell[]),
    [],
    ["Coverage", `${rep.crib2.coverage.n}/${rep.crib2.coverage.denom}`, `${d(rep.crib2.coverage.pct)}%`],
    ["Note", rep.crib2.note],
  ]);

  add("Respiratory", [
    ["Indicator", "n", "Denominator", "%"],
    ["Mechanical ventilation", rep.respiratory.ventilation.n, rep.respiratory.ventilation.denom, d(rep.respiratory.ventilation.pct)],
    ["CPAP", rep.respiratory.cpap.n, rep.respiratory.cpap.denom, d(rep.respiratory.cpap.pct)],
    ["HFNC", rep.respiratory.hfnc.n, rep.respiratory.hfnc.denom, d(rep.respiratory.hfnc.pct)],
    ["Surfactant", rep.respiratory.surfactant.n, rep.respiratory.surfactant.denom, d(rep.respiratory.surfactant.pct)],
    ["Caffeine", rep.respiratory.caffeine.n, rep.respiratory.caffeine.denom, d(rep.respiratory.caffeine.pct)],
    ["BPD at 36 wk PMA", rep.respiratory.bpd.n, rep.respiratory.bpd.denom, d(rep.respiratory.bpd.pct)],
    [],
    ["Median ventilator days", d(rep.respiratory.medianVentDays)],
    ["Reintubations", rep.respiratory.reintubations],
  ]);

  add("Infection", [
    ["Indicator", "Value"],
    ["Antibiotic exposure %", d(rep.infection.antibioticExposure.pct)],
    ["Cultures sent", rep.infection.culturesSent.n],
    ["Culture positive", rep.infection.culturePositive],
    ["Positivity %", d(rep.infection.positivity.pct)],
    ["EOS", rep.infection.eos],
    ["LOS", rep.infection.los],
    ["CLABSI", rep.infection.clabsi],
    ["Line days", rep.infection.lineDays],
    ["CLABSI /1000 line-days", d(rep.infection.clabsiRate)],
    ["Median antibiotic days", d(rep.infection.medianAntibioticDays)],
    ["Meningitis", rep.infection.meningitis],
    [],
    ["Organism", "Count"],
    ...rowsAoa(rep.infection.organisms),
  ]);

  add("NEC & nutrition", [
    ["Indicator", "Value"],
    ["NEC %", d(rep.necFeeding.nec.pct)],
    ["Median first feed (DOL)", d(rep.necFeeding.firstFeed.median)],
    ["Median full feeds (DOL)", d(rep.necFeeding.fullFeed.median)],
    ["Median PN days", d(rep.necFeeding.pn.median)],
    ["Exclusive human milk", rep.necFeeding.exclusiveHumanMilk],
    ["Avg max weight loss %", d(rep.nutrition.avgMaxLossPct)],
    ["Excessive loss (>10%)", rep.nutrition.excessiveLoss],
    ["Avg regain day", d(rep.nutrition.avgRegainDay)],
    ["Avg velocity g/kg/d", d(rep.nutrition.avgVelocity)],
    ["Slow velocity (<12)", rep.nutrition.slowVelocity],
    ["Human milk now %", d(rep.nutrition.humanMilkNow.pct)],
    ["On TPN", rep.nutrition.tpn],
  ]);

  add("Neuro, ROP, lines", [
    ["Indicator", "Value"],
    ["Any IVH", rep.neuro.anyIvh],
    ["Severe IVH", rep.neuro.severeIvh],
    ["PVL", rep.neuro.pvl],
    ["Seizures", rep.neuro.seizures],
    ["ROP eligible", rep.rop.eligible],
    ["ROP screened", rep.rop.screened],
    ["ROP missed", rep.rop.missed],
    ["ROP compliance %", d(rep.rop.compliance.pct)],
    ["ROP treated", rep.rop.treated],
    ["PRBC units", rep.transfusions.prbc],
    ["Platelet units", rep.transfusions.platelets],
    ["FFP units", rep.transfusions.ffp],
    [],
    ["Line type", "Count"],
    ...rowsAoa(rep.lines.types),
  ]);

  add("LOS & discharge", [
    ["Indicator", "Value"],
    ["Median LOS (days)", d(rep.los.median)],
    ["Mean LOS (days)", d(rep.los.mean)],
    ["Discharged home", rep.discharge.home],
    ["Transferred", rep.discharge.transferred],
    ["Deaths", rep.discharge.death],
    ["Avg discharge weight (g)", d(rep.discharge.avgWeightG)],
    ["Avg PMA at discharge", d(rep.discharge.avgPma)],
    ["Home oxygen", rep.discharge.homeOxygen],
    ["Readmitted ≤28 d", rep.discharge.readmitted28d],
    [],
    ["GA band", "Left", "Median LOS"],
    ...rep.los.byGa.map((r) => [r.label, r.n, d(r.median)] as Cell[]),
  ]);

  add("Monthly trends", [
    ["Month", "Admissions", "Deaths", "NEC", "Ventilated", "Antibiotics", "Human milk"],
    ...rep.trends.map((t) => [t.month, t.admissions, t.deaths, t.nec, t.vented, t.antibiotics, t.humanMilk] as Cell[]),
  ]);

  add("Quality indicators", [
    ["Domain", "Indicator", "Value", "n", "Denominator", "Reference", "Status", "Priority", "Source"],
    ...rep.indicators.map((i) => [i.domain, i.indicator, i.value, i.n ?? "", i.denom ?? "", i.reference, i.status, i.priority, i.source] as Cell[]),
  ]);

  add("Pareto & subgroups", [
    ["Complication", "Count", "Cumulative %"],
    ...rep.pareto.map((p) => [p.label, p.n, p.cumulativePct] as Cell[]),
    [],
    ["Subgroup", "n", "Mortality %", "Severe IVH", "NEC"],
    ...rep.subgroups.map((s) => [s.label, s.n, d(s.mortalityPct), s.severeIvh, s.nec] as Cell[]),
  ]);

  add("Data gaps", [
    ["Domain", "Note"],
    ...rep.gaps.map((g) => [g.domain, g.note] as Cell[]),
  ]);

  downloadXlsx(XLSX, wb, "srh-nicu-analytics-quality-report.xlsx");
}
