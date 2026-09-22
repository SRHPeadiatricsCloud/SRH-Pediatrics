import {
  AAP_BP,
  AAP_HEIGHT_CM,
  AAP_HEIGHT_PERCENTILES,
  NEONATAL_GA_CENTILES,
  NEONATAL_STATUS_P5,
  NEONATAL_PMA_BP_CENTILES,
  type PmaBpValues,
  type AapSex,
} from "./bpCentileData";

export type { AapSex } from "./bpCentileData";
export { NEONATAL_PMA_BP_CENTILES } from "./bpCentileData";

export type BpMode = "preterm" | "neonate" | "pma" | "pediatrics";
export type NeonatalDay = 4 | 7 | 14;
export type BpComponent = "sbp" | "dbp";
export type BpCategory = "normal" | "elevated" | "stage1" | "stage2" | "belowReference";

export type BpThresholds = {
  p5: number | null;
  p50: number;
  p90: number;
  p95: number;
  p95Plus12: number | null;
};

export type BpClassification = {
  category: BpCategory;
  label: string;
  severity: "good" | "info" | "warn" | "crit";
  note: string;
};

export type PediatricBpResult = {
  mode: "pediatrics";
  ageYears: number;
  sex: AapSex;
  heightCm: number;
  heightPercentile: number;
  heightReferenceCm: number;
  thresholds: { sbp: BpThresholds; dbp: BpThresholds };
  classification: { sbp: BpClassification; dbp: BpClassification; overall: BpClassification };
  sourceNote: string;
};

export type NeonatalBpResult = {
  mode: "preterm" | "neonate";
  /** "centile" = Samanta P5/P50/P90/P95; "observed-range" = published range. */
  basis: "centile" | "observed-range";
  /** Observed SBP/DBP range, present only when basis is "observed-range". */
  observedRange?: { sbp: [number, number]; dbp: [number, number] };
  /** Lower limit of mean BP on the day of birth, mmHg (observed-range basis). */
  mapLowerLimit?: number;
  gestationalAgeWeeks: number;
  postnatalDay: NeonatalDay;
  postmenstrualAgeWeeks: number;
  sex: AapSex;
  thresholds: { sbp: BpThresholds; dbp: BpThresholds };
  classification: { sbp: BpClassification; dbp: BpClassification; overall: BpClassification };
  sourceNote: string;
};

export type BpResult = PediatricBpResult | NeonatalBpResult | PmaBpResult;

export type PmaBpResult = {
  mode: "pma";
  pmaWeeks: number;
  sbp: number;
  dbp: number;
  map?: number;
  reference: PmaBpValues;
  thresholds: {
    sbp: BpThresholds;
    dbp: BpThresholds;
    map?: BpThresholds;
  };
  classification: {
    sbp: BpClassification;
    dbp: BpClassification;
    map?: BpClassification;
    overall: BpClassification;
  };
  sourceNote: string;
};

export function nearestPmaWeeks(pma: number): number {
  const available = [26, 28, 30, 32, 34, 36, 38, 40, 42, 44];
  let best = 26;
  let bestDiff = Math.abs(pma - best);
  for (const w of available) {
    const diff = Math.abs(pma - w);
    if (diff < bestDiff) {
      best = w;
      bestDiff = diff;
    }
  }
  return best;
}

export function classifyPmaValue(value: number, p50: number, p95: number, p99: number, label: string): BpClassification {
  if (value >= p99) {
    return { category: "stage2", label: "≥99th percentile", severity: "crit", note: `${label} is at or above the 99th centile (≥${p99} mmHg). Severe elevation.` };
  }
  if (value >= p95) {
    return { category: "stage1", label: "95th–99th percentile", severity: "warn", note: `${label} is between 95th and 99th centile (${p95}–${p99} mmHg). Hypertension threshold.` };
  }
  if (value < p50 * 0.75) {
    return { category: "belowReference", label: "Below reference", severity: "info", note: `${label} is substantially below the 50th centile (${p50} mmHg). Review perfusion.` };
  }
  return { category: "normal", label: "Normal (within reference)", severity: "good", note: `${label} is below the 95th centile.` };
}

