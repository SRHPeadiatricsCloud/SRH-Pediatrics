/**
 * Level III-B NICU analytics engine.
 *
 * One pure function — `computeAnalytics` — turns the raw store (babies,
 * observations, problems) into the full quality-improvement report rendered
 * by the Analytics page: data-quality scorecard, activity, case mix,
 * mortality with timing and cause grouping, CRIB-II risk adjustment, every
 * morbidity domain the chart can support, LOS, discharge, monthly trends,
 * the quality-indicator dashboard, Pareto and subgroup views.
 *
 * Rules baked into the engine:
 *  - nothing is invented: a field never recorded produces "not captured"
 *    coverage figures, never a fabricated value;
 *  - every rate carries its numerator and denominator;
 *  - local calendar dates throughout, matching the rest of the app.
 */
import { lengthOfStayDays, dischargeDay, dischargeOf } from "./discharge";
import { gainGPerKgDay } from "./clinical";
import {
  GA_BANDS_FINE,
  BW_BANDS_FINE,
  QI_REFERENCES,
  bwBandFine,
  crib2,
  gaBandFine,
  ropEligible,
  sizeForGA,
  type QiCapture,
} from "./qi";
import { dayKey, hasLeft, monthOf, type StatBaby, type StatProblem, type StatVital } from "./stats";

export type AnalyticsBaby = Omit<StatBaby, "clinical"> & {
  clinical?: (NonNullable<StatBaby["clinical"]> & { qi?: QiCapture }) | null;
};

export type CountRow = { label: string; n: number };
export type Rate = { n: number; denom: number; pct: number | null };

const pct = (n: number, denom: number): Rate => ({ n, denom, pct: denom > 0 ? Math.round((n / denom) * 1000) / 10 : null });
const r1 = (v: number) => Math.round(v * 10) / 10;

