import {
  AAP_BP,
  AAP_HEIGHT_CM,
  AAP_HEIGHT_PERCENTILES,
  NEONATAL_GA_CENTILES,
  NEONATAL_STATUS_P5,
  type AapSex,
} from "./bpCentileData";

export type { AapSex } from "./bpCentileData";

export type BpMode = "preterm" | "neonate" | "pediatrics";
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
  gestationalAgeWeeks: number;
  postnatalDay: NeonatalDay;
  postmenstrualAgeWeeks: number;
  sex: AapSex;
  thresholds: { sbp: BpThresholds; dbp: BpThresholds };
  classification: { sbp: BpClassification; dbp: BpClassification; overall: BpClassification };
  sourceNote: string;
};

export type BpResult = PediatricBpResult | NeonatalBpResult;

const AAP_AGE_MIN = 1;
const AAP_AGE_MAX = 17;
const AAP_HEIGHT_MIN = 70;
const AAP_HEIGHT_MAX = 200;

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
  if (!Number.isInteger(ageYears) || ageYears < AAP_AGE_MIN || ageYears > AAP_AGE_MAX) return "AAP table age must be a completed year from 1 through 17.";
  if (!Number.isFinite(heightCm) || heightCm < AAP_HEIGHT_MIN || heightCm > AAP_HEIGHT_MAX) return "Height must be 70–200 cm.";
  if (!Number.isFinite(sbp) || sbp < 40 || sbp > 220 || !Number.isFinite(dbp) || dbp < 20 || dbp > 140) return "Enter physiologically plausible SBP (40–220) and DBP (20–140) values.";
  return null;
}

export function calculatePediatricBp(input: { sex: AapSex; ageYears: number; heightCm: number; sbp: number; dbp: number }): PediatricBpResult {
  const error = validatePediatric(input.ageYears, input.heightCm, input.sbp, input.dbp);
  if (error) throw new Error(error);
  const heightIndex = nearestAapHeightIndex(input.ageYears, input.sex, input.heightCm);
  const heightPercentile = AAP_HEIGHT_PERCENTILES[heightIndex];
  const heightReferenceCm = AAP_HEIGHT_CM[input.sex][input.ageYears][heightIndex];
  const table = AAP_BP[input.sex][input.ageYears];
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
      ? "For ages 13–17, AAP classification uses fixed adolescent thresholds (120/80, 130/80 and 140/90); the centile rows remain visible for reference."
      : "AAP classification uses the lower applicable boundary of the percentile and AAP absolute thresholds, component by component.",
  };
}

function validateNeonatal(mode: "preterm" | "neonate", gestationalAgeWeeks: number, postnatalDay: NeonatalDay, sbp: number, dbp: number): string | null {
  const min = mode === "preterm" ? 32 : 37;
  const max = mode === "preterm" ? 36 : 40;
  if (!Number.isInteger(gestationalAgeWeeks) || gestationalAgeWeeks < min || gestationalAgeWeeks > max) return `${mode === "preterm" ? "Preterm" : "Term/neonate"} reference supports gestational age ${min}–${max} weeks.`;
  if (![4, 7, 14].includes(postnatalDay)) return "The Indian neonatal reference provides values on postnatal days 4, 7 and 14.";
  if (!Number.isFinite(sbp) || sbp < 20 || sbp > 160 || !Number.isFinite(dbp) || dbp < 10 || dbp > 120) return "Enter physiologically plausible neonatal SBP (20–160) and DBP (10–120) values.";
  return null;
}

export function calculateNeonatalBp(input: { mode: "preterm" | "neonate"; sex: AapSex; gestationalAgeWeeks: number; postnatalDay: NeonatalDay; sbp: number; dbp: number }): NeonatalBpResult {
  const error = validateNeonatal(input.mode, input.gestationalAgeWeeks, input.postnatalDay, input.sbp, input.dbp);
  if (error) throw new Error(error);
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