export function calculatePmaBp(input: { pmaWeeks: number; sbp: number; dbp: number; map?: number }): PmaBpResult {
  const pma = nearestPmaWeeks(input.pmaWeeks);
  const ref = NEONATAL_PMA_BP_CENTILES[pma];
  if (!ref) throw new Error(`No reference data for PMA ${pma} weeks`);

  const sbpClass = classifyPmaValue(input.sbp, ref.p50.sbp, ref.p95.sbp, ref.p99.sbp, "SBP");
  const dbpClass = classifyPmaValue(input.dbp, ref.p50.dbp, ref.p95.dbp, ref.p99.dbp, "DBP");
  let mapClass: BpClassification | undefined;
  if (input.map !== undefined) {
    mapClass = classifyPmaValue(input.map, ref.p50.map, ref.p95.map, ref.p99.map, "MAP");
  }

  let overall = highestClassification(sbpClass, dbpClass);
  if (mapClass) overall = highestClassification(overall, mapClass);

  const thresholds = {
    sbp: { p5: null, p50: ref.p50.sbp, p90: ref.p95.sbp, p95: ref.p95.sbp, p95Plus12: ref.p99.sbp },
    dbp: { p5: null, p50: ref.p50.dbp, p90: ref.p95.dbp, p95: ref.p95.dbp, p95Plus12: ref.p99.dbp },
    map: { p5: null, p50: ref.p50.map, p90: ref.p95.map, p95: ref.p95.map, p95Plus12: ref.p99.map },
  };

  return {
    mode: "pma",
    pmaWeeks: pma,
    sbp: input.sbp,
    dbp: input.dbp,
    map: input.map,
    reference: ref,
    thresholds,
    classification: {
      sbp: sbpClass,
      dbp: dbpClass,
      map: mapClass,
      overall,
    },
    sourceNote: `NICU Blood Pressure Reference by Postconceptional Age (${pma} weeks, 50th, 95th & 99th percentiles).`,
  };
}


const AAP_AGE_MIN = 1;
// AAP 2017 Tables 4-5 publish rows for 1-17 years. Eighteen-year-olds are
// accepted and read against the 17-year row: AAP classifies everyone aged 13+
// with the fixed adolescent thresholds, so no 18-year row is needed or invented.
const AAP_AGE_MAX = 18;
const AAP_TABLE_MAX_AGE = 17;
const AAP_HEIGHT_MIN = 70;
const AAP_HEIGHT_MAX = 200;

/**
 * Observed blood-pressure RANGES for extremely preterm infants, 24-31 weeks.
 *
 * The Samanta et al. centile table starts at 32 weeks. There is no
 * gestational-age centile table below that, and extrapolating one would be
 * unsafe, so these are published observed ranges and are flagged as such
 * everywhere they are shown — a range is not a percentile.
 *
 * Safer Care Victoria neonatal guidance, preterm infants by gestation:
 *   24-28 wk   SBP 48-58   DBP 22-36
 *   29-32 wk   SBP 47-59   DBP 24-34
 * The same guidance states the bedside rule used for MAP below: the lower limit
 * of mean BP in mmHg on the day of birth is approximately the gestational age
 * in weeks.
 */
export type PretermBpRange = { minGa: number; maxGa: number; sbp: [number, number]; dbp: [number, number] };
export const EXTREME_PRETERM_BP_RANGES: readonly PretermBpRange[] = [
  { minGa: 24, maxGa: 28, sbp: [48, 58], dbp: [22, 36] },
  { minGa: 29, maxGa: 31, sbp: [47, 59], dbp: [24, 34] },
];
export function extremePretermRange(gestationalAgeWeeks: number): PretermBpRange | undefined {
  return EXTREME_PRETERM_BP_RANGES.find(
    (r) => gestationalAgeWeeks >= r.minGa && gestationalAgeWeeks <= r.maxGa,
  );
}
/** Lower limit of mean BP on the day of birth, in mmHg. */
export function mapLowerLimitOnDayOfBirth(gestationalAgeWeeks: number): number {
  return Math.round(gestationalAgeWeeks);
}

