/**
 * Level III-B NICU quality-improvement domain.
 *
 * Two things live here:
 *  1. `QiCapture` — the structured fields the unit records per baby so the
 *     Analytics page can report the indicators that the free-text chart never
 *     could (antenatal steroids, admission temperature & base excess for
 *     CRIB-II, IVH grade, ROP stage, antibiotic days, line days, KMC,
 *     transfusions, readmissions). Everything is optional: a field that was
 *     never recorded stays absent and the analytics report says "not captured"
 *     instead of guessing.
 *  2. Pure clinical calculators the analytics engine shares: CRIB-II, the fine
 *     gestational-age and birth-weight bands, SGA/LGA classification against
 *     Fenton 2013, and ROP screening eligibility.
 */
import { assess } from "./anthropometry";

/* ------------------------------- capture -------------------------------- */

export type QiCapture = {
  antenatal?: {
    steroids?: "none" | "partial" | "complete";
    mgso4?: boolean;
    hypertension?: boolean;
    diabetes?: boolean;
    pprom?: boolean;
    chorioamnionitis?: boolean;
    fgr?: boolean;
    congenitalAnomaly?: boolean;
    anomalyNote?: string;
  };
  admission?: {
    /** Lowest core temperature within the first hour of NICU admission, °C. */
    tempC?: number;
    /** Worst base excess from the first-hour blood gas, mmol/L (negative = deficit). */
    baseExcess?: number;
    ppv?: boolean;
    deliveryRoomIntubation?: boolean;
    chestCompressions?: boolean;
    epinephrine?: boolean;
  };
  neuro?: {
    ivhGrade?: 0 | 1 | 2 | 3 | 4;
    pvl?: boolean;
    seizures?: boolean;
    cooling?: boolean;
  };
  respiratory?: {
    ventDays?: number;
    cpapDays?: number;
    hfncDays?: number;
    o2Days?: number;
    surfactantDoses?: number;
    extubationAttempts?: number;
    reintubations?: number;
    /** Respiratory support at 36 weeks PMA — the BPD definition used here. */
    o2At36Pma?: "none" | "low-flow oxygen" | "NIPPV/CPAP" | "mechanical ventilation";
  };
  infection?: {
    eos?: boolean;
    los?: boolean;
    culturePositive?: boolean;
    organism?: string;
    antibioticDays?: number;
    clabsi?: boolean;
    meningitis?: boolean;
  };
  lines?: { uvcDays?: number; uacDays?: number; piccDays?: number };
  transfusions?: { prbc?: number; platelets?: number; ffp?: number };
  feeding?: {
    firstFeedDay?: number;
    fullFeedDay?: number;
    pnDays?: number;
    exclusiveHumanMilk?: boolean;
  };
  kmc?: { started?: boolean; firstKmcDay?: number; hoursPerDay?: number };
  rop?: {
    screened?: boolean;
    stage?: string;
    zone?: string;
    plus?: boolean;
    treatment?: "none" | "laser" | "anti-VEGF";
  };
  discharge?: {
    pmaWeeks?: number;
    homeOxygen?: boolean;
    feedingAtDischarge?: "breast" | "OG/NG tube" | "mixed" | "IV";
    readmitted28d?: boolean;
    readmissionReason?: string;
  };
};

/* ------------------------------- CRIB-II --------------------------------- */
/**
 * CRIB-II (Parry, Tucker & Tarnow-Mordi, Lancet 2003;361:1789–91) — five
 * first-hour variables, deliberately treatment-free so units can be compared
 * without rewarding or penalising care differences. Score levels published
 * with the score: I 0–5, II 6–10, III 11–15, IV >15.
 *
 * Bands below are the published point table as reproduced in current clinical
 * calculators. Base excess must be recorded for a complete score; without it
 * we return `complete: false` rather than a silently under-scored value.
 */
export type Crib2Input = {
  sex: string;
  gestWeeks: number;
  birthWeightG: number;
  tempC?: number;
  baseExcess?: number;
};

export type Crib2Result = {
  score: number;
  complete: boolean;
  level: "I" | "II" | "III" | "IV";
  components: { sex: number; weight: number; gestation: number; temperature: number; baseExcess: number };
};

export function crib2(i: Crib2Input): Crib2Result {
  const sex = i.sex === "Male" ? 1 : 0;
  const weight = i.birthWeightG <= 649 ? 8 : i.birthWeightG <= 849 ? 5 : i.birthWeightG <= 1099 ? 3 : i.birthWeightG <= 1350 ? 1 : 0;
  const gestation = i.gestWeeks <= 23 ? 6 : i.gestWeeks <= 26 ? 3 : i.gestWeeks <= 29 ? 1 : 0;
  const temperature = typeof i.tempC === "number" ? (i.tempC < 35 ? 4 : i.tempC <= 35.9 ? 2 : 0) : 0;
  const baseExcess =
    typeof i.baseExcess === "number" ? (i.baseExcess <= -15 ? 3 : i.baseExcess <= -10 ? 2 : i.baseExcess <= -7 ? 1 : 0) : 0;
  const complete = typeof i.tempC === "number" && typeof i.baseExcess === "number";
  const score = sex + weight + gestation + temperature + baseExcess;
  const level = score <= 5 ? "I" : score <= 10 ? "II" : score <= 15 ? "III" : "IV";
  return { score, complete, level, components: { sex, weight, gestation, temperature, baseExcess } };
}

