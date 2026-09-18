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
    /**
     * How today's enteral volume relates to the total fluid target:
     *  - "static"     : the whole TFI is enteral, divided across the day.
     *  - "increasing" : enteral = TFI - increment; the increment is given IV,
     *                   so feeds step up by that amount over the next 24 h.
     * Absent means the legacy behaviour (enteral/IV entered directly).
     */
    feedPlan?: "static" | "increasing";
    /** Total fluid intake target, ml/kg/day. */
    tfiMlKgDay?: number;
    /** Planned feed increase over the next 24 h, ml/kg/day ("increasing" plan). */
    feedIncrementMlKgDay?: number;
    /**
     * What the increase number means:
     *  - "iv-today":       feeds run at TFI - increment and the increment is
     *                      given IV today (steps up over the next 24 h).
     *  - "tomorrow-target": today's feeds are the full TFI and the increase
     *                      is the enteral target for the next 24 h.
     *
     * The feed plan governs enteral feeds only. IV fluids are always typed
     * manually in ivMlKgDay — the plan never derives or overrides them.
     */
    increaseAppliesTo?: "iv-today" | "tomorrow-target";
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
    /**
     * Energy and protein each fortifier unit contributes. Optional — defaults
     * to a standard human milk fortifier. Set these to match the product on
     * the label when it differs.
     */
    fortifierKcalPerUnit?: number;
    fortifierProteinPerUnit?: number;
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

/**
 * Fortifier contribution per unit (sachet / scoop / measure / g / ml).
 *
 * A standard human milk fortifier sachet mixed into 25 ml of expressed breast
 * milk raises it from ~0.67 to ~0.80 kcal/ml (+4 kcal per 25 ml) and protein
 * from ~1.1 to ~2.4 g/dl (+0.33 g per 25 ml). Override per product with
 * fortifierKcalPerUnit / fortifierProteinPerUnit.
 */
export const FORTIFIER_KCAL_PER_UNIT = 4;
export const FORTIFIER_PROTEIN_G_PER_UNIT = 0.33;

/**
 * Lipid emulsions supply energy (9 kcal/g) but effectively no protein — the
 * egg phospholipid emulsifier is not counted as usable protein. Kept as a
 * named constant so the assumption is visible and easy to change.
 */
export const LIPID_PROTEIN_G_PER_G = 0;

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
  /* --- Fortification, so fortified feeds are counted with unfortified ones --- */
  /** True when a fortifier amount is recorded. */
  fortified: boolean;
  /** kcal/ml added to the base milk by the fortifier. */
  fortKcalPerMl: number;
  /** g protein/ml added to the base milk by the fortifier. */
  fortProteinPerMl: number;
  /** Effective kcal/ml actually used: base milk density + fortifier. */
  effectiveKcalPerMl: number;
  /** Effective g protein/ml actually used: base milk protein + fortifier. */
  effectiveProteinPerMl: number;
  /* --- Per-source breakdown so every number can be audited --- */
  milkKcal: number;
  fortKcal: number;
  milkProtein: number;
  fortProtein: number;
  /** Protein from IV amino acids (Aminoven / Vaminolact) — equals aaG. */
  aaProtein: number;
  /** Protein from lipid emulsion — 0 by definition, shown for completeness. */
  lipidProtein: number;
  kcalTarget: [number, number];
  proteinTarget: [number, number];
  kcalDeficit: number;
  proteinDeficit: number;
  /** Resolved feed plan (static / increasing) behind these numbers. */
  feedPlan: FeedPlan;
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

const clampMl = (v: number) => Math.max(0, Math.min(250, v));

/**
 * Feeds per day implied by an "N hourly" frequency.
 * Returns undefined for "continuous", on-demand or unrecognised entries,
 * because those have no fixed number of boluses to divide the day into.
 */
export function feedsPerDay(feedFreq: string | undefined): number | undefined {
  const match = feedFreq?.trim().match(/^(\d+(?:\.5)?) hourly$/i);
  if (!match) return undefined;
  const hours = Number(match[1]);
  if (!hours || hours <= 0 || hours >= 24) return undefined;
  return 24 / hours;
}