export function nearestAapHeightIndex(ageYears: number, sex: AapSex, heightCm: number): number {
  const heights = AAP_HEIGHT_CM[sex][ageYears];
  if (!heights) return -1;
  let selected = 0;
  let distance = Number.POSITIVE_INFINITY;
  heights.forEach((referenceHeight, index) => {
    const nextDistance = Math.abs(referenceHeight - heightCm);
    if (nextDistance < distance) {
      distance = nextDistance;
      selected = index;
    }
  });
  return selected;
}

function roundHeight(value: number): number {
  return Math.round(value * 10) / 10;
}

function highestClassification(a: BpClassification, b: BpClassification): BpClassification {
  const rank: Record<BpCategory, number> = { belowReference: 0, normal: 1, elevated: 2, stage1: 3, stage2: 4 };
  return rank[a.category] >= rank[b.category] ? a : b;
}

function classifyAap(value: number, thresholds: BpThresholds, component: BpComponent, adolescent: boolean): BpClassification {
  const unit = component === "sbp" ? "SBP" : "DBP";
  if (adolescent) {
    const elevated = component === "sbp" ? 120 : 80;
    const stage1 = component === "sbp" ? 130 : 80;
    const stage2 = component === "sbp" ? 140 : 90;
    if (value >= stage2) return { category: "stage2", label: "Stage 2", severity: "crit", note: `${unit} meets the AAP adolescent stage 2 threshold (≥${stage2} mmHg).` };
    if (value >= stage1) return { category: "stage1", label: "Stage 1", severity: "warn", note: `${unit} meets the AAP adolescent stage 1 threshold (≥${stage1} mmHg).` };
    if (value >= elevated) return { category: "elevated", label: "Elevated", severity: "info", note: `${unit} meets the AAP adolescent elevated threshold (≥${elevated} mmHg).` };
    return { category: "normal", label: "Normal", severity: "good", note: `${unit} is below the AAP adolescent elevated threshold.` };
  }

  const absoluteElevated = component === "sbp" ? 120 : 80;
  const absoluteStage1 = component === "sbp" ? 130 : 80;
  const absoluteStage2 = component === "sbp" ? 140 : 90;
  const elevated = Math.min(thresholds.p90, absoluteElevated);
  const stage1 = Math.min(thresholds.p95, absoluteStage1);
  const stage2 = Math.min(thresholds.p95Plus12 ?? Number.POSITIVE_INFINITY, absoluteStage2);
  if (value >= stage2) return { category: "stage2", label: "Stage 2", severity: "crit", note: `${unit} reaches the AAP stage 2 boundary (≥${stage2} mmHg for this child).` };
  if (value >= stage1) return { category: "stage1", label: "Stage 1", severity: "warn", note: `${unit} reaches the AAP stage 1 boundary (≥${stage1} mmHg for this child).` };
  if (value >= elevated) return { category: "elevated", label: "Elevated", severity: "info", note: `${unit} reaches the AAP elevated boundary (≥${elevated} mmHg for this child).` };
  if (thresholds.p5 != null && value < thresholds.p5) return { category: "belowReference", label: "Below 5th", severity: "info", note: `${unit} is below the 5th centile in this reference; assess perfusion, technique and clinical context.` };
  return { category: "normal", label: "Normal", severity: "good", note: `${unit} is below the AAP 90th-centile/elevated boundary.` };
}

function classifyNeonatal(value: number, thresholds: BpThresholds, component: BpComponent): BpClassification {
  const unit = component === "sbp" ? "SBP" : "DBP";
  if (value >= thresholds.p95) return { category: "stage2", label: "≥95th reference", severity: "crit", note: `${unit} is at or above the 95th centile in this neonatal reference; this is not, by itself, a diagnosis.` };
  if (value >= thresholds.p90) return { category: "elevated", label: "90th–<95th", severity: "warn", note: `${unit} is between the 90th and below the 95th centile in this reference.` };
  if (thresholds.p5 != null && value < thresholds.p5) return { category: "belowReference", label: "Below 5th", severity: "info", note: `${unit} is below the 5th centile; correlate with perfusion and the complete clinical picture.` };
  return { category: "normal", label: "Within reference", severity: "good", note: `${unit} is below the 90th centile in this reference.` };
}

