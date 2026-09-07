export type GrowthEntry = {
  at: string;
  weight: number;
  hc?: number;
  length?: number;
  note?: string;
  /** Snapshot of nutrition delivered on that day (auto-calculated). */
  kcal?: number;
  protein?: number;
  fluids?: number;
};

export type Clinical = {
  triage?: {
    scale: string;
    band: string;
    score: number;
    label: string;
    advice: string;
    appliedAt: string;
  };
  growth?: GrowthEntry[];
  resp?: {
    mode?: string;
    settings?: Record<string, number>;
    surfactant?: string;
    ettSize?: string;
    ettDepth?: string;
    silverman?: number;
    spo2Target?: string;
    notes?: string;
  };
  fluids?: {
    totalMlKgDay?: number;
    enteralMlKgDay?: number;
    ivMlKgDay?: number;
    gir?: number;
    aminoAcid?: number;
    lipid?: number;
    kcal?: number;
    feedType?: string;
    feedRoute?: string;
    feedFreq?: string;
    feedVol?: number;
    residual?: string;
    tpn?: boolean;
    notes?: string;
  };
  lines?: { name: string; day: number; site?: string }[];
  drugs?: { name: string; dose?: string; day?: number; ofDays?: number }[];
  labs?: Record<string, string>;
  care?: string[];
  discharge?: string[];
  antenatal?: string[];
  plan?: string;
  familyNote?: string;
};

export function dayOfLife(dob: string | Date): number {
  const d = new Date(dob).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

export function hoursOfLife(dob: string | Date): number {
  const d = new Date(dob).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 3600000));
}

export function correctedGA(dob: string | Date, w: number, d: number): string {
  const days = w * 7 + d + Math.floor((Date.now() - new Date(dob).getTime()) / 86400000);
  return `${Math.floor(days / 7)}+${days % 7} wk`;
}

export function weightChangePct(birth: number, current: number): number {
  if (!birth) return 0;
  return Math.round(((current - birth) / birth) * 1000) / 10;
}

/* --------------------- nutrition / energy auto-calculator ------------------ */
/** Energy density (kcal per ml) of the milks used in the unit. */
export const KCAL_PER_ML: Record<string, number> = {
  "NPO / Nil per oral": 0,
  "Trophic feeds": 0.67,
  "Expressed breast milk (EBM)": 0.67,
  "Direct breastfeeding": 0.67,
  "Donor human milk": 0.67,
  "EBM + HMF": 0.81,
  "Preterm formula": 0.8,
  "Term formula": 0.67,
  "Lactose free / hydrolysed formula": 0.68,
  "Post-discharge formula": 0.73,
};

/** Protein (g per ml). */
export const PROTEIN_G_PER_ML: Record<string, number> = {
  "NPO / Nil per oral": 0,
  "Trophic feeds": 0.011,
  "Expressed breast milk (EBM)": 0.011,
  "Direct breastfeeding": 0.011,
  "Donor human milk": 0.011,
  "EBM + HMF": 0.025,
  "Preterm formula": 0.024,
  "Term formula": 0.014,
  "Lactose free / hydrolysed formula": 0.019,
  "Post-discharge formula": 0.019,
};

export type NutritionCalc = {
  feedType: string;
  density: number;
  enteralMl: number;
  enteralKcal: number;
  enteralProtein: number;
  gir: number;
  dextroseG: number;
  dextroseKcal: number;
  aaG: number;
  aaKcal: number;
  lipidG: number;
  lipidKcal: number;
  ivKcal: number;
  totalKcal: number;
  totalProtein: number;
  totalFluids: number;
  kcalTarget: [number, number];
  proteinTarget: [number, number];
  kcalDeficit: number;
  proteinDeficit: number;
};