export type FeedPlan = {
  /** False when no TFI target is entered — callers fall back to raw enteral/IV. */
  active: boolean;
  mode: "static" | "increasing";
  increaseAppliesTo: "iv-today" | "tomorrow-target";
  tfi?: number;
  /** Only set for the "increasing" plan. */
  increment?: number;
  /** Today's enteral volume, the only thing the plan actually drives. */
  enteralMlKgDay?: number;
  /** Today's IV volume — always the manually entered value, never derived. */
  ivMlKgDay?: number;
  /**
   * What the IV would have to be to bring enteral + IV up to the TFI target.
   * Informational only: the UI shows it as a hint and never writes it back.
   */
  ivSuggestedMlKgDay?: number;
  /** Enteral volume planned for the next 24 h (the step-up target). */
  tomorrowEnteralMlKgDay?: number;
  /** Enteral + IV actually prescribed today. */
  totalFluidsMlKgDay?: number;
  /** True when today's enteral + IV equals the TFI target. */
  reconciled: boolean;
  perFeedMl?: number;
  feedsPerDay?: number;
  notes: string[];
};

/**
 * Resolve today's enteral volume and the next 24 h step-up from the total
 * fluid intake target. The plan governs enteral feeds only.
 *
 *  static                whole TFI is enteral, no change tomorrow
 *  increasing + iv-today    feeds run at TFI - increment, TFI tomorrow
 *  increasing + tomorrow    feeds run at the full TFI today and step up to
 *                           TFI + increment over the next 24 h
 *
 * IV fluids are always the manually entered ivMlKgDay. The plan reports what
 * IV would reconcile the day (ivSuggestedMlKgDay) but never sets it, so a
 * typed IV prescription can no longer be overwritten or silently zeroed.
 *
 * Pure function — used by calcNutrition and the feed UI so both always agree.
 */
export function resolveFeedPlan(
  f: NonNullable<Clinical["fluids"]>,
  weightKg?: number,
): FeedPlan {
  const mode: FeedPlan["mode"] = f.feedPlan === "increasing" ? "increasing" : "static";
  const increaseAppliesTo: FeedPlan["increaseAppliesTo"] =
    f.increaseAppliesTo === "tomorrow-target" ? "tomorrow-target" : "iv-today";
  const notes: string[] = [];
  const enteredIv = f.ivMlKgDay !== undefined ? clampMl(f.ivMlKgDay) : 0;
  const inactive: FeedPlan = {
    active: false,
    mode,
    increaseAppliesTo,
    ivMlKgDay: enteredIv,
    reconciled: false,
    notes,
  };
  if (f.tfiMlKgDay === undefined || !(f.tfiMlKgDay > 0)) return inactive;
  if (f.tfiMlKgDay > 250) notes.push(`TFI ${f.tfiMlKgDay} ml/kg/day exceeds the 250 cap — clamped`);
  const tfi = clampMl(f.tfiMlKgDay);

  // --- today's enteral volume, plus the step-up target for the next 24 h ---
  let enteral = tfi;
  let tomorrow = tfi;
  let increment: number | undefined;
  if (mode === "increasing") {
    const rawInc = f.feedIncrementMlKgDay ?? 0;
    increment = clampMl(rawInc);
    if (rawInc > 250) notes.push(`Increase ${rawInc} ml/kg/day exceeds the 250 cap — clamped`);
    if (increaseAppliesTo === "iv-today") {
      if (increment > tfi) notes.push(`Increase ${increment} exceeds TFI ${tfi} — enteral floored at 0`);
      enteral = Math.max(0, tfi - increment);
      tomorrow = tfi;
    } else {
      enteral = tfi;
      const next = tfi + increment;
      tomorrow = clampMl(next);
      if (next > 250) notes.push(`Next 24 h target ${Math.round(next)} ml/kg/day exceeds the 250 cap — clamped`);
    }
  }

  // --- today's IV volume: whatever was typed, never derived or overridden ---
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const ivSuggested = Math.max(0, round2(tfi - enteral));
  const totalFluids = round2(enteral + enteredIv);
  const reconciled = Math.abs(totalFluids - tfi) < 0.01;
  if (totalFluids > tfi + 0.01) {
    notes.push(
      `Total fluids ${totalFluids} ml/kg/day exceed the TFI target ${tfi} by ${round2(totalFluids - tfi)} — check the IV prescription.`,
    );
  }

  const fpd = feedsPerDay(f.feedFreq);
  const perFeedMl =
    fpd !== undefined && weightKg !== undefined && weightKg > 0
      ? round2((enteral * weightKg) / fpd)
      : undefined;
  if (fpd === undefined && enteral > 0) {
    notes.push("Choose an hourly frequency to split the day's volume into feeds");
  }

  return {
    active: true,
    mode,
    increaseAppliesTo,
    tfi,
    increment,
    enteralMlKgDay: round2(enteral),
    ivMlKgDay: round2(enteredIv),
    ivSuggestedMlKgDay: ivSuggested,
    tomorrowEnteralMlKgDay: round2(tomorrow),
    totalFluidsMlKgDay: totalFluids,
    reconciled,
    perFeedMl,
    feedsPerDay: fpd,
    notes,
  };
}