function validatePediatric(ageYears: number, heightCm: number, sbp: number, dbp: number): string | null {
  if (!Number.isInteger(ageYears) || ageYears < AAP_AGE_MIN || ageYears > AAP_AGE_MAX) return "AAP table age must be a completed year from 1 through 18.";
  if (!Number.isFinite(heightCm) || heightCm < AAP_HEIGHT_MIN || heightCm > AAP_HEIGHT_MAX) return "Height must be 70–200 cm.";
  if (!Number.isFinite(sbp) || sbp < 40 || sbp > 220 || !Number.isFinite(dbp) || dbp < 20 || dbp > 140) return "Enter physiologically plausible SBP (40–220) and DBP (20–140) values.";
  return null;
}

export function calculatePediatricBp(input: { sex: AapSex; ageYears: number; heightCm: number; sbp: number; dbp: number }): PediatricBpResult {
  const error = validatePediatric(input.ageYears, input.heightCm, input.sbp, input.dbp);
  if (error) throw new Error(error);
  const tableAge = Math.min(input.ageYears, AAP_TABLE_MAX_AGE);
  const heightIndex = nearestAapHeightIndex(tableAge, input.sex, input.heightCm);
  const heightPercentile = AAP_HEIGHT_PERCENTILES[heightIndex];
  const heightReferenceCm = AAP_HEIGHT_CM[input.sex][tableAge][heightIndex];
  const table = AAP_BP[input.sex][tableAge];
  const row = (component: BpComponent): BpThresholds => ({
    // AAP 2017 Tables 4–5 publish 50th, 90th, 95th and 95th + 12 mmHg.
    // The requested 5th row is deliberately null rather than invented.
    p5: null,
    p50: table[50][component][heightIndex],
    p90: table[90][component][heightIndex],
    p95: table[95][component][heightIndex],
    p95Plus12: table[95][component][heightIndex] + 12,
  });
  const thresholds = { sbp: row("sbp"), dbp: row("dbp") };
  const classification = {
    sbp: classifyAap(input.sbp, thresholds.sbp, "sbp", input.ageYears >= 13),
    dbp: classifyAap(input.dbp, thresholds.dbp, "dbp", input.ageYears >= 13),
  };
  return {
    mode: "pediatrics",
    ageYears: input.ageYears,
    sex: input.sex,
    heightCm: input.heightCm,
    heightPercentile,
    heightReferenceCm,
    thresholds,
    classification: { ...classification, overall: highestClassification(classification.sbp, classification.dbp) },
    sourceNote: input.ageYears >= 13
      ? `For ages 13 and over, AAP classification uses fixed adolescent thresholds (120/80, 130/80 and 140/90); the centile rows remain visible for reference.${
          input.ageYears > AAP_TABLE_MAX_AGE ? " Age 18 is read against the published 17-year row." : ""
        }`
      : "AAP classification uses the lower applicable boundary of the percentile and AAP absolute thresholds, component by component.",
  };
}

function validateNeonatal(mode: "preterm" | "neonate", gestationalAgeWeeks: number, postnatalDay: NeonatalDay, sbp: number, dbp: number): string | null {
  const min = mode === "preterm" ? 24 : 37;
  const max = mode === "preterm" ? 36 : 40;
  if (!Number.isInteger(gestationalAgeWeeks) || gestationalAgeWeeks < min || gestationalAgeWeeks > max) return `${mode === "preterm" ? "Preterm" : "Term/neonate"} reference supports gestational age ${min}–${max} weeks.`;
  if (![4, 7, 14].includes(postnatalDay)) return "The Indian neonatal reference provides values on postnatal days 4, 7 and 14.";
  if (!Number.isFinite(sbp) || sbp < 20 || sbp > 160 || !Number.isFinite(dbp) || dbp < 10 || dbp > 120) return "Enter physiologically plausible neonatal SBP (20–160) and DBP (10–120) values.";
  return null;
}