/* ------------------------- case-mix banding (fine) ----------------------- */

export const GA_BANDS_FINE = [
  "<24 wk",
  "24–25+6 wk",
  "26–27+6 wk",
  "28–29+6 wk",
  "30–31+6 wk",
  "32–33+6 wk",
  "34–36+6 wk",
  "≥37 wk",
] as const;

export const BW_BANDS_FINE = [
  "<500 g",
  "500–749 g",
  "750–999 g",
  "1000–1249 g",
  "1250–1499 g",
  "1500–1999 g",
  "2000–2499 g",
  "≥2500 g",
] as const;

export function gaBandFine(weeks: number, days = 0): string {
  const g = weeks + days / 7;
  if (g < 24) return GA_BANDS_FINE[0];
  if (g < 26) return GA_BANDS_FINE[1];
  if (g < 28) return GA_BANDS_FINE[2];
  if (g < 30) return GA_BANDS_FINE[3];
  if (g < 32) return GA_BANDS_FINE[4];
  if (g < 34) return GA_BANDS_FINE[5];
  if (g < 37) return GA_BANDS_FINE[6];
  return GA_BANDS_FINE[7];
}

export function bwBandFine(g: number): string {
  if (g < 500) return BW_BANDS_FINE[0];
  if (g < 750) return BW_BANDS_FINE[1];
  if (g < 1000) return BW_BANDS_FINE[2];
  if (g < 1250) return BW_BANDS_FINE[3];
  if (g < 1500) return BW_BANDS_FINE[4];
  if (g < 2000) return BW_BANDS_FINE[5];
  if (g < 2500) return BW_BANDS_FINE[6];
  return BW_BANDS_FINE[7];
}

/**
 * Size for gestational age against Fenton 2013 (the reference already bundled
 * for the anthropometry calculators). Returns null when the reference cannot
 * cover the age/weight given, so the caller reports "not classified" instead
 * of a wrong label.
 */
export function sizeForGA(birthWeightG: number, weeks: number, days: number, sex: string): "SGA" | "AGA" | "LGA" | null {
  if (!birthWeightG || !weeks) return null;
  // Fenton 2013 weight LMS is stored in kilograms; the chart records grams.
  const a = assess(birthWeightG / 1000, weeks + days / 7, sex === "Female" ? "f" : "m", "weight", "fenton2013");
  if (!a.available || !Number.isFinite(a.percentile)) return null;
  if (a.percentile < 10) return "SGA";
  if (a.percentile > 90) return "LGA";
  return "AGA";
}

/* --------------------------- ROP eligibility ------------------------------ */
/**
 * Screen-eligible infants per the programme followed in Indian NICUs
 * (National Neonatology Forum / RBSK): birth weight ≤1750 g or gestation
 * ≤34 weeks. Units that screen wider simply see 100% compliance.
 */
export function ropEligible(weeks: number, days: number, birthWeightG: number): boolean {
  return weeks + days / 7 <= 34 || birthWeightG <= 1750;
}

/* ----------------------------- reference values --------------------------- */
/**
 * Published reference values for the quality dashboard. These are comparison
 * points from large networks and guidance — NOT proof of substandard care
 * (rule 12): case-mix differs between units, and a flag means "review", not
 * "failure".
 */
export const QI_REFERENCES = {
  admissionNormothermia: { target: 90, unit: "%", source: "WHO thermal protection / golden-hour collaboratives commonly target ≥90% ≥36.5 °C" },
  antenatalSteroids: { target: 85, unit: "%", source: "Antenatal corticosteroid coverage of preterm births <34 wk (national QI collaboratives)" },
  anyHumanMilkVlbw: { target: 90, unit: "%", source: "VON-style networks: any human milk for VLBW infants ≥90%" },
  clabsi: { target: 4, unit: "/1000 line-days", source: "Vermont Oxford Network benchmark band ≈3–5/1000 central-line days", belowIsBetter: true },
  severeIvh: { target: 12, unit: "% of <28 wk survivors", source: "VON all-baby data: severe IVH ~11–12% below 28 weeks", belowIsBetter: true },
  bpd: { target: 45, unit: "% of surviving <28 wk", source: "VON/network bands ~38–45% BPD at 36 wk PMA below 28 weeks", belowIsBetter: true },
  ropScreening: { target: 100, unit: "% of eligible", source: "NF/RBSK screening programme: every eligible infant screened" },
  kmc: { target: 80, unit: "% of eligible", source: "WHO KMC guidance: all stable low-birth-weight infants" },
  antibioticRate: { target: 30, unit: "% of admissions", source: "Stewardship collaboratives flag >30% antibiotic exposure for review", belowIsBetter: true },
} as const;
