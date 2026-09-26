/**
 * Month-end statistics engine.
 *
 * Pure and dependency-free (apart from the discharge helpers it reuses) so the
 * numbers that land in the Statistics tab can be unit-tested. All grouping is
 * on the LOCAL calendar day/month — the unit runs on IST, the same convention
 * as the discharge archive.
 *
 * The cohort of a month is "babies admitted that month" (their createdAt).
 * Census, patient-days and the departures that happened inside the month are
 * counted over every baby in the unit, whenever they were admitted — that is
 * what a monthly ward report actually needs.
 */
import { dischargeDay, dischargeOf, lengthOfStayDays, type Archivable } from "./discharge";
import { gainGPerKgDay } from "./clinical";

export type StatBaby = Archivable & {
  sex: string;
  gestWeeks: number;
  gestDays: number;
  birthWeight: number;
  birthLength?: number;
  birthHc?: number;
  bloodGroup?: string;
  deliveryMode: string;
  inborn: boolean;
  acuity: string;
  consultant: string;
  insurance: string;
  apgar1?: number | null;
  apgar5?: number | null;
  createdAt: string | Date;
  clinical?: {
    fluids?: { totalMlKgDay?: number; feedType?: string; gir?: number; kcal?: number; tpn?: boolean; feedRoute?: string };
    resp?: { mode?: string };
    lines?: { name: string; day?: number }[];
    drugs?: { name: string }[];
    growth?: { at: string; weight: number }[];
    eventLog?: Record<string, { date?: string; result?: string; starting?: string; ending?: string; notes?: string }>;
    dischargeRecord?: import("./clinical").DischargeRecord;
  } | null;
};

/** Observation row — the fields the monthly report reads from the vitals table. */
export type StatVital = {
  babyId: number;
  recordedAt: string | Date;
  hr?: number | null;
  rr?: number | null;
  spo2?: number | null;
  temp?: number | null;
  rbs?: number | null;
  urineMlKgHr?: number | null;
};

export type StatProblem = {
  babyId: number;
  system: string;
  label: string;
  status: string;
  onsetAt: string | Date;
  resolvedAt?: string | Date | null;
};

export type StatHandover = { babyId: number; createdAt: string | Date; acknowledgedBy?: string | null };
export type StatTask = { babyId: number; createdAt: string | Date; done: boolean };

/** Companion records for the month window, fetched from /api/statistics. */
export type MonthExtras = {
  vitals?: StatVital[];
  problems?: StatProblem[];
  handovers?: StatHandover[];
  tasks?: StatTask[];
};

export type CountRow = { label: string; n: number };

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local YYYY-MM-DD of an ISO timestamp. */
export function dayKey(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (!d || Number.isNaN(+d)) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local YYYY-MM of an ISO timestamp. */
export function monthOf(input: string | Date): string {
  return dayKey(input).slice(0, 7);
}

export function daysInMonth(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]), 0).getDate();
}

/** Every local YYYY-MM-DD of the month, in order. */
export function monthDays(month: string): string[] {
  const n = daysInMonth(month);
  return Array.from({ length: n }, (_, i) => `${month}-${pad2(i + 1)}`);
}

export function prevMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 1 ? `${y - 1}-12` : `${y}-${pad2(mo - 1)}`;
}

export const GEST_BANDS: { label: string; test: (weeks: number) => boolean }[] = [
  { label: "Extremely preterm (<28 wk)", test: (w) => w < 28 },
  { label: "Very preterm (28–31 wk)", test: (w) => w >= 28 && w < 32 },
  { label: "Moderate–late preterm (32–36 wk)", test: (w) => w >= 32 && w < 37 },
  { label: "Term (≥37 wk)", test: (w) => w >= 37 },
];