export function calculateNeonatalBp(input: { mode: "preterm" | "neonate"; sex: AapSex; gestationalAgeWeeks: number; postnatalDay: NeonatalDay; sbp: number; dbp: number }): NeonatalBpResult {
  const error = validateNeonatal(input.mode, input.gestationalAgeWeeks, input.postnatalDay, input.sbp, input.dbp);
  if (error) throw new Error(error);

  // Below 32 weeks there is no centile table — report the observed range instead
  // of extrapolating percentiles that were never measured.
  const range = input.gestationalAgeWeeks < 32 ? extremePretermRange(input.gestationalAgeWeeks) : undefined;
  if (range) {
    const pma = Math.round((input.gestationalAgeWeeks + input.postnatalDay / 7) * 10) / 10;
    const mapLimit = mapLowerLimitOnDayOfBirth(input.gestationalAgeWeeks);
    const thresholds = {
      sbp: { p5: range.sbp[0], p50: Math.round((range.sbp[0] + range.sbp[1]) / 2), p90: range.sbp[1], p95: range.sbp[1], p95Plus12: null },
      dbp: { p5: range.dbp[0], p50: Math.round((range.dbp[0] + range.dbp[1]) / 2), p90: range.dbp[1], p95: range.dbp[1], p95Plus12: null },
    } satisfies { sbp: BpThresholds; dbp: BpThresholds };
    const classification = {
      sbp: classifyNeonatal(input.sbp, thresholds.sbp, "sbp"),
      dbp: classifyNeonatal(input.dbp, thresholds.dbp, "dbp"),
    };
    return {
      mode: input.mode,
      basis: "observed-range",
      observedRange: { sbp: range.sbp, dbp: range.dbp },
      mapLowerLimit: mapLimit,
      gestationalAgeWeeks: input.gestationalAgeWeeks,
      postnatalDay: input.postnatalDay,
      postmenstrualAgeWeeks: pma,
      sex: input.sex,
      thresholds,
      classification: { ...classification, overall: highestClassification(classification.sbp, classification.dbp) },
      sourceNote:
        `Observed range for ${range.minGa}-${range.maxGa} weeks, not a percentile — the Indian centile table begins at 32 weeks. ` +
        `SBP ${range.sbp[0]}-${range.sbp[1]}, DBP ${range.dbp[0]}-${range.dbp[1]} mmHg. Lower limit of mean BP on the day of birth is ` +
        `approximately ${mapLimit} mmHg (gestational age in weeks). Perfusion is judged on urine output and capillary refill, not on this number alone.`,
    };
  }

  const row = NEONATAL_GA_CENTILES[input.gestationalAgeWeeks][input.postnatalDay];
  const p5 = NEONATAL_STATUS_P5[input.mode === "preterm" ? "preterm" : "term"][input.postnatalDay];
  const thresholds = {
    sbp: { p5: p5.sbp, p50: row.sbp[1], p90: row.sbp[2], p95: row.sbp[3], p95Plus12: null },
    dbp: { p5: p5.dbp, p50: row.dbp[1], p90: row.dbp[2], p95: row.dbp[3], p95Plus12: null },
  } satisfies { sbp: BpThresholds; dbp: BpThresholds };
  const classification = {
    sbp: classifyNeonatal(input.sbp, thresholds.sbp, "sbp"),
    dbp: classifyNeonatal(input.dbp, thresholds.dbp, "dbp"),
  };
  return {
    mode: input.mode,
    basis: "centile",
    gestationalAgeWeeks: input.gestationalAgeWeeks,
    postnatalDay: input.postnatalDay,
    postmenstrualAgeWeeks: Math.round((input.gestationalAgeWeeks + input.postnatalDay / 7) * 10) / 10,
    sex: input.sex,
    thresholds,
    classification: { ...classification, overall: highestClassification(classification.sbp, classification.dbp) },
    sourceNote: "Samanta et al. studied hemodynamically stable Indian neonates using oscillometric measurements on days 4, 7 and 14. Sex was not significantly different, but gestational status, gestational age, postnatal age, illness and measurement conditions matter.",
  };
}

export { AAP_AGE_MAX, AAP_AGE_MIN, AAP_HEIGHT_MAX, AAP_HEIGHT_MIN };
