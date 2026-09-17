export type GrowthEntry = {
  at: string;
  weight: number;
  hc?: number;
  length?: number;
  note?: string;
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
    dextrosePct?: number;
    gir?: number;
    girManual?: boolean;
    aminoAcid?: number;
    lipid?: number;
    kcal?: number;
    kcalManual?: boolean;
    feedType?: string;
    feedRoute?: string;
    feedFreq?: string;
    feedVol?: number;
    feedVolManual?: boolean;
    fortificationName?: string;
    fortificationAmount?: number;
    fortificationAmountUnit?: "sachet" | "g" | "ml" | "scoop" | "measure";
    fortificationFeedVolumeMl?: number;
    fortificationNotes?: string;
    residual?: string;
    tpn?: boolean;
    notes?: string;
  };
  lines?: { name: string; day: number; site?: string }[];
  drugs?: {
    name: string;
    dose?: string;
    day?: number;
    ofDays?: number;
    startedAt?: string;
    dayOverride?: number;
    source?: "our unit" | "referring hospital" | "unknown";
  }[];
  admissionContext?: {
    mode: "new" | "existing-transfer";
    recordedAt: string;
  };
  labs?: Record<string, string>;
  care?: string[];
  discharge?: string[];
  antenatal?: string[];
  plan?: string;
  familyNote?: string;
  eventLog?: Record<string, { date?: string; result?: string; starting?: string; ending?: string; notes?: string }>;
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
  proteinPerMl: number;
  enteralMl: number;
  enteralKcal: number;
  enteralProtein: number;
  gir: number;
  girSource: "auto" | "manual" | "none";
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
  ivMl: number;
  kcalTarget: [number, number];
  proteinTarget: [number, number];
  kcalDeficit: number;
  proteinDeficit: number;
  warnings: string[];
  isAbnormal: boolean;
};

/**
 * Correct GIR calculation:
 * GIR (mg/kg/min) = Dextrose% × IV rate (ml/kg/day) × 10 / 1440
 * Dextrose% is g per 100ml, ×10 = g per L, × ml/kg/day /1000 = g/kg/day, ×1000/1440 = mg/kg/min
 * Physiological range 4-8 mg/kg/min, max 12-14 with central line
 */
export function calcGir(dextrosePct: number | undefined, ivMlKgDay: number | undefined): number {
  if (dextrosePct === undefined || ivMlKgDay === undefined || ivMlKgDay <= 0) return 0;
  if (dextrosePct <= 0) return 0;
  const gir = (dextrosePct * 10 * ivMlKgDay) / 1440;
  return Math.round(gir * 100) / 100;
}