export const WEIGHT_BANDS: { label: string; test: (g: number) => boolean }[] = [
  { label: "ELBW (<750 g)", test: (g) => g < 750 },
  { label: "VLBW (750–999 g)", test: (g) => g >= 750 && g < 1000 },
  { label: "LBW (1000–1499 g)", test: (g) => g >= 1000 && g < 1500 },
  { label: "1500–2499 g", test: (g) => g >= 1500 && g < 2500 },
  { label: "≥2500 g", test: (g) => g >= 2500 },
];

export function gestBand(weeks: number): string {
  return GEST_BANDS.find((b) => b.test(weeks))?.label ?? "";
}

export function birthWeightBand(grams: number): string {
  return WEIGHT_BANDS.find((b) => b.test(grams))?.label ?? "";
}

/** A patient left the unit (any outcome). */
export function hasLeft(b: StatBaby): boolean {
  return b.status === "discharged" || b.status === "transferred" || b.status === "death";
}

/** The day a baby was admitted (chart created), locally. */
export function admissionDay(b: StatBaby): string {
  return b.createdAt ? dayKey(b.createdAt) : "";
}

function tally(rows: string[]): CountRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r) continue;
    map.set(r, (map.get(r) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

function bandTally(bands: { label: string; test: (v: number) => boolean }[], values: number[]): CountRow[] {
  return bands.map((b) => ({ label: b.label, n: values.filter((v) => b.test(v)).length }));
}

/** An event-log entry counts when any of its fields were filled in. */
function logged(log: StatBaby["clinical"], key: string): boolean {
  const e = log?.eventLog?.[key];
  if (!e) return false;
  return Boolean(e.date || e.result || e.starting || e.ending || e.notes);
}

export type MonthStats = {
  month: string;
  unit: string;
  /** Babies admitted this month — the cohort most parameters describe. */
  cohort: StatBaby[];
  admissions: number;
  admissionsByDay: { day: string; n: number }[];
  admissionsByUnit: CountRow[];
  /** Departures that happened inside the month, whenever admitted. */
  departures: { discharged: number; transferred: number; death: number; total: number };
  /** The actual rows that left this month — for registers and exports. */
  departureRows: StatBaby[];
  /** Occupancy across the month. */
  census: { day: string; n: number }[];
  patientDays: number;
  avgDailyCensus: number;
  peakCensus: number;
  endOfPeriodCensus: number;
  censusByUnit: CountRow[];
  /** Cohort demographics. */
  sex: CountRow[];
  place: CountRow[];
  gestBands: CountRow[];
  weightBands: CountRow[];
  deliveryModes: CountRow[];
  acuity: CountRow[];
  insurance: CountRow[];
  consultants: CountRow[];
  apgar5Below7: number;
  /** Cohort interventions (event log / prescription). */
  interventions: CountRow[];
  /** Feeding milestones & screening from the event log of the cohort. */
  milestones: CountRow[];
  screens: CountRow[];
  /** Cohort growth & nutrition. */
  growth: {
    withWeights: number;
    avgMaxLossPct: number | null;
    avgRegainDay: number | null;
    avgVelocity: number | null;
    avgFluidsMlKgDay: number | null;
    humanMilkPct: number | null;
  };
  /** Cohort outcomes — overall progress. */
  outcomes: {
    active: number;
    discharged: number;
    transferred: number;
    death: number;
    mortalityPct: number | null;
    survivalToDischargePct: number | null;
    avgLosDays: number | null;
    avgDischargeWeightG: number | null;
  };
  /** Same key figures for the previous month, for the delta. */
  prev: {
    month: string;
    admissions: number;
    departures: number;
    deaths: number;
    patientDays: number;
    avgDailyCensus: number;
  } | null;
  /* ------------------------- deeper blocks (4.0) ------------------------ */
  /** Observations recorded in the month window, with safety-flag counts. */
  vitals: {
    observations: number;
    babies: number;
    hr: Range;
    rr: Range;
    spo2: Range;
    temp: Range;
    fever: number;
    hypothermia: number;
    hypoglycemia: number;
    desaturations: number;
    avgUrine: number | null;
  };
  problems: {
    newCount: number;
    active: number;
    resolved: number;
    top: CountRow[];
    bySystem: CountRow[];
  };
  /** Admissions vs departures on each day, for the flow chart. */
  flowByDay: { day: string; admissions: number; departures: number }[];
  /** Deaths and length of stay split by gestational-age and weight band. */
  mortalityByGa: { label: string; admitted: number; deaths: number }[];
  mortalityByWeight: { label: string; admitted: number; deaths: number }[];
  losByGa: { label: string; discharged: number; avgLos: number | null }[];
  losByWeight: { label: string; discharged: number; avgLos: number | null }[];
  bloodGroups: CountRow[];
  respiratoryModes: CountRow[];
  lines: CountRow[];
  drugs: { babiesOnDrugs: number; top: CountRow[] };
  /** Weight-velocity categories among babies with growth series. */
  growthCategories: CountRow[];
  /** Ward activity: handovers and tasks in the month window. */
  activity: { handovers: number; acknowledged: number; tasksCreated: number; tasksDone: number };
  meanBirthLength: number | null;
  meanBirthHc: number | null;
  apgar1Below7: number;
  avgGir: number | null;
  avgKcal: number | null;
  tpnBabies: number;
};

export type Range = { avg: number | null; min: number | null; max: number | null };

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Everything needed for one month's report. `unit` is a unit key or "all".
 * `today` is injectable so tests (and month-end reports run a day early or
 * late) compute against a fixed date.
 */
export function computeMonthStats(
  rows: StatBaby[],
  month: string,
  unit: string,
  today: Date = new Date(),
  extras: MonthExtras = {},
): MonthStats {
  const live = rows.filter((b) => b.status !== "deleted" && (unit === "all" || b.unit === unit));
  const cohort = live.filter((b) => admissionDay(b) && monthOf(b.createdAt) === month);

  const days = monthDays(month);
  const todayDay = dayKey(today);
  // Days elapsed in the period: the whole month once it is past, otherwise up to today.
  const elapsedDays = days.filter((d) => d <= todayDay).length;

  /* ------------------------------ census -------------------------------- */
  const census = days.map((day) => {
    const n = live.filter((b) => {
      const inDay = admissionDay(b) && admissionDay(b) <= day;
      if (!inDay) return false;
      if (!hasLeft(b)) return true;
      const left = dischargeDay(b);
      return left ? left > day : true; // undated departures stay on the count
    }).length;
    return { day, n };
  });
  const countedCensus = census.slice(0, Math.max(elapsedDays, 0));
  const patientDays = countedCensus.reduce((sum, c) => sum + c.n, 0);
  const avgDailyCensus = elapsedDays > 0 ? r1(patientDays / elapsedDays) : 0;
  const peakCensus = countedCensus.reduce((m, c) => Math.max(m, c.n), 0);
  const endOfPeriodCensus = countedCensus.length ? countedCensus[countedCensus.length - 1].n : 0;

  /* --------------------------- flow of the month ------------------------- */
  const leftInMonth = live.filter((b) => hasLeft(b) && monthOf(`${dischargeDay(b)}T00:00:00`) === month && dischargeDay(b));
  const departures = {
    discharged: leftInMonth.filter((b) => b.status === "discharged").length,
    transferred: leftInMonth.filter((b) => b.status === "transferred").length,
    death: leftInMonth.filter((b) => b.status === "death").length,
    total: leftInMonth.length,
  };

  const admissionsByDay = days.map((day) => ({ day, n: cohort.filter((b) => admissionDay(b) === day).length }));
  const admissionsByUnit =
    unit === "all" ? tally(cohort.map((b) => (b.unit ?? "").toUpperCase())) : [];

  /* ------------------------------ demographics -------------------------- */
  const sex = tally(cohort.map((b) => (b.sex === "Female" ? "Female" : "Male")));
  const place = tally(cohort.map((b) => (b.inborn ? "Inborn" : "Outborn")));
  const gestBands = bandTally(GEST_BANDS, cohort.map((b) => b.gestWeeks + (b.gestDays ?? 0) / 7));
  const weightBands = bandTally(WEIGHT_BANDS, cohort.map((b) => b.birthWeight));
  const deliveryModes = tally(cohort.map((b) => b.deliveryMode || "Unknown"));
  const acuity = tally(cohort.map((b) => b.acuity || "unknown"));
  const insurance = tally(
    cohort.map((b) => {
      const k = (b.insurance ?? "").toLowerCase();
      return k === "cash" ? "Cash" : k === "insurance" ? "Insurance" : k === "scheme" ? "Scheme" : "Not captured";
    }),
  );
  const consultants = tally(cohort.map((b) => b.consultant || "Not assigned"));
  const apgar5Below7 = cohort.filter((b) => typeof b.apgar5 === "number" && b.apgar5 < 7).length;

  /* ----------------------------- interventions -------------------------- */
  const respMode = (b: StatBaby) => (b.clinical?.resp?.mode ?? "").toLowerCase();
  const lines = (b: StatBaby) => (b.clinical?.lines ?? []).map((l) => (l.name ?? "").toLowerCase());
  const interventionDefs: { label: string; hit: (b: StatBaby) => boolean }[] = [
    { label: "Mechanical ventilation", hit: (b) => logged(b.clinical, "VENTILATION") || /ventilat|sippv|simv|cmv/.test(respMode(b)) },
    { label: "CPAP", hit: (b) => logged(b.clinical, "CPAP") || /cpap|bubble/.test(respMode(b)) },
    { label: "Nasal HFNC / flow", hit: (b) => logged(b.clinical, "NASAL_FLOW") || /hfnc|high flow|nasal/.test(respMode(b)) },
    { label: "Surfactant", hit: (b) => logged(b.clinical, "SURFACTANT") },
    { label: "Caffeine", hit: (b) => logged(b.clinical, "CAFFEINE") },
    { label: "Phototherapy", hit: (b) => logged(b.clinical, "PHOTOTHERAPY") },
    { label: "UVC", hit: (b) => logged(b.clinical, "UVC") || lines(b).some((l) => l.includes("uvc")) },
    { label: "PICC / central line", hit: (b) => logged(b.clinical, "PICC") || lines(b).some((l) => l.includes("picc") || l.includes("central")) },
    { label: "Blood culture sent", hit: (b) => logged(b.clinical, "BLOOD_CULTURE_1") || logged(b.clinical, "BLOOD_CULTURE_2") },
    { label: "Antibiotics", hit: (b) => logged(b.clinical, "ANTIBIOTICS_1") || logged(b.clinical, "ANTIBIOTICS_2") || (b.clinical?.drugs ?? []).length > 0 },
    { label: "NS bolus", hit: (b) => logged(b.clinical, "NS_BOLUSES") },
    { label: "NEC", hit: (b) => logged(b.clinical, "NEC") },
  ];
  const interventions = interventionDefs.map((d) => ({ label: d.label, n: cohort.filter(d.hit).length }));
  const milestoneDefs = [
    { label: "First feed", keys: ["FIRST_FEED"] },
    { label: "Full feeds", keys: ["FULL_FEED"] },
    { label: "HMF (max strength)", keys: ["HMF"] },
    { label: "PO feeds", keys: ["PO_FEEDS"] },
    { label: "DBF (direct breast feed)", keys: ["DBF"] },
    { label: "Adverse event recorded", keys: ["EVENT"] },
  ];
  const milestones = milestoneDefs.map((d) => ({
    label: d.label,
    n: cohort.filter((b) => d.keys.some((k) => logged(b.clinical, k))).length,
  }));
  const screenDefs = [
    { label: "Cranial ultrasound (CUS 1–3)", keys: ["CUS1", "CUS2", "CUS3"] },
    { label: "Echocardiogram (Echo 1–2)", keys: ["ECHO1", "ECHO2"] },
    { label: "ROP screen (1–2)", keys: ["ROP1", "ROP2"] },
  ];
  const screens = screenDefs.map((d) => ({
    label: d.label,
    n: cohort.filter((b) => d.keys.some((k) => logged(b.clinical, k))).length,
  }));

  /* ---------------------------- growth & feeds --------------------------- */
  const growthRows = cohort
    .map((b) => ({ b, growth: [...(b.clinical?.growth ?? [])].sort((x, y) => +new Date(x.at) - +new Date(y.at)) }))
    .filter((x) => x.growth.length >= 2 && x.b.birthWeight > 0);
  const maxLoss = growthRows.map(({ b, growth }) => {
    const worst = growth.reduce((w, g) => Math.min(w, g.weight), b.birthWeight);
    return ((b.birthWeight - worst) / b.birthWeight) * 100;
  });
  const regainDays = growthRows
    .map(({ b, growth }) => {
      const back = growth.find((g) => g.weight >= b.birthWeight);
      if (!back || !b.dob) return null;
      const start = +new Date(b.dob);
      const at = +new Date(back.at);
      return Number.isFinite(start) && Number.isFinite(at) && at >= start ? Math.floor((at - start) / 86400000) : null;
    })
    .filter((x): x is number => x !== null);
  const velocities = growthRows
    .map(({ growth }) => {
      const first = growth[0];
      const last = growth[growth.length - 1];
      const days = (+new Date(last.at) - +new Date(first.at)) / 86400000;
      return gainGPerKgDay(first.weight, last.weight, days);
    })
    .filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  const stillIn = cohort.filter((b) => b.status === "active");
  const fluidVals = stillIn.map((b) => b.clinical?.fluids?.totalMlKgDay).filter((x): x is number => typeof x === "number" && x > 0);
  const milkFed = stillIn.filter((b) => /ebm|breast|donor|human/i.test(b.clinical?.fluids?.feedType ?? ""));

  const growth = {
    withWeights: growthRows.length,
    avgMaxLossPct: avg(maxLoss),
    avgRegainDay: avg(regainDays),
    avgVelocity: avg(velocities),
    avgFluidsMlKgDay: avg(fluidVals),
    humanMilkPct: stillIn.length ? Math.round((milkFed.length / stillIn.length) * 100) : null,
  };

  /* ------------------------------- outcomes ------------------------------ */
  const outcomeCount = (s: string) => cohort.filter((b) => b.status === s).length;
  const discharged = outcomeCount("discharged");
  const death = outcomeCount("death");
  const transferred = outcomeCount("transferred");
  const active = outcomeCount("active");
  const losVals = cohort.filter(hasLeft).map((b) => lengthOfStayDays(b)).filter((x): x is number => x !== null);
  const dischargeWeights = cohort
    .filter((b) => b.status === "discharged")
    .map((b) => dischargeOf(b)?.weightAtDischarge ?? b.currentWeight)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const outcomes = {
    active,
    discharged,
    transferred,
    death,
    mortalityPct: discharged + death > 0 ? Math.round((death / (discharged + death)) * 1000) / 10 : null,
    survivalToDischargePct: discharged + death > 0 ? Math.round((discharged / (discharged + death)) * 1000) / 10 : null,
    avgLosDays: avg(losVals),
    avgDischargeWeightG: dischargeWeights.length ? Math.round(dischargeWeights.reduce((a, b) => a + b, 0) / dischargeWeights.length) : null,
  };

  /* ------------------------------- previous ------------------------------ */
  const pm = prevMonth(month);
  let prev: MonthStats["prev"] = null;
  if (pm && /^(\d{4})-(\d{2})$/.test(pm)) {
    const prevCohort = live.filter((b) => admissionDay(b) && monthOf(b.createdAt) === pm);
    const prevLeft = live.filter((b) => hasLeft(b) && dischargeDay(b) && monthOf(`${dischargeDay(b)}T00:00:00`) === pm);
    const prevDays = monthDays(pm).filter((d) => d <= todayDay);
    const prevPatientDays = prevDays.reduce(
      (sum, day) =>
        sum +
        live.filter((b) => {
          if (!admissionDay(b) || admissionDay(b) > day) return false;
          if (!hasLeft(b)) return true;
          const left = dischargeDay(b);
          return left ? left > day : true;
        }).length,
      0,
    );
    prev = {
      month: pm,
      admissions: prevCohort.length,
      departures: prevLeft.length,
      deaths: prevLeft.filter((b) => b.status === "death").length,
      patientDays: prevPatientDays,
      avgDailyCensus: prevDays.length ? r1(prevPatientDays / prevDays.length) : 0,
    };
  }

  /* ------------------------- deeper blocks (4.0) ------------------------ */
  const inWindow = (iso: string | Date) => {
    const d = dayKey(iso);
    return d !== "" && monthOf(iso) === month && d <= todayDay;
  };
  const rangeOf = (vals: number[]): Range => ({
    avg: vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
  });
  const liveIds = new Set(live.map((b) => b.id));

  const obs = (extras.vitals ?? []).filter((v) => liveIds.has(v.babyId) && inWindow(v.recordedAt));
  const nums = (pick: (v: StatVital) => number | null | undefined) =>
    obs.map(pick).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const vitalsBlock = {
    observations: obs.length,
    babies: new Set(obs.map((v) => v.babyId)).size,
    hr: rangeOf(nums((v) => v.hr)),
    rr: rangeOf(nums((v) => v.rr)),
    spo2: rangeOf(nums((v) => v.spo2)),
    temp: rangeOf(nums((v) => v.temp)),
    fever: nums((v) => v.temp).filter((t) => t >= 38).length,
    hypothermia: nums((v) => v.temp).filter((t) => t < 36).length,
    hypoglycemia: nums((v) => v.rbs).filter((r) => r < 47).length,
    desaturations: nums((v) => v.spo2).filter((s) => s < 90).length,
    avgUrine: avg(nums((v) => v.urineMlKgHr)),
  };

  const probs = (extras.problems ?? []).filter((p) => liveIds.has(p.babyId));
  const newProblems = probs.filter((p) => inWindow(p.onsetAt));
  const problemsBlock = {
    newCount: newProblems.length,
    active: probs.filter((p) => p.status !== "resolved").length,
    resolved: probs.filter((p) => p.status === "resolved" && p.resolvedAt && inWindow(p.resolvedAt)).length,
    top: tally(newProblems.map((p) => p.label)).slice(0, 8),
    bySystem: tally(newProblems.map((p) => p.system || "Other")),
  };

  const flowByDay = days.map((day) => ({
    day,
    admissions: cohort.filter((b) => admissionDay(b) === day).length,
    departures: leftInMonth.filter((b) => dischargeDay(b) === day).length,
  }));

  const gaOf = (b: StatBaby) => b.gestWeeks + (b.gestDays ?? 0) / 7;
  const losOf = (b: StatBaby) => lengthOfStayDays(b);
  const bandOutcome = (bands: { label: string; test: (v: number) => boolean }[], value: (b: StatBaby) => number) =>
    bands.map((band) => {
      const inside = cohort.filter((b) => band.test(value(b)));
      return {
        label: band.label,
        admitted: inside.length,
        deaths: inside.filter((b) => b.status === "death").length,
        discharged: inside.filter(hasLeft).length,
        losVals: inside.filter(hasLeft).map(losOf).filter((x): x is number => x !== null),
      };
    });
  const gaOutcome = bandOutcome(GEST_BANDS, gaOf);
  const wtOutcome = bandOutcome(WEIGHT_BANDS, (b) => b.birthWeight);
  const mortalityByGa = gaOutcome.map(({ label, admitted, deaths }) => ({ label, admitted, deaths }));
  const mortalityByWeight = wtOutcome.map(({ label, admitted, deaths }) => ({ label, admitted, deaths }));
  const losByGa = gaOutcome.map(({ label, discharged, losVals }) => ({ label, discharged, avgLos: avg(losVals) }));
  const losByWeight = wtOutcome.map(({ label, discharged, losVals }) => ({ label, discharged, avgLos: avg(losVals) }));

  const bloodGroups = tally(cohort.map((b) => b.bloodGroup || "Unknown"));
  const respiratoryModes = tally(
    stillIn.map((b) => (b.clinical?.resp?.mode ?? "").trim() || "Room air / none"),
  );
  const lineNames = tally(
    cohort.flatMap((b) => (b.clinical?.lines ?? []).map((l) => (l.name ?? "").toUpperCase().trim())).filter(Boolean),
  );
  const drugNames = cohort.flatMap((b) => (b.clinical?.drugs ?? []).map((d) => (d.name ?? "").trim())).filter(Boolean);
  const drugsBlock = {
    babiesOnDrugs: cohort.filter((b) => (b.clinical?.drugs ?? []).length > 0).length,
    top: tally(drugNames).slice(0, 10),
  };
  const growthCategories = [
    { label: "Slow (<12 g/kg/day)", n: velocities.filter((v) => v < 12).length },
    { label: "Expected (12–20 g/kg/day)", n: velocities.filter((v) => v >= 12 && v <= 20).length },
    { label: "Fast (>20 g/kg/day)", n: velocities.filter((v) => v > 20).length },
  ];

  const handovers = (extras.handovers ?? []).filter((h) => liveIds.has(h.babyId) && inWindow(h.createdAt));
  const tasks = (extras.tasks ?? []).filter((t) => liveIds.has(t.babyId) && inWindow(t.createdAt));
  const activity = {
    handovers: handovers.length,
    acknowledged: handovers.filter((h) => (h.acknowledgedBy ?? "").trim() !== "").length,
    tasksCreated: tasks.length,
    tasksDone: tasks.filter((t) => t.done).length,
  };

  const positiveVals = (pick: (b: StatBaby) => number | undefined) =>
    cohort.map(pick).filter((x): x is number => typeof x === "number" && x > 0);
  const meanBirthLength = avg(positiveVals((b) => b.birthLength));
  const meanBirthHc = avg(positiveVals((b) => b.birthHc));
  const apgar1Below7 = cohort.filter((b) => typeof b.apgar1 === "number" && b.apgar1 < 7).length;
  const avgGir = avg(stillIn.map((b) => b.clinical?.fluids?.gir).filter((x): x is number => typeof x === "number" && x > 0));
  const avgKcal = avg(stillIn.map((b) => b.clinical?.fluids?.kcal).filter((x): x is number => typeof x === "number" && x > 0));
  const tpnBabies = stillIn.filter((b) => b.clinical?.fluids?.tpn === true).length;

  return {
    month,
    unit,
    cohort,
    admissions: cohort.length,
    admissionsByDay,
    admissionsByUnit,
    departures,
    departureRows: leftInMonth,
    census,
    patientDays,
    avgDailyCensus,
    peakCensus,
    endOfPeriodCensus,
    censusByUnit:
      unit === "all"
        ? tally(live.filter((b) => b.status === "active" && admissionDay(b) <= todayDay).map((b) => (b.unit ?? "").toUpperCase()))
        : [],
    sex,
    place,
    gestBands,
    weightBands,
    deliveryModes,
    acuity,
    insurance,
    consultants,
    apgar5Below7,
    interventions,
    milestones,
    screens,
    growth,
    outcomes,
    prev,
    vitals: vitalsBlock,
    problems: problemsBlock,
    flowByDay,
    mortalityByGa,
    mortalityByWeight,
    losByGa,
    losByWeight,
    bloodGroups,
    respiratoryModes,
    lines: lineNames,
    drugs: drugsBlock,
    growthCategories,
    activity,
    meanBirthLength,
    meanBirthHc,
    apgar1Below7,
    avgGir,
    avgKcal,
    tpnBabies,
  };
}