/** Auto-compute kcal/kg/day and protein g/kg/day from the current feed + TPN prescription. */
export function calcNutrition(c: Clinical): NutritionCalc {
  const f = c.fluids ?? {};
  const feedType = f.feedType ?? "—";
  const density = KCAL_PER_ML[feedType] ?? 0.67;
  const protPerMl = PROTEIN_G_PER_ML[feedType] ?? 0.011;

  const enteralMl = f.enteralMlKgDay ?? 0;
  const enteralKcal = Math.round(enteralMl * density * 10) / 10;
  const enteralProtein = Math.round(enteralMl * protPerMl * 100) / 100;

  const gir = f.gir ?? 0;
  const dextroseG = Math.round(gir * 1.44 * 10) / 10; // mg/kg/min -> g/kg/day
  const dextroseKcal = Math.round(dextroseG * 3.4 * 10) / 10;
  const aaG = f.aminoAcid ?? 0;
  const aaKcal = Math.round(aaG * 4 * 10) / 10;
  const lipidG = f.lipid ?? 0;
  const lipidKcal = Math.round(lipidG * 9 * 10) / 10;

  const ivKcal = Math.round((dextroseKcal + aaKcal + lipidKcal) * 10) / 10;
  const totalKcal = Math.round((enteralKcal + ivKcal) * 10) / 10;
  const totalProtein = Math.round((enteralProtein + aaG) * 100) / 100;

  const kcalTarget: [number, number] = [110, 135];
  const proteinTarget: [number, number] = [3.5, 4];

  return {
    feedType,
    density,
    enteralMl,
    enteralKcal,
    enteralProtein,
    gir,
    dextroseG,
    dextroseKcal,
    aaG,
    aaKcal,
    lipidG,
    lipidKcal,
    ivKcal,
    totalKcal,
    totalProtein,
    totalFluids: f.totalMlKgDay ?? 0,
    kcalTarget,
    proteinTarget,
    kcalDeficit: Math.round((totalKcal - kcalTarget[0]) * 10) / 10,
    proteinDeficit: Math.round((totalProtein - proteinTarget[0]) * 100) / 100,
  };
}

/* ------------------------- temperature conversion ------------------------- */
export type TempUnit = "C" | "F";

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 * 10) / 10 + 32;
}

export function fToC(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

/** Convert a stored Celsius value into the display unit. */
export function tempOut(c: number | null | undefined, unit: TempUnit): number | null {
  if (c === null || c === undefined || Number.isNaN(Number(c))) return null;
  const v = Number(c);
  return unit === "F" ? Math.round(((v * 9) / 5 + 32) * 10) / 10 : Math.round(v * 10) / 10;
}

/** Convert a value typed in the display unit back to Celsius for storage. */
export function tempIn(v: number, unit: TempUnit): number {
  return unit === "F" ? Math.round((((v - 32) * 5) / 9) * 10) / 10 : Math.round(v * 10) / 10;
}

/** Formatted temperature string with the unit suffix. */
export function fmtTemp(c: number | null | undefined, unit: TempUnit): string {
  const v = tempOut(c, unit);
  return v === null ? "—" : `${v.toFixed(1)} °${unit}`;
}

/**
 * Universal blood-pressure formatter — shows systolic/diastolic (MAP) together
 * in a single value, e.g. "82/56 (72)". Falls back gracefully when parts are missing.
 */
export function fmtBP(
  sbp: number | string | null | undefined,
  dbp: number | string | null | undefined,
  map: number | string | null | undefined,
): string {
  const n = (x: number | string | null | undefined) => {
    if (x === null || x === undefined || x === "") return null;
    const v = Number(x);
    return Number.isFinite(v) ? Math.round(v) : null;
  };
  const s = n(sbp);
  const d = n(dbp);
  const m = n(map);
  if (s !== null && d !== null) return `${s}/${d}${m !== null ? ` (${m})` : ""}`;
  if (m !== null) return `(${m})`;
  if (s !== null || d !== null) return `${s ?? "—"}/${d ?? "—"}`;
  return "—";
}

/** Growth velocity in g/kg/day between two weights. */
export function gainGPerKgDay(prev: number, cur: number, days: number): number | null {
  if (!prev || !cur || days <= 0) return null;
  const meanKg = ((prev + cur) / 2) / 1000;
  return Math.round(((cur - prev) / days / meanKg) * 10) / 10;
}

export function pctOfBirth(birth: number, cur: number): number | null {
  if (!birth) return null;
  return Math.round(((cur - birth) / birth) * 1000) / 10;
}

export function fmtTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function relTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const mins = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

// Simple validity flags used to colour the vitals chips (term/preterm ranges)
export function vitalFlag(key: string, v: number | null | undefined): "ok" | "warn" | "bad" {
  if (v === null || v === undefined || Number.isNaN(v)) return "ok";
  const r: Record<string, [number, number, number, number]> = {
    hr: [100, 160, 90, 180],
    rr: [30, 60, 25, 70],
    spo2: [90, 100, 88, 100],
    temp: [36.5, 37.5, 36, 38],
    map: [30, 55, 25, 65],
    rbs: [45, 150, 40, 180],
    crt: [0, 3, 0, 4],
  };
  const range = r[key];
  if (!range) return "ok";
  const [lo, hi, lo2, hi2] = range;
  if (v >= lo && v <= hi) return "ok";
  if (v >= lo2 && v <= hi2) return "warn";
  return "bad";
}