/** Auto-compute kcal/kg/day and protein g/kg/day from the current feed + TPN prescription. */
export function calcNutrition(c: Clinical): NutritionCalc {
  const f = c.fluids ?? {};
  const feedType = f.feedType ?? "—";
  const density = KCAL_PER_ML[feedType] ?? 0.67;
  const protPerMl = PROTEIN_G_PER_ML[feedType] ?? 0.011;

  // --- Input sanitization with physiological limits ---
  const rawEnteral = f.enteralMlKgDay ?? 0;
  const enteralMl = Math.max(0, Math.min(250, rawEnteral)); // cap 250 ml/kg/day

  const rawIv = f.ivMlKgDay ?? 0;
  const ivMl = Math.max(0, Math.min(250, rawIv));

  const rawGir = f.gir ?? 0;
  // GIR should be 0-20 mg/kg/min, if >20 likely data entry error
  const gir = Math.max(0, Math.min(20, rawGir));
  const girSource: NutritionCalc["girSource"] = f.girManual ? "manual" : f.dextrosePct !== undefined && f.ivMlKgDay !== undefined ? "auto" : rawGir > 0 ? "manual" : "none";

  // Dextrose: mg/kg/min -> g/kg/day = GIR * 1440 /1000 = GIR *1.44
  const dextroseG = Math.round(gir * 1.44 * 10) / 10;
  const dextroseKcal = Math.round(dextroseG * 3.4 * 10) / 10; // 3.4 kcal/g dextrose

  const rawAa = f.aminoAcid ?? 0;
  const aaG = Math.max(0, Math.min(6, rawAa)); // AA max 4-4.5 g/kg/day, cap 6 for safety
  const aaKcal = Math.round(aaG * 4 * 10) / 10; // 4 kcal/g

  const rawLipid = f.lipid ?? 0;
  const lipidG = Math.max(0, Math.min(6, rawLipid)); // lipid max 3-4 g/kg/day
  const lipidKcal = Math.round(lipidG * 9 * 10) / 10; // 9 kcal/g

  const enteralKcal = Math.round(enteralMl * density * 10) / 10;
  const enteralProtein = Math.round(enteralMl * protPerMl * 100) / 100;

  // Total IV kcal = dextrose + AA + lipid (TPN)
  const ivKcal = Math.round((dextroseKcal + aaKcal + lipidKcal) * 10) / 10;
  // Total = enteral + IV
  const totalKcal = Math.round((enteralKcal + ivKcal) * 10) / 10;
  const totalProtein = Math.round((enteralProtein + aaG) * 100) / 100;

  const kcalTarget: [number, number] = [110, 135];
  const proteinTarget: [number, number] = [3.5, 4.5]; // widened to 3.5-4.5 for preterm, was 3.5-4

  const warnings: string[] = [];
  if (gir > 0 && gir < 4) warnings.push(`Low GIR ${gir} mg/kg/min (<4) — risk hypoglycaemia`);
  if (gir > 8 && gir <= 12) warnings.push(`High GIR ${gir} mg/kg/min (>8) — monitor glucose, consider central line if >10`);
  if (gir > 12) warnings.push(`Very high GIR ${gir} mg/kg/min (>12) — requires central line, high osmolarity risk`);
  if (rawGir > 20) warnings.push(`GIR input ${rawGir} exceeds physiological max 20 — check IV rate / dextrose%`);

  if (aaG > 4) warnings.push(`AA ${aaG} g/kg/day exceeds 4 — check prescription`);
  if (lipidG > 4) warnings.push(`Lipid ${lipidG} g/kg/day exceeds 4 — check prescription`);
  if (enteralMl > 200) warnings.push(`Enteral ${enteralMl} ml/kg/day >200 — fluid overload risk`);
  if (totalKcal > 0 && totalKcal < 80) warnings.push(`Low energy ${totalKcal} kcal/kg/day (<80) — below basal needs`);
  if (totalKcal > 150) warnings.push(`High energy ${totalKcal} kcal/kg/day (>150) — exceeds target 110-135`);
  if (totalProtein > 0 && totalProtein < 2) warnings.push(`Low protein ${totalProtein} g/kg/day (<2) — inadequate for growth`);
  if (totalProtein > 5) warnings.push(`High protein ${totalProtein} g/kg/day (>5) — exceeds safe limit, check AA + enteral`);

  // Detect gross errors from old logic: if totalKcal >300 or protein >10 likely data entry error (e.g., ml/day entered as ml/kg/day)
  if (totalKcal > 300) warnings.push(`Grossly high energy ${totalKcal} — likely ml/day entered as ml/kg/day, please check weight and volumes`);
  if (totalProtein > 10) warnings.push(`Grossly high protein ${totalProtein} — likely unit error, check AA g/kg/day vs ml/kg/day`);

  const isAbnormal = warnings.length > 0;

  return {
    feedType,
    density,
    proteinPerMl: protPerMl,
    enteralMl,
    enteralKcal,
    enteralProtein,
    gir,
    girSource,
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
    ivMl,
    kcalTarget,
    proteinTarget,
    kcalDeficit: Math.round((totalKcal - kcalTarget[0]) * 10) / 10,
    proteinDeficit: Math.round((totalProtein - proteinTarget[0]) * 100) / 100,
    warnings,
    isAbnormal,
  };
}

/* ------------------------- temperature conversion ------------------------- */
export type TempUnit = "C" | "F";

const cleanConversion = (value: number) => Number(value.toPrecision(15));

export function cToF(c: number): number {
  return cleanConversion((c * 9) / 5 + 32);
}

export function fToC(f: number): number {
  return cleanConversion(((f - 32) * 5) / 9);
}

export function tempOut(c: number | null | undefined, unit: TempUnit): number | null {
  if (c === null || c === undefined || Number.isNaN(Number(c))) return null;
  const v = Number(c);
  const displayed = unit === "F" ? (v * 9) / 5 + 32 : v;
  return Number(displayed.toFixed(1));
}

export function tempIn(v: number, unit: TempUnit): number {
  return unit === "F" ? cleanConversion(((v - 32) * 5) / 9) : v;
}

export function fmtTemp(c: number | null | undefined, unit: TempUnit): string {
  const v = tempOut(c, unit);
  return v === null ? "—" : `${String(v)} °${unit}`;
}

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