/** Auto-compute kcal/kg/day and protein g/kg/day from the current feed + TPN prescription. */
export function calcNutrition(c: Clinical): NutritionCalc {
  const f = c.fluids ?? {};
  const feedType = f.feedType ?? "—";
  const density = KCAL_PER_ML[feedType] ?? 0.67;
  const protPerMl = PROTEIN_G_PER_ML[feedType] ?? 0.011;

  // --- Feed plan: TFI target split into today's enteral + IV volumes ---
  const plan = resolveFeedPlan(f);

  // --- Input sanitization with physiological limits ---
  const rawEnteral = plan.active && plan.enteralMlKgDay !== undefined ? plan.enteralMlKgDay : f.enteralMlKgDay ?? 0;
  const enteralMl = clampMl(rawEnteral); // cap 250 ml/kg/day

  const rawIv = plan.active && plan.ivMlKgDay !== undefined ? plan.ivMlKgDay : f.ivMlKgDay ?? 0;
  const ivMl = clampMl(rawIv);

  // GIR: an explicit manual value wins. Otherwise DERIVE it from dextrose% and
  // the IV volume, so IV energy is never silently dropped on the screens that
  // call calcNutrition on stored data without pre-computing GIR.
  const derivedGir = calcGir(f.dextrosePct, ivMl);
  const storedGir = f.gir ?? 0;
  const rawGir = f.girManual ? storedGir : derivedGir > 0 ? derivedGir : storedGir;
  // GIR should be 0-20 mg/kg/min, if >20 likely data entry error
  const gir = Math.max(0, Math.min(20, rawGir));
  const girSource: NutritionCalc["girSource"] = f.girManual
    ? "manual"
    : derivedGir > 0
      ? "auto"
      : storedGir > 0
        ? "manual"
        : "none";

  // Dextrose: mg/kg/min -> g/kg/day = GIR * 1440 /1000 = GIR *1.44
  const dextroseG = Math.round(gir * 1.44 * 10) / 10;
  const dextroseKcal = Math.round(dextroseG * 3.4 * 10) / 10; // 3.4 kcal/g dextrose

  const rawAa = f.aminoAcid ?? 0;
  const aaG = Math.max(0, Math.min(6, rawAa)); // AA max 4-4.5 g/kg/day, cap 6 for safety
  const aaKcal = Math.round(aaG * 4 * 10) / 10; // 4 kcal/g

  const rawLipid = f.lipid ?? 0;
  const lipidG = Math.max(0, Math.min(6, rawLipid)); // lipid max 3-4 g/kg/day
  const lipidKcal = Math.round(lipidG * 9 * 10) / 10; // 9 kcal/g

  const warnings: string[] = [];

  // --- Fortification: uplift the milk density from the recorded preparation ---
  // amount used / volume it was mixed into = fortifier per ml of feed, applied
  // to the whole day's enteral volume, so fortified feeds count their energy
  // and protein exactly like an unfortified feed does.
  const fortAmount = f.fortificationAmount ?? 0;
  const fortMixedMl = f.fortificationFeedVolumeMl ?? 0;
  const kcalPerUnit = f.fortifierKcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT;
  const proteinPerUnit = f.fortifierProteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT;
  const fortified = fortAmount > 0;
  let fortKcalPerMl = 0;
  let fortProteinPerMl = 0;
  if (fortified && fortMixedMl > 0) {
    fortKcalPerMl = (fortAmount * kcalPerUnit) / fortMixedMl;
    fortProteinPerMl = (fortAmount * proteinPerUnit) / fortMixedMl;
  } else if (fortified) {
    warnings.push(
      "Fortifier recorded without a mixed volume — enter \"Feed volume mixed (ml)\" so its energy and protein are counted",
    );
  }
  const effectiveKcalPerMl = density + fortKcalPerMl;
  const effectiveProteinPerMl = protPerMl + fortProteinPerMl;

  const enteralKcal = Math.round(enteralMl * effectiveKcalPerMl * 10) / 10;
  const fortKcal = Math.round(enteralMl * fortKcalPerMl * 10) / 10;
  const milkKcal = Math.round((enteralKcal - fortKcal) * 10) / 10;
  const enteralProtein = Math.round(enteralMl * effectiveProteinPerMl * 100) / 100;
  const fortProtein = Math.round(enteralMl * fortProteinPerMl * 100) / 100;
  const milkProtein = Math.round((enteralProtein - fortProtein) * 100) / 100;

  // Total IV kcal = dextrose + AA + lipid (TPN)
  const ivKcal = Math.round((dextroseKcal + aaKcal + lipidKcal) * 10) / 10;
  // Total energy = enteral (milk + fortifier) + IV (dextrose + AA + lipid)
  const totalKcal = Math.round((enteralKcal + ivKcal) * 10) / 10;
  // Total protein = enteral (milk + fortifier) + IV amino acids + lipid (0)
  const lipidProtein = Math.round(lipidG * LIPID_PROTEIN_G_PER_G * 100) / 100;
  const totalProtein = Math.round((enteralProtein + aaG + lipidProtein) * 100) / 100;

  const kcalTarget: [number, number] = [110, 135];
  const proteinTarget: [number, number] = [3.5, 4.5]; // widened to 3.5-4.5 for preterm, was 3.5-4

  if (gir > 0 && gir < 4) warnings.push(`Low GIR ${gir} mg/kg/min (<4) — risk hypoglycaemia`);
  if (gir > 8 && gir <= 12) warnings.push(`High GIR ${gir} mg/kg/min (>8) — monitor glucose, consider central line if >10`);
  if (gir > 12) warnings.push(`Very high GIR ${gir} mg/kg/min (>12) — requires central line, high osmolarity risk`);
  if (rawGir > 20) warnings.push(`GIR input ${rawGir} exceeds physiological max 20 — check IV rate / dextrose%`);

  if (aaG > 4) warnings.push(`AA ${aaG} g/kg/day exceeds 4 — check prescription`);
  if (lipidG > 4) warnings.push(`Lipid ${lipidG} g/kg/day exceeds 4 — check prescription`);
  if (enteralMl > 200) warnings.push(`Enteral ${enteralMl} ml/kg/day >200 — fluid overload risk`);
  if (ivMl > 0 && derivedGir === 0 && !f.girManual) {
    warnings.push(
      `IV ${ivMl} ml/kg/day carries no energy here — enter dextrose% (or GIR) if the IV fluid contains dextrose`,
    );
  }
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
    totalFluids: plan.active
      ? Math.round((enteralMl + ivMl) * 10) / 10
      : f.totalMlKgDay ?? Math.round((enteralMl + ivMl) * 10) / 10,
    ivMl,
    fortified,
    fortKcalPerMl: Math.round(fortKcalPerMl * 1000) / 1000,
    fortProteinPerMl: Math.round(fortProteinPerMl * 10000) / 10000,
    effectiveKcalPerMl: Math.round(effectiveKcalPerMl * 1000) / 1000,
    effectiveProteinPerMl: Math.round(effectiveProteinPerMl * 10000) / 10000,
    milkKcal,
    fortKcal,
    milkProtein,
    fortProtein,
    aaProtein: aaG,
    lipidProtein,
    feedPlan: plan,
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