function tally(rows: string[]): CountRow[] {
  const map = new Map<string, number>();
  for (const r of rows) if (r) map.set(r, (map.get(r) ?? 0) + 1);
  return [...map.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : r1((s[m - 1] + s[m]) / 2);
}

function iqr(xs: number[]): [number, number] | null {
  if (xs.length < 4) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return [r1(q(0.25)), r1(q(0.75))];
}

const qiOf = (b: AnalyticsBaby): QiCapture => b.clinical?.qi ?? {};
const logged = (b: AnalyticsBaby, key: string): boolean => {
  const e = b.clinical?.eventLog?.[key];
  if (!e) return false;
  return Boolean(e.date || e.result || e.starting || e.ending || e.notes);
};

export const DEATH_CAUSE_RULES: { label: string; test: (text: string) => boolean }[] = [
  { label: "Extreme prematurity", test: (t) => /extreme prematur|periviab|<\s?24/.test(t) },
  { label: "Respiratory failure / RDS", test: (t) => /rds|respiratory (failure|distress)|hyaline|pulmonary/.test(t) },
  { label: "Sepsis", test: (t) => /sepsis|septicaemia|septicemia|infection/.test(t) },
  { label: "NEC", test: (t) => /nec|necrotis|necrotiz/.test(t) },
  { label: "Severe IVH", test: (t) => /ivh|intraventricular|periventricular/.test(t) },
  { label: "PPHN", test: (t) => /pphn|persistent pulmonary hypertension/.test(t) },
  { label: "Congenital anomaly", test: (t) => /anomal|malformation|congenital/.test(t) },
  { label: "Birth asphyxia / HIE", test: (t) => /asphyxia|hypoxic|ischemic|hie|encephalopath/.test(t) },
  { label: "Pulmonary haemorrhage", test: (t) => /pulmonary (haem|hem)orrhage/.test(t) },
  { label: "Shock", test: (t) => /shock/.test(t) },
];

export type AnalyticsReport = ReturnType<typeof computeAnalytics>;

/**
 * Everything the Analytics page renders. `today` is injectable for tests.
 */
export function computeAnalytics(rows: AnalyticsBaby[], vitals: StatVital[], problems: StatProblem[], today: Date = new Date()) {
  const live = rows.filter((b) => b.status !== "deleted");
  const todayDay = dayKey(today);
  const cohort = live; // analytics describes everyone the unit admitted

  /* ----------------------------- data quality ---------------------------- */
  const missing = (f: (b: AnalyticsBaby) => unknown) => cohort.filter((b) => !f(b)).length;
  const implausible: string[] = [];
  const flag = (cond: boolean, msg: string) => {
    if (cond) implausible.push(msg);
  };
  for (const b of cohort) {
    flag(b.gestWeeks < 22 || b.gestWeeks > 44, `${b.uhid}: gestation ${b.gestWeeks} wk outside 22–44`);
    flag(b.birthWeight > 0 && (b.birthWeight < 300 || b.birthWeight > 6000), `${b.uhid}: birth weight ${b.birthWeight} g implausible`);
    flag(typeof b.apgar5 === "number" && b.apgar5 > 10, `${b.uhid}: Apgar ${b.apgar5} > 10`);
    const left = dischargeDay(b);
    flag(!!left && admissionDayKey(b) > left, `${b.uhid}: discharge ${left} before admission ${admissionDayKey(b)}`);
    flag(b.status === "death" && !dischargeOf(b), `${b.uhid}: status death without a discharge record`);
  }
  for (const v of vitals) {
    flag(typeof v.temp === "number" && (v.temp < 30 || v.temp > 43), `Observation: temperature ${v.temp} °C implausible`);
  }
  const vitalRows = vitals.length;
  const dataQuality = {
    records: cohort.length,
    duplicates: cohort.length - new Set(cohort.map((b) => b.uhid)).size,
    implausible: implausible.slice(0, 50),
    missing: {
      gestation: missing((b) => b.gestWeeks > 0),
      birthWeight: missing((b) => b.birthWeight > 0),
      sex: missing((b) => b.sex),
      apgar5: missing((b) => typeof b.apgar5 === "number"),
      consultant: missing((b) => b.consultant),
      insurance: missing((b) => b.insurance),
      bloodGroup: missing((b) => b.bloodGroup && b.bloodGroup !== "Unknown"),
      dob: missing((b) => b.dob),
      antenatalSteroids: missing((b) => qiOf(b).antenatal?.steroids),
      admissionTemp: missing((b) => qiOf(b).admission?.tempC),
      baseExcess: missing((b) => qiOf(b).admission?.baseExcess),
      dischargeWeight: live.filter(hasLeft).filter((b) => b.status === "discharged" && !(dischargeOf(b)?.weightAtDischarge || b.currentWeight)).length,
    },
    observations: vitalRows,
    problems: problems.length,
    score: Math.max(0, 100 - Math.round((implausible.length * 5 + Object.values({}).length) / Math.max(1, cohort.length))),
  };

  /* ------------------------------- activity ------------------------------ */
  const monthsSeen = [...new Set(cohort.map((b) => monthOf(b.createdAt)).filter(Boolean))].sort();
  const byMonth = monthsSeen.map((m) => ({ month: m, admissions: cohort.filter((b) => monthOf(b.createdAt) === m).length }));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDayOfWeek = dow.map((d, i) => ({
    label: d,
    n: cohort.filter((b) => {
      const t = new Date(b.createdAt).getTime();
      return Number.isFinite(t) && new Date(t).getDay() === i;
    }).length,
  }));
  const activity = {
    total: cohort.length,
    months: byMonth,
    perMonth: byMonth.length ? r1(cohort.length / byMonth.length) : 0,
    inborn: pct(cohort.filter((b) => b.inborn).length, cohort.length),
    outborn: pct(cohort.filter((b) => !b.inborn).length, cohort.length),
    transfersOut: cohort.filter((b) => b.status === "transferred").length,
    emergencyProxy: pct(cohort.filter((b) => b.acuity === "critical" || b.acuity === "guarded").length, cohort.length),
    byDayOfWeek,
    byUnit: tally(cohort.map((b) => (b.unit ?? "").toUpperCase())),
  };

  /* ------------------------------- case mix ------------------------------ */
  const gaRows = GA_BANDS_FINE.map((label) => ({ label, n: cohort.filter((b) => gaBandFine(b.gestWeeks, b.gestDays) === label).length }));
  const bwRows = BW_BANDS_FINE.map((label) => ({ label, n: cohort.filter((b) => bwBandFine(b.birthWeight) === label).length }));
  const sgaRows = tally(
    cohort.map((b) => sizeForGA(b.birthWeight, b.gestWeeks, b.gestDays, b.sex) ?? "Not classified").filter(Boolean),
  );
  const caseMix = {
    gaBands: gaRows,
    bwBands: bwRows,
    sizeForGa: sgaRows,
    elbw: cohort.filter((b) => b.birthWeight < 1000).length,
    vlbw: cohort.filter((b) => b.birthWeight < 1500).length,
    lbw: cohort.filter((b) => b.birthWeight < 2500).length,
    sex: tally(cohort.map((b) => (b.sex === "Female" ? "Female" : "Male"))),
    delivery: tally(cohort.map((b) => b.deliveryMode || "Unknown")),
    acuity: tally(cohort.map((b) => b.acuity || "unknown")),
    bloodGroups: tally(cohort.map((b) => b.bloodGroup || "Unknown")),
    congenitalAnomalies: cohort.filter((b) => qiOf(b).antenatal?.congenitalAnomaly).length,
    steroids: tally(cohort.map((b) => qiOf(b).antenatal?.steroids ?? "Not recorded")),
    meanGestation: cohort.length ? r1(cohort.reduce((a, b) => a + b.gestWeeks + (b.gestDays ?? 0) / 7, 0) / cohort.length) : null,
    meanBirthWeight: cohort.length ? Math.round(cohort.reduce((a, b) => a + b.birthWeight, 0) / cohort.length) : null,
  };

  /* ------------------------------- mortality ----------------------------- */
  const deaths = cohort.filter((b) => b.status === "death");
  const admitted = cohort.length;
  const timingOf = (b: AnalyticsBaby): string => {
    const at = dischargeOf(b)?.at;
    if (!at || !b.createdAt) return "Unknown";
    const hrs = (+new Date(at) - +new Date(b.createdAt)) / 3_600_000;
    if (!Number.isFinite(hrs) || hrs < 0) return "Unknown";
    if (hrs < 24) return "<24 h";
    if (hrs < 48) return "24–48 h";
    if (hrs < 24 * 7) return "2–7 days";
    return ">7 days";
  };
  const problemsOf = (babyId: number) => problems.filter((p) => p.babyId === babyId);
  const causeOf = (b: AnalyticsBaby): string => {
    const text = [
      dischargeOf(b)?.summary ?? "",
      ...problemsOf(b.id).map((p) => `${p.system} ${p.label} ${"detail" in p ? (p as StatProblem & { detail?: string }).detail ?? "" : ""}`),
    ]
      .join(" ")
      .toLowerCase();
    if (!text.trim()) return "Not documented";
    return DEATH_CAUSE_RULES.find((r) => r.test(text))?.label ?? "Other / not classifiable";
  };
  const mortalityByGa = GA_BANDS_FINE.map((label) => {
    const inside = cohort.filter((b) => gaBandFine(b.gestWeeks, b.gestDays) === label);
    return { label, admitted: inside.length, deaths: inside.filter((b) => b.status === "death").length };
  });
  const mortalityByBw = BW_BANDS_FINE.map((label) => {
    const inside = cohort.filter((b) => bwBandFine(b.birthWeight) === label);
    return { label, admitted: inside.length, deaths: inside.filter((b) => b.status === "death").length };
  });
  const mortality = {
    deaths: deaths.length,
    rate: pct(deaths.length, admitted),
    survival: pct(cohort.filter((b) => b.status !== "death").length, admitted),
    byTiming: tally(deaths.map(timingOf)),
    byCause: tally(deaths.map(causeOf)),
    byGa: mortalityByGa,
    byBw: mortalityByBw,
    bySex: ["Male", "Female"].map((label) => {
      const inside = cohort.filter((b) => b.sex === label);
      return { label, admitted: inside.length, deaths: inside.filter((b) => b.status === "death").length };
    }),
    byPlace: ["Inborn", "Outborn"].map((label) => {
      const inside = cohort.filter((b) => (label === "Inborn") === b.inborn);
      return { label, admitted: inside.length, deaths: inside.filter((b) => b.status === "death").length };
    }),
    monthly: monthsSeen.map((m) => ({
      month: m,
      admissions: cohort.filter((b) => monthOf(b.createdAt) === m).length,
      deaths: deaths.filter((b) => monthOf(b.createdAt) === m).length,
    })),
    register: deaths.map((b) => ({
      uhid: b.uhid,
      ga: `${b.gestWeeks}+${b.gestDays ?? 0}`,
      bw: b.birthWeight,
      timing: timingOf(b),
      cause: causeOf(b),
      inborn: b.inborn,
    })),
  };

  /* -------------------------------- CRIB-II ------------------------------ */
  const crib2Scored = cohort.map((b) => ({
    b,
    score: crib2({
      sex: b.sex,
      gestWeeks: b.gestWeeks,
      birthWeightG: b.birthWeight,
      tempC: qiOf(b).admission?.tempC,
      baseExcess: qiOf(b).admission?.baseExcess,
    }),
  }));
  const complete = crib2Scored.filter((x) => x.score.complete);
  const crib2Report = {
    coverage: pct(complete.length, cohort.length),
    levels: (["I", "II", "III", "IV"] as const).map((level) => {
      const inside = complete.filter((x) => x.score.level === level);
      return {
        level,
        n: inside.length,
        deaths: inside.filter((x) => x.b.status === "death").length,
        mortalityPct: inside.length ? Math.round((inside.filter((x) => x.b.status === "death").length / inside.length) * 1000) / 10 : null,
      };
    }),
    note:
      "Expected mortality needs the published CRIB-II calibration curve, which is not bundled; observed mortality by level is shown instead. Scores without a recorded admission temperature or base excess are excluded — never estimated.",
  };

  /* ------------------------------ respiratory ---------------------------- */
  const respMode = (b: AnalyticsBaby) => (b.clinical?.resp?.mode ?? "").toLowerCase();
  const vented = cohort.filter((b) => logged(b, "VENTILATION") || /ventilat|sippv|simv|cmv/.test(respMode(b)));
  const onCpap = cohort.filter((b) => logged(b, "CPAP") || /cpap|bubble/.test(respMode(b)));
  const onHfnc = cohort.filter((b) => logged(b, "NASAL_FLOW") || /hfnc|high flow|nasal/.test(respMode(b)));
  const surfactant = cohort.filter((b) => logged(b, "SURFACTANT"));
  const caffeine = cohort.filter((b) => logged(b, "CAFFEINE"));
  const ventDaysVals = cohort.map((b) => qiOf(b).respiratory?.ventDays).filter((x): x is number => typeof x === "number");
  const bpdDenom = cohort.filter((b) => (b.gestWeeks < 32 || b.birthWeight < 1500) && b.status !== "death");
  const bpdKnown = bpdDenom.filter((b) => qiOf(b).respiratory?.o2At36Pma);
  const bpdCases = bpdKnown.filter((b) => qiOf(b).respiratory?.o2At36Pma !== "none");
  const reintub = cohort.map((b) => qiOf(b).respiratory?.reintubations ?? 0);
  const respiratory = {
    ventilation: pct(vented.length, admitted),
    cpap: pct(onCpap.length, admitted),
    hfnc: pct(onHfnc.length, admitted),
    surfactant: pct(surfactant.length, admitted),
    caffeine: pct(caffeine.length, admitted),
    medianVentDays: median(ventDaysVals),
    ventDaysCoverage: pct(ventDaysVals.length, vented.length),
    reintubations: reintub.reduce((a, b) => a + b, 0),
    bpd: pct(bpdCases.length, bpdKnown.length),
    bpdCoverage: pct(bpdKnown.length, bpdDenom.length),
    bpdBySupport: tally(bpdCases.map((b) => qiOf(b).respiratory?.o2At36Pma ?? "")),
  };

  /* ----------------------------- resuscitation --------------------------- */
  const admissionTemps = new Map<number, number>();
  for (const v of vitals) {
    if (typeof v.temp !== "number") continue;
    const cur = admissionTemps.get(v.babyId);
    if (cur === undefined || +new Date(v.recordedAt) < cur) admissionTemps.set(v.babyId, +new Date(v.recordedAt));
  }
  // keep the earliest temperature value per baby
  const firstTemp = new Map<number, { at: number; t: number }>();
  for (const v of vitals) {
    if (typeof v.temp !== "number") continue;
    const t = +new Date(v.recordedAt);
    const cur = firstTemp.get(v.babyId);
    if (!cur || t < cur.at) firstTemp.set(v.babyId, { at: t, t: v.temp });
  }
  const temps = [...firstTemp.values()].map((x) => x.t);
  const qiTemps = cohort.map((b) => qiOf(b).admission?.tempC).filter((x): x is number => typeof x === "number");
  const allTemps = [...temps, ...qiTemps];
  const resuscitation = {
    normothermia: pct(allTemps.filter((t) => t >= 36.5 && t <= 37.5).length, allTemps.length),
    hypothermia: allTemps.filter((t) => t < 36.5).length,
    hyperthermia: allTemps.filter((t) => t > 37.5).length,
    tempCoverage: pct(allTemps.length, cohort.length),
    ppv: cohort.filter((b) => qiOf(b).admission?.ppv).length,
    drIntubation: cohort.filter((b) => qiOf(b).admission?.deliveryRoomIntubation).length,
    compressions: cohort.filter((b) => qiOf(b).admission?.chestCompressions).length,
    epinephrine: cohort.filter((b) => qiOf(b).admission?.epinephrine).length,
  };
  void admissionTemps;

  /* ------------------------------- infection ----------------------------- */
  const onAntibiotics = cohort.filter(
    (b) => logged(b, "ANTIBIOTICS_1") || logged(b, "ANTIBIOTICS_2") || (b.clinical?.drugs ?? []).length > 0,
  );
  const culturesSent = cohort.filter((b) => logged(b, "BLOOD_CULTURE_1") || logged(b, "BLOOD_CULTURE_2"));
  const culturePositive = cohort.filter((b) => qiOf(b).infection?.culturePositive);
  const eos = cohort.filter((b) => qiOf(b).infection?.eos);
  const los2 = cohort.filter((b) => qiOf(b).infection?.los);
  const clabsiCases = cohort.filter((b) => qiOf(b).infection?.clabsi);
  const abDays = cohort.map((b) => qiOf(b).infection?.antibioticDays).filter((x): x is number => typeof x === "number");
  const lineDaysVals = cohort.map((b) => (qiOf(b).lines?.uvcDays ?? 0) + (qiOf(b).lines?.piccDays ?? 0) + (qiOf(b).lines?.uacDays ?? 0));
  const lineDays = lineDaysVals.reduce((a, b) => a + b, 0);
  const infection = {
    antibioticExposure: pct(onAntibiotics.length, admitted),
    culturesSent: pct(culturesSent.length, admitted),
    culturePositive: culturePositive.length,
    positivity: pct(culturePositive.length, culturesSent.length),
    eos: eos.length,
    los: los2.length,
    clabsi: clabsiCases.length,
    clabsiRate: lineDays > 0 ? r1((clabsiCases.length / lineDays) * 1000) : null,
    lineDays,
    medianAntibioticDays: median(abDays),
    antibioticDaysCoverage: pct(abDays.length, onAntibiotics.length),
    organisms: tally(cohort.map((b) => qiOf(b).infection?.organism ?? "").filter(Boolean)),
    meningitis: cohort.filter((b) => qiOf(b).infection?.meningitis).length,
  };

  /* ------------------------------ NEC & feeding --------------------------- */
  const nec = cohort.filter((b) => logged(b, "NEC"));
  const firstFeedDays = cohort.map((b) => qiOf(b).feeding?.firstFeedDay).filter((x): x is number => typeof x === "number");
  const fullFeedDays = cohort.map((b) => qiOf(b).feeding?.fullFeedDay).filter((x): x is number => typeof x === "number");
  const pnDays = cohort.map((b) => qiOf(b).feeding?.pnDays).filter((x): x is number => typeof x === "number");
  const necFeeding = {
    nec: pct(nec.length, admitted),
    necByGa: GA_BANDS_FINE.map((label) => {
      const inside = cohort.filter((b) => gaBandFine(b.gestWeeks, b.gestDays) === label);
      return { label, admitted: inside.length, nec: inside.filter((b) => logged(b, "NEC")).length };
    }),
    firstFeed: { n: firstFeedDays.length, median: median(firstFeedDays) },
    fullFeed: { n: fullFeedDays.length, median: median(fullFeedDays) },
    pn: { n: pnDays.length, median: median(pnDays) },
    exclusiveHumanMilk: cohort.filter((b) => qiOf(b).feeding?.exclusiveHumanMilk).length,
  };

  /* ------------------------------- nutrition ------------------------------ */
  const growthRows = cohort
    .map((b) => ({ b, growth: [...(b.clinical?.growth ?? [])].sort((x, y) => +new Date(x.at) - +new Date(y.at)) }))
    .filter((x) => x.growth.length >= 2 && x.b.birthWeight > 0);
  const velocities = growthRows
    .map(({ growth }) => {
      const first = growth[0];
      const last = growth[growth.length - 1];
      return gainGPerKgDay(first.weight, last.weight, (+new Date(last.at) - +new Date(first.at)) / 86_400_000);
    })
    .filter((x): x is number => x !== null);
  const maxLoss = growthRows.map(({ b, growth }) => {
    const worst = growth.reduce((w, g) => Math.min(w, g.weight), b.birthWeight);
    return ((b.birthWeight - worst) / b.birthWeight) * 100;
  });
  const regainDays = growthRows
    .map(({ b, growth }) => {
      const back = growth.find((g) => g.weight >= b.birthWeight);
      if (!back || !b.dob) return null;
      const days = (+new Date(back.at) - +new Date(b.dob)) / 86_400_000;
      return days >= 0 ? Math.floor(days) : null;
    })
    .filter((x): x is number => x !== null);
  const stillIn = cohort.filter((b) => b.status === "active");
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const fluidVals = stillIn.map((b) => b.clinical?.fluids?.totalMlKgDay).filter((x): x is number => typeof x === "number" && x > 0);
  const humanMilk = stillIn.filter((b) => /ebm|breast|donor|human/i.test(b.clinical?.fluids?.feedType ?? ""));
  const nutrition = {
    withGrowthCharts: growthRows.length,
    avgMaxLossPct: avg(maxLoss),
    excessiveLoss: maxLoss.filter((l) => l > 10).length,
    avgRegainDay: avg(regainDays),
    avgVelocity: avg(velocities),
    slowVelocity: velocities.filter((v) => v < 12).length,
    avgFluids: avg(fluidVals),
    humanMilkNow: pct(humanMilk.length, stillIn.length),
    tpn: stillIn.filter((b) => b.clinical?.fluids?.tpn).length,
    avgGir: avg(stillIn.map((b) => b.clinical?.fluids?.gir).filter((x): x is number => typeof x === "number" && x > 0)),
    avgKcal: avg(stillIn.map((b) => b.clinical?.fluids?.kcal).filter((x): x is number => typeof x === "number" && x > 0)),
  };

  /* --------------------------------- lines -------------------------------- */
  const lineTally = tally(
    cohort.flatMap((b) => (b.clinical?.lines ?? []).map((l) => (l.name ?? "").toUpperCase().trim())).filter(Boolean),
  );
  const lines = {
    types: lineTally,
    uvc: cohort.filter((b) => logged(b, "UVC") || lineTallyHas(b, "uvc")).length,
    picc: cohort.filter((b) => logged(b, "PICC") || lineTallyHas(b, "picc")).length,
    daysRecorded: lineDays,
    lineDayCoverage: pct(lineDaysVals.filter((d) => d > 0).length, cohort.filter((b) => (b.clinical?.lines ?? []).length > 0).length),
  };
  function lineTallyHas(b: AnalyticsBaby, needle: string): boolean {
    return (b.clinical?.lines ?? []).some((l) => (l.name ?? "").toLowerCase().includes(needle));
  }

  /* --------------------------------- neuro -------------------------------- */
  const ivhVals = cohort
    .map((b) => qiOf(b).neuro?.ivhGrade as number | undefined)
    .filter((x): x is number => typeof x === "number");
  const neuro = {
    coverage: pct(ivhVals.length, cohort.filter((b) => b.gestWeeks < 32).length),
    anyIvh: ivhVals.filter((g) => g >= 1).length,
    severeIvh: ivhVals.filter((g) => g >= 3).length,
    pvl: cohort.filter((b) => qiOf(b).neuro?.pvl).length,
    seizures: cohort.filter((b) => qiOf(b).neuro?.seizures).length,
    cooling: cohort.filter((b) => qiOf(b).neuro?.cooling).length,
    severeIvhInExtreme: pct(
      cohort.filter((b) => b.gestWeeks < 28 && (qiOf(b).neuro?.ivhGrade ?? 0) >= 3 && b.status !== "death").length,
      cohort.filter((b) => b.gestWeeks < 28 && typeof qiOf(b).neuro?.ivhGrade === "number" && b.status !== "death").length,
    ),
  };

  /* ---------------------------------- ROP --------------------------------- */
  const eligible = cohort.filter((b) => ropEligible(b.gestWeeks, b.gestDays, b.birthWeight) && b.status !== "death");
  const screened = eligible.filter((b) => qiOf(b).rop?.screened || logged(b, "ROP1") || logged(b, "ROP2"));
  const rop = {
    eligible: eligible.length,
    screened: screened.length,
    compliance: pct(screened.length, eligible.length),
    missed: eligible.length - screened.length,
    treated: cohort.filter((b) => qiOf(b).rop?.treatment && qiOf(b).rop?.treatment !== "none").length,
    stages: tally(cohort.map((b) => qiOf(b).rop?.stage ?? "").filter(Boolean)),
    plusDisease: cohort.filter((b) => qiOf(b).rop?.plus).length,
  };

  /* ------------------------------ transfusions ---------------------------- */
  const transfused = cohort.filter((b) => {
    const t = qiOf(b).transfusions;
    return (t?.prbc ?? 0) > 0 || (t?.platelets ?? 0) > 0 || (t?.ffp ?? 0) > 0;
  });
  const transfusions = {
    babies: pct(transfused.length, admitted),
    coverage: pct(transfused.length, cohort.filter((b) => qiOf(b).transfusions).length),
    prbc: cohort.reduce((a, b) => a + (qiOf(b).transfusions?.prbc ?? 0), 0),
    platelets: cohort.reduce((a, b) => a + (qiOf(b).transfusions?.platelets ?? 0), 0),
    ffp: cohort.reduce((a, b) => a + (qiOf(b).transfusions?.ffp ?? 0), 0),
  };

  /* -------------------------------- safety -------------------------------- */
  const safety = {
    procedures: [
      { label: "Intubations (ventilation started)", n: cohort.filter((b) => logged(b, "VENTILATION")).length },
      { label: "Surfactant doses recorded", n: cohort.reduce((a, b) => a + (qiOf(b).respiratory?.surfactantDoses ?? (logged(b, "SURFACTANT") ? 1 : 0)), 0) },
      { label: "UVC insertions", n: cohort.filter((b) => logged(b, "UVC")).length },
      { label: "PICC insertions", n: cohort.filter((b) => logged(b, "PICC")).length },
      { label: "NS boluses", n: cohort.filter((b) => logged(b, "NS_BOLUSES")).length },
      { label: "Blood cultures", n: cohort.filter((b) => logged(b, "BLOOD_CULTURE_1") || logged(b, "BLOOD_CULTURE_2")).length },
    ],
    tasksCompleted: 0, // filled by caller when tasks are available
    note: "Medication errors, unplanned extubations and device complications need structured capture — currently free text only.",
  };

  /* ---------------------------------- LOS --------------------------------- */
  const losVals = cohort.filter(hasLeft).map((b) => lengthOfStayDays(b)).filter((x): x is number => x !== null);
  const losByGa = GA_BANDS_FINE.map((label) => {
    const xs = cohort.filter((b) => hasLeft(b) && gaBandFine(b.gestWeeks, b.gestDays) === label).map((b) => lengthOfStayDays(b)).filter((x): x is number => x !== null);
    return { label, n: xs.length, median: median(xs) };
  });
  const los = {
    n: losVals.length,
    mean: avg(losVals),
    median: median(losVals),
    iqr: iqr(losVals),
    byGa: losByGa,
    prolonged: cohort
      .filter((b) => b.status === "active")
      .map((b) => ({ uhid: b.uhid, days: b.createdAt ? Math.floor((+today - +new Date(b.createdAt)) / 86_400_000) : 0, ga: `${b.gestWeeks}+${b.gestDays ?? 0}` }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 5),
  };

  /* ------------------------------- discharge ------------------------------ */
  const discharged = cohort.filter((b) => b.status === "discharged");
  const dischargeWeights = discharged
    .map((b) => dischargeOf(b)?.weightAtDischarge ?? b.currentWeight)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const pmaVals = discharged
    .map((b) => {
      const rec = dischargeOf(b);
      const pma = qiOf(b).discharge?.pmaWeeks;
      if (pma) return pma;
      if (rec?.at && b.dob) return r1((+new Date(rec.at) - +new Date(b.dob)) / (7 * 86_400_000) + b.gestWeeks + (b.gestDays ?? 0) / 7);
      return null;
    })
    .filter((x): x is number => x !== null);
  const discharge = {
    home: discharged.length,
    transferred: cohort.filter((b) => b.status === "transferred").length,
    death: deaths.length,
    avgWeightG: dischargeWeights.length ? Math.round(dischargeWeights.reduce((a, b) => a + b, 0) / dischargeWeights.length) : null,
    avgPma: avg(pmaVals),
    homeOxygen: discharged.filter((b) => qiOf(b).discharge?.homeOxygen).length,
    feedingAtDischarge: tally(discharged.map((b) => qiOf(b).discharge?.feedingAtDischarge ?? "Not recorded")),
    readmitted28d: cohort.filter((b) => qiOf(b).discharge?.readmitted28d).length,
  };

  /* ------------------------------ KMC & milk ------------------------------ */
  const kmcEligible = cohort.filter((b) => b.birthWeight < 2500 || b.gestWeeks < 37);
  const kmcMilk = {
    kmcEligible: kmcEligible.length,
    kmcStarted: pct(kmcEligible.filter((b) => qiOf(b).kmc?.started).length, kmcEligible.length),
    kmcHours: avg(kmcEligible.map((b) => qiOf(b).kmc?.hoursPerDay).filter((x): x is number => typeof x === "number")),
    anyHumanMilkVlbw: pct(
      cohort.filter((b) => b.birthWeight < 1500 && (/ebm|breast|donor|human/i.test(b.clinical?.fluids?.feedType ?? "") || qiOf(b).feeding?.exclusiveHumanMilk)).length,
      cohort.filter((b) => b.birthWeight < 1500 && b.status === "active").length,
    ),
    exclusiveHumanMilk: pct(necFeeding.exclusiveHumanMilk, cohort.length),
  };

  /* -------------------------------- trends -------------------------------- */
  const trends = monthsSeen.map((m) => {
    const inMonth = cohort.filter((b) => monthOf(b.createdAt) === m);
    return {
      month: m,
      admissions: inMonth.length,
      deaths: inMonth.filter((b) => b.status === "death").length,
      nec: inMonth.filter((b) => logged(b, "NEC")).length,
      vented: inMonth.filter((b) => logged(b, "VENTILATION")).length,
      antibiotics: inMonth.filter((b) => logged(b, "ANTIBIOTICS_1") || logged(b, "ANTIBIOTICS_2") || (b.clinical?.drugs ?? []).length > 0).length,
      humanMilk: inMonth.filter((b) => /ebm|breast|donor|human/i.test(b.clinical?.fluids?.feedType ?? "")).length,
    };
  });

  /* ---------------------------- quality indicators ------------------------ */
  const ind = (
    domain: string,
    indicator: string,
    value: string,
    rateInfo: Rate | null,
    ref: { target: number; unit: string; source: string; belowIsBetter?: boolean } | null,
    priority: "high" | "medium" | "low",
  ) => {
    let status: "ok" | "flag" | "no-data" = "no-data";
    if (ref && rateInfo && rateInfo.pct !== null) {
      const worse = ref.belowIsBetter ? rateInfo.pct > ref.target : rateInfo.pct < ref.target;
      status = worse ? "flag" : "ok";
    }
    return { domain, indicator, value, n: rateInfo?.n ?? null, denom: rateInfo?.denom ?? null, reference: ref ? `${ref.belowIsBetter ? "≤" : "≥"} ${ref.target} ${ref.unit}` : "—", source: ref?.source ?? "", status, priority };
  };
  const indicators = [
    ind("Outcome", "NICU mortality", `${mortality.rate.pct ?? "—"}%`, mortality.rate, null, "high"),
    ind("Process", "Admission normothermia", `${resuscitation.normothermia.pct ?? "—"}%`, resuscitation.normothermia, QI_REFERENCES.admissionNormothermia, "high"),
    ind("Process", "Antenatal steroids (<34 wk)", `${caseMix.steroids.find((s) => s.label !== "Not recorded" && s.label !== "none")?.n ?? 0}/${cohort.filter((b) => b.gestWeeks < 34).length}`, null, QI_REFERENCES.antenatalSteroids, "high"),
    ind("Outcome", "Severe IVH among <28 wk survivors", neuro.severeIvhInExtreme.pct === null ? "not captured" : `${neuro.severeIvhInExtreme.pct}%`, neuro.severeIvhInExtreme, QI_REFERENCES.severeIvh, "high"),
    ind("Outcome", "BPD at 36 wk PMA (<28 wk)", respiratory.bpd.pct === null ? "not captured" : `${respiratory.bpd.pct}%`, respiratory.bpd, QI_REFERENCES.bpd, "high"),
    ind("Outcome", "NEC", `${necFeeding.nec.pct ?? "—"}%`, necFeeding.nec, null, "medium"),
    ind("Outcome", "CLABSI per 1000 line-days", infection.clabsiRate === null ? "not captured" : String(infection.clabsiRate), null, QI_REFERENCES.clabsi, "high"),
    ind("Process", "ROP screening of eligible", `${rop.compliance.pct ?? "—"}%`, rop.compliance, QI_REFERENCES.ropScreening, "high"),
    ind("Process", "Any human milk (VLBW, active)", `${kmcMilk.anyHumanMilkVlbw.pct ?? "—"}%`, kmcMilk.anyHumanMilkVlbw, QI_REFERENCES.anyHumanMilkVlbw, "medium"),
    ind("Process", "KMC of eligible", `${kmcMilk.kmcStarted.pct ?? "—"}%`, kmcMilk.kmcStarted, QI_REFERENCES.kmc, "medium"),
    ind("Process", "Antibiotic exposure", `${infection.antibioticExposure.pct ?? "—"}%`, infection.antibioticExposure, QI_REFERENCES.antibioticRate, "medium"),
    ind("Outcome", "Survival to discharge", `${mortality.survival.pct ?? "—"}%`, mortality.survival, null, "low"),
  ];

  /* -------------------------------- Pareto -------------------------------- */
  const complications = [
    { label: "NEC", n: nec.length },
    { label: "Severe IVH", n: neuro.severeIvh },
    { label: "ROP (any stage)", n: cohort.filter((b) => qiOf(b).rop?.stage).length },
    { label: "Culture-positive sepsis", n: infection.culturePositive },
    { label: "CLABSI", n: infection.clabsi },
    { label: "BPD", n: bpdCases.length },
    { label: "Seizures", n: neuro.seizures },
    { label: "PVL", n: neuro.pvl },
    { label: "Readmission ≤28 d", n: discharge.readmitted28d },
  ]
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const totalComp = complications.reduce((a, c) => a + c.n, 0);
  let running = 0;
  const pareto = complications.map((c) => {
    running += c.n;
    return { ...c, cumulativePct: totalComp ? Math.round((running / totalComp) * 100) : 0 };
  });

  /* ------------------------------- subgroups ------------------------------ */
  const subgroupDefs = [
    { label: "<28 wk", test: (b: AnalyticsBaby) => b.gestWeeks < 28 },
    { label: "28–31 wk", test: (b: AnalyticsBaby) => b.gestWeeks >= 28 && b.gestWeeks < 32 },
    { label: "32–36 wk", test: (b: AnalyticsBaby) => b.gestWeeks >= 32 && b.gestWeeks < 37 },
    { label: "Term", test: (b: AnalyticsBaby) => b.gestWeeks >= 37 },
    { label: "ELBW", test: (b: AnalyticsBaby) => b.birthWeight < 1000 },
    { label: "VLBW", test: (b: AnalyticsBaby) => b.birthWeight < 1500 },
    { label: "Outborn", test: (b: AnalyticsBaby) => !b.inborn },
    { label: "Male", test: (b: AnalyticsBaby) => b.sex === "Male" },
    { label: "Ventilated", test: (b: AnalyticsBaby) => vented.includes(b) },
  ];
  const subgroups = subgroupDefs.map((d) => {
    const inside = cohort.filter(d.test);
    return {
      label: d.label,
      n: inside.length,
      mortalityPct: inside.length ? Math.round((inside.filter((b) => b.status === "death").length / inside.length) * 1000) / 10 : null,
      severeIvh: inside.filter((b) => (qiOf(b).neuro?.ivhGrade ?? 0) >= 3).length,
      nec: inside.filter((b) => logged(b, "NEC")).length,
    };
  });

  /* --------------------------------- gaps --------------------------------- */
  const gaps = [
    { domain: "Readmissions", note: "Only a 28-day readmission flag per baby; no emergency-visit or cause-specific register." },
    { domain: "Staffing & workload", note: "Nurse/doctor ratios and shift workload are not captured anywhere in the system." },
    { domain: "Microbiology", note: "Organism is a single free-text field; no susceptibility panel or resistance tracking." },
    { domain: "Labs", note: "Bilirubin, creatinine, electrolytes and blood gases live in free text — no structured values, so jaundice/AKI/metabolic indicators cannot be computed." },
    { domain: "Ventilator/oxygen durations", note: "Days are optional QI fields; the event log only keeps free-text start/stop." },
    { domain: "LAMA/DAMA", note: "No discharge-against-advice outcome is recorded; departures are home/transfer/death only." },
    { domain: "Safety events", note: "Medication errors, unplanned extubations, extravasation and identification errors have no structured capture." },
    { domain: "Multiples & maternal detail", note: "Singleton/multiple pregnancy and most maternal complications are not structured fields." },
  ];

  return {
    generatedAt: today.toISOString(),
    dataQuality,
    activity,
    caseMix,
    mortality,
    crib2: crib2Report,
    respiratory,
    resuscitation,
    infection,
    necFeeding,
    nutrition,
    lines,
    neuro,
    rop,
    transfusions,
    safety,
    los,
    discharge,
    kmcMilk,
    trends,
    indicators,
    pareto,
    subgroups,
    gaps,
  };
}

function admissionDayKey(b: AnalyticsBaby): string {
  return b.createdAt ? dayKey(b.createdAt) : "";
}
