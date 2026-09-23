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
    /** Planned daily advancement step (ml/kg/day), edited in the advancement section. */
    feedAdvanceStepMlKg?: number;
    /** Unit the step is entered in; ml/feed converts via interval + weight. */
    feedAdvanceStepUnit?: "mlkg" | "mlfeed";
    feedVol?: number;
    feedVolManual?: boolean;
    fortificationName?: string;
    fortificationProductId?: string;
    fortificationAmount?: number;
    fortificationAmountUnit?: "sachet" | "g" | "ml" | "scoop" | "measure";
    fortificationFeedVolumeMl?: number;
    /** Per-unit composition for product "custom" (per sachet/g/scoop/measure, or per ml for liquids). */
    fortificationKcalPerUnit?: number;
    fortificationProteinPerUnit?: number;
    /** Grams per sachet for g→sachet conversion (custom products). Defaults to the product's sachet size. */
    fortificationSachetGrams?: number;
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

/* --------------------- feed interval (Q-hours) ------------------ */
/**
 * Parse a feed-frequency label into interval hours.
 * Accepts Q-notation ("Q2H", "q6h", "Q 12 H") as well as legacy labels
 * ("2 hourly", "1.5 hourly", "every 3 hours"). Returns undefined for
 * continuous / on-demand / unparseable labels.
 */
export function parseFeedIntervalHours(freq: string | undefined): number | undefined {
  const raw = freq?.trim() ?? "";
  if (!raw) return undefined;
  const q = raw.match(/^q\s*(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?$/i);
  if (q) {
    const h = Number(q[1]);
    return h > 0 && h <= 24 ? h : undefined;
  }
  const plain = raw.match(/^(?:every\s+)?(\d+(?:\.\d+)?)\s*(?:hourly|hours?|hrs?|hrly)$/i);
  if (plain) {
    const h = Number(plain[1]);
    return h > 0 && h <= 24 ? h : undefined;
  }
  return undefined;
}

/** Format interval hours back to Q-notation ("Q2H", "Q1.5H"). */
export function formatFeedInterval(hours: number): string {
  const h = Math.round(hours * 100) / 100;
  return `Q${h}H`;
}

/* --------------------- TFI split (enteral vs IV) ------------------ */
export type TfiSplit = {
  tfi: number | undefined;
  enteral: number;
  /** Suggested IV = max(0, TFI - enteral); undefined when TFI is not set. */
  ivSuggested: number | undefined;
  /** % of TFI reached by feeds; undefined when TFI is not set. */
  pctReached: number | undefined;
  fullFeeds: boolean;
};

/**
 * TFI stays fixed while feeds advance: every ml/kg moved to enteral weans the
 * same from IV. E.g. TFI 100 + enteral 20 -> IV 80, 20% reached.
 */
export function calcTfiSplit(
  tfi: number | undefined,
  enteral: number | undefined,
): TfiSplit {
  const e = Math.max(0, enteral ?? 0);
  if (tfi === undefined || tfi <= 0) {
    return { tfi: undefined, enteral: e, ivSuggested: undefined, pctReached: undefined, fullFeeds: false };
  }
  const ivSuggested = Math.round(Math.max(0, tfi - e) * 10) / 10;
  const pctReached = Math.round((e / tfi) * 1000) / 10;
  return { tfi, enteral: e, ivSuggested, pctReached, fullFeeds: e >= tfi && tfi > 0 };
}

/* --------------------- nutrition / energy auto-calculator ------------------ */
/**
 * Energy density (kcal per ml) of the milks used in the unit.
 * Human-milk values follow the hospital sheet (EBM 0.69 kcal/ml);
 * formula values follow standard dilutions / manufacturer data (see MILK_FORMULARY).
 */
export const KCAL_PER_ML: Record<string, number> = {
  "NPO / Nil per oral": 0,
  "Trophic feeds": 0.69,
  "Expressed breast milk (EBM)": 0.69,
  "Direct breastfeeding": 0.69,
  "Donor human milk": 0.69,
  "EBM + HMF": 0.81,
  "Preterm formula": 0.8,
  "Term formula": 0.67,
  "Aptamil Gold (term formula)": 0.67,
  "Enfamil A+ (term formula)": 0.68,
  "Similac Advance Plus (term formula)": 0.68,
  "Post-discharge formula": 0.73,
  "Similac NeoSure (post-discharge)": 0.744,
  "Neocate (amino-acid formula)": 0.67,
  "Lactose free / hydrolysed formula": 0.68,
};

/** Protein (g per ml). Hospital sheet: EBM 0.015 g/ml. */
export const PROTEIN_G_PER_ML: Record<string, number> = {
  "NPO / Nil per oral": 0,
  "Trophic feeds": 0.015,
  "Expressed breast milk (EBM)": 0.015,
  "Direct breastfeeding": 0.015,
  "Donor human milk": 0.015,
  "EBM + HMF": 0.025,
  "Preterm formula": 0.024,
  "Term formula": 0.014,
  "Aptamil Gold (term formula)": 0.013,
  "Enfamil A+ (term formula)": 0.014,
  "Similac Advance Plus (term formula)": 0.014,
  "Post-discharge formula": 0.019,
  "Similac NeoSure (post-discharge)": 0.0208,
  "Neocate (amino-acid formula)": 0.018,
  "Lactose free / hydrolysed formula": 0.019,
};

/** Feed types that are human milk (the only bases a powder HMF should normally fortify). */
export const HUMAN_MILK_FEEDS = new Set([
  "Trophic feeds",
  "Expressed breast milk (EBM)",
  "Direct breastfeeding",
  "Donor human milk",
  "EBM + HMF",
]);

/** Legacy combined feed type kept for old records — new prescriptions must use an explicit fortifier. */
export const LEGACY_FORTIFIED_FEED = "EBM + HMF";

/** Hospital formulary reference: base milks at standard dilution. */
export type MilkFormularyEntry = {
  label: string;
  kcalPerMl: number;
  proteinPerMl: number;
  group: "Human milk" | "Formula" | "Special" | "None";
  source: string;
};

export const MILK_FORMULARY: MilkFormularyEntry[] = [
  { label: "Expressed breast milk (EBM)", kcalPerMl: 0.69, proteinPerMl: 0.015, group: "Human milk", source: "Hospital sheet" },
  { label: "Direct breastfeeding", kcalPerMl: 0.69, proteinPerMl: 0.015, group: "Human milk", source: "Hospital sheet (= EBM)" },
  { label: "Donor human milk", kcalPerMl: 0.69, proteinPerMl: 0.015, group: "Human milk", source: "Assumed = EBM unless bank data differs" },
  { label: "Trophic feeds", kcalPerMl: 0.69, proteinPerMl: 0.015, group: "Human milk", source: "Hospital sheet (= EBM, small volume)" },
  { label: "Preterm formula", kcalPerMl: 0.8, proteinPerMl: 0.024, group: "Formula", source: "Standard preterm 80 kcal, 2.4 g / 100 ml" },
  { label: "Term formula", kcalPerMl: 0.67, proteinPerMl: 0.014, group: "Formula", source: "Standard term 67 kcal / 100 ml" },
  { label: "Aptamil Gold (term formula)", kcalPerMl: 0.67, proteinPerMl: 0.013, group: "Formula", source: "Standard term 67 kcal / 100 ml" },
  { label: "Enfamil A+ (term formula)", kcalPerMl: 0.68, proteinPerMl: 0.014, group: "Formula", source: "Standard 20 kcal/fl oz dilution" },
  { label: "Similac Advance Plus (term formula)", kcalPerMl: 0.68, proteinPerMl: 0.014, group: "Formula", source: "Standard 20 kcal/fl oz dilution" },
  { label: "Post-discharge formula", kcalPerMl: 0.73, proteinPerMl: 0.019, group: "Formula", source: "Generic post-discharge 73 kcal / 100 ml" },
  { label: "Similac NeoSure (post-discharge)", kcalPerMl: 0.744, proteinPerMl: 0.0208, group: "Formula", source: "Abbott: 744 kcal, 20.83 g protein / 1000 ml" },
  { label: "Neocate (amino-acid formula)", kcalPerMl: 0.67, proteinPerMl: 0.018, group: "Special", source: "Neocate LCP: 67 kcal, 1.8 g / 100 ml" },
  { label: "Lactose free / hydrolysed formula", kcalPerMl: 0.68, proteinPerMl: 0.019, group: "Special", source: "Generic hydrolysed 68 kcal / 100 ml" },
  { label: "NPO / Nil per oral", kcalPerMl: 0, proteinPerMl: 0, group: "None", source: "No enteral intake" },
];

/** Hospital fortifier reference: composition per sachet at standard dilution. */
export type FortifierProduct = {
  id: string;
  label: string;
  short: string;
  kcalPerSachet: number;
  proteinPerSachet: number;
  sachetGrams: number;
  /** Standard dilution, e.g. 25 = 1 sachet per 25 ml (4 sachets / 100 ml). */
  standardMlPerSachet: number;
  /** Safety cap for warnings (sachets per 100 ml of milk). */
  maxSachetsPer100ml: number;
  source: string;
  /** True when the composition is a hospital-sheet estimate — verify against the sachet label. */
  verifyLabel?: boolean;
};

export const FORTIFIER_PRODUCTS: FortifierProduct[] = [
  {
    id: "prenan-hmf",
    label: "PreNAN HMF (Nestlé) — 1 g sachet",
    short: "PreNAN HMF",
    kcalPerSachet: 4.35,
    proteinPerSachet: 0.355,
    sachetGrams: 1,
    standardMlPerSachet: 25,
    maxSachetsPer100ml: 4,
    source: "Nestlé spec: 435 kcal, 35.5 g protein / 100 g powder; standard 1 sachet / 25 ml EBM",
  },
  {
    id: "lactodex-hmf",
    label: "Lactodex HMF / LHMF — 1 g sachet",
    short: "Lactodex HMF",
    kcalPerSachet: 3.9,
    proteinPerSachet: 0.28,
    sachetGrams: 1,
    standardMlPerSachet: 25,
    maxSachetsPer100ml: 4,
    source: "Hospital-sheet estimate — confirm against the sachet label",
    verifyLabel: true,
  },
  {
    id: "mmf-plus",
    label: "MMF Plus (NeoLact, human-milk derived)",
    short: "MMF Plus",
    kcalPerSachet: 4.0,
    proteinPerSachet: 0.3,
    sachetGrams: 1,
    standardMlPerSachet: 25,
    maxSachetsPer100ml: 4,
    source: "Hospital-sheet estimate — confirm against the sachet label",
    verifyLabel: true,
  },
  {
    id: "smartfort-hmf",
    label: "Smart Fort HMF — 1 g sachet",
    short: "Smart Fort HMF",
    kcalPerSachet: 3.9,
    proteinPerSachet: 0.28,
    sachetGrams: 1,
    standardMlPerSachet: 25,
    maxSachetsPer100ml: 4,
    source: "Hospital-sheet estimate — confirm against the sachet label",
    verifyLabel: true,
  },
  {
    id: "custom",
    label: "Other / custom fortifier (enter per-unit values)",
    short: "Custom fortifier",
    kcalPerSachet: 0,
    proteinPerSachet: 0,
    sachetGrams: 1,
    standardMlPerSachet: 25,
    maxSachetsPer100ml: 4,
    source: "Clinician-entered per-unit values",
  },
];

export function fortifierById(id: string | undefined): FortifierProduct | undefined {
  if (!id) return undefined;
  return FORTIFIER_PRODUCTS.find((p) => p.id === id);
}

export type FortificationCalc = {
  status: "none" | "incomplete" | "active";
  /** Short product label, or "" when none selected. */
  productLabel: string;
  /** Sachet-equivalents dissolved in the stated mixed volume. */
  sachets: number;
  mixedVolumeMl: number;
  sachetsPer100ml: number;
  standardSachetsPer100ml: number;
  /** % of standard strength (100 = full fortification). */
  strengthPct: number;
  addedKcalPerMl: number;
  addedProteinPerMl: number;
  warnings: string[];
  notes: string[];
  /** Human-readable reason when status is "incomplete". */
  missing?: string;
};

/**
 * Rectified fortification math.
 * The prescription states an amount dissolved in a mixed volume; the resulting
 * CONCENTRATION (sachets / 100 ml) is what scales to the baby's enteral intake.
 * Returns per-ml additions that calcNutrition adds to the base milk density.
 */
export function calcFortification(f: NonNullable<Clinical["fluids"]>): FortificationCalc {
  const blank: FortificationCalc = {
    status: "none",
    productLabel: "",
    sachets: 0,
    mixedVolumeMl: 0,
    sachetsPer100ml: 0,
    standardSachetsPer100ml: 4,
    strengthPct: 0,
    addedKcalPerMl: 0,
    addedProteinPerMl: 0,
    warnings: [],
    notes: [],
  };
  const product = fortifierById(f.fortificationProductId);
  const hasAmount = f.fortificationAmount !== undefined && f.fortificationAmount > 0;
  const hasVolume = f.fortificationFeedVolumeMl !== undefined && f.fortificationFeedVolumeMl > 0;

  // Legacy free-text entries (recorded before products existed) cannot be auto-calculated.
  if (!product) {
    if (f.fortificationName?.trim() || hasAmount || hasVolume) {
      return {
        ...blank,
        status: "incomplete",
        productLabel: f.fortificationName?.trim() || "",
        missing: "Legacy free-text fortifier entry — select the matching product below so its calories and protein are included.",
      };
    }
    return blank;
  }

  const isCustom = product.id === "custom";
  const kcalPerUnit = isCustom ? (f.fortificationKcalPerUnit ?? 0) : product.kcalPerSachet;
  const proteinPerUnit = isCustom ? (f.fortificationProteinPerUnit ?? 0) : product.proteinPerSachet;
  const sachetGrams = f.fortificationSachetGrams && f.fortificationSachetGrams > 0
    ? f.fortificationSachetGrams
    : product.sachetGrams;
  const unit = f.fortificationAmountUnit ?? "sachet";
  const amount = f.fortificationAmount ?? 0;

  if (!hasAmount || !hasVolume) {
    return {
      ...blank,
      status: "incomplete",
      productLabel: product.short,
      missing: !hasAmount && !hasVolume
        ? `Enter the ${product.short} amount and the mixed volume.`
        : !hasAmount
          ? `Enter the ${product.short} amount.`
          : `Enter the feed volume (ml) the ${product.short} is mixed in.`,
    };
  }
  if (isCustom && !(kcalPerUnit > 0)) {
    return {
      ...blank,
      status: "incomplete",
      productLabel: product.short,
      missing: "Enter the custom fortifier's kcal per unit (per sachet/g/scoop, or per ml for liquids).",
    };
  }
  // Standard powder products are dosed in sachet-equivalents; liquids need explicit per-ml values.
  if (!isCustom && unit === "ml") {
    return {
      ...blank,
      status: "incomplete",
      productLabel: product.short,
      missing: "Liquid amount with a powder product — use sachet/g, or switch to Custom with per-ml values.",
    };
  }

  const notes: string[] = [];
  let sachets: number;
  if (unit === "g") {
    sachets = amount / sachetGrams;
    if (sachetGrams !== product.sachetGrams) notes.push(`1 sachet assumed = ${sachetGrams} g (custom size).`);
  } else if (unit === "scoop" || unit === "measure") {
    sachets = amount;
    notes.push(`1 ${unit} assumed = 1 sachet-equivalent — confirm against the scoop/measure size.`);
  } else if (unit === "ml" && isCustom) {
    // Custom liquid: per-unit values are per ml; express strength in "sachet-equivalents"
    // so the rest of the math (per-ml additions) stays identical.
    sachets = amount; // ml of liquid
    notes.push("Custom liquid: per-unit values applied per ml.");
  } else {
    sachets = amount;
  }

  const mixedVolumeMl = f.fortificationFeedVolumeMl ?? 0;
  const warnings: string[] = [];
  if (mixedVolumeMl < 10) warnings.push(`Mixed volume only ${mixedVolumeMl} ml — check the preparation (usually 25–100 ml per sachet).`);
  if (sachets > 20 && !(unit === "ml" && isCustom)) warnings.push(`${sachets} sachet-equivalents is unusually large — check sachets vs grams.`);

  let sachetsPer100ml: number;
  let addedKcalPerMl: number;
  let addedProteinPerMl: number;
  if (unit === "ml" && isCustom) {
    // Liquid: amount ml contains kcalPerUnit per ml, diluted into mixedVolumeMl of milk.
    const liquidMl = amount;
    addedKcalPerMl = Math.round(((liquidMl * kcalPerUnit) / mixedVolumeMl) * 10000) / 10000;
    addedProteinPerMl = Math.round(((liquidMl * (proteinPerUnit ?? 0)) / mixedVolumeMl) * 10000) / 10000;
    sachetsPer100ml = Math.round(((liquidMl / mixedVolumeMl) * 100) * 100) / 100; // ml per 100 ml, for display
  } else {
    sachetsPer100ml = Math.round((sachets / mixedVolumeMl) * 100 * 100) / 100;
    addedKcalPerMl = Math.round(sachetsPer100ml * kcalPerUnit * 100) / 10000;
    addedProteinPerMl = Math.round(sachetsPer100ml * (proteinPerUnit ?? 0) * 100) / 10000;
  }

  const standardSachetsPer100ml = Math.round((100 / product.standardMlPerSachet) * 100) / 100;
  const strengthPct = standardSachetsPer100ml > 0 && !(unit === "ml" && isCustom)
    ? Math.round((sachetsPer100ml / standardSachetsPer100ml) * 100)
    : 0;

  if (!(unit === "ml" && isCustom)) {
    if (sachetsPer100ml > product.maxSachetsPer100ml * 1.5) {
      warnings.push(`Very high fortification (${sachetsPer100ml} / 100 ml vs standard ${standardSachetsPer100ml}) — hyperosmolality / NEC risk, confirm prescription.`);
    } else if (sachetsPer100ml > product.maxSachetsPer100ml) {
      warnings.push(`Above standard strength (${sachetsPer100ml} / 100 ml vs standard ${standardSachetsPer100ml}) — osmolality rises steeply, confirm prescription.`);
    }
    if (strengthPct > 0 && strengthPct < 50) {
      notes.push(`Half-strength fortification (${strengthPct}% of standard) — often a deliberate tolerance step.`);
    }
  }
  if (product.verifyLabel) notes.push(`${product.short} composition is a hospital-sheet estimate — verify against the sachet label.`);

  return {
    status: "active",
    productLabel: product.short,
    sachets: Math.round(sachets * 100) / 100,
    mixedVolumeMl,
    sachetsPer100ml,
    standardSachetsPer100ml,
    strengthPct,
    addedKcalPerMl,
    addedProteinPerMl,
    warnings,
    notes,
  };
}

export type NutritionCalc = {
  feedType: string;
  /** EFFECTIVE density incl. fortifier (what the baby actually receives per ml). */
  density: number;
  /** EFFECTIVE protein per ml incl. fortifier. */
  proteinPerMl: number;
  /** Base milk density before fortifier. */
  baseDensity: number;
  baseProteinPerMl: number;
  densityAssumed: boolean;
  enteralMl: number;
  enteralKcal: number;
  enteralProtein: number;
  baseEnteralKcal: number;
  baseEnteralProtein: number;
  fortStatus: FortificationCalc["status"];
  fortLabel: string;
  fortSachetsPer100ml: number;
  fortKcalPerMl: number;
  fortProteinPerMl: number;
  fortKcal: number;
  fortProtein: number;
  /** Protein : energy ratio (g protein / 100 kcal). Optimal 2.8–3.4. */
  peRatio: number;
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

/** Auto-compute kcal/kg/day and protein g/kg/day from the current feed + fortifier + TPN prescription. */
export function calcNutrition(c: Clinical): NutritionCalc {
  const f = c.fluids ?? {};
  const feedType = f.feedType ?? "—";
  const fort = calcFortification(f);
  // Legacy "EBM + HMF" records already bake in an assumed fortification; once an
  // explicit fortifier product is prescribed, the base reverts to plain EBM so the
  // fortifier is counted exactly once.
  const legacyWithExplicitFortifier = feedType === LEGACY_FORTIFIED_FEED && fort.status === "active";
  const baseKey = legacyWithExplicitFortifier ? "Expressed breast milk (EBM)" : feedType;
  const densityAssumed = KCAL_PER_ML[baseKey] === undefined;
  const baseDensity = KCAL_PER_ML[baseKey] ?? 0.69;
  const baseProtPerMl = PROTEIN_G_PER_ML[baseKey] ?? 0.015;
  // EFFECTIVE density = base milk + fortifier concentration. This is the mistake
  // the old code made: fortification was recorded but added 0 kcal / 0 protein.
  const density = Math.round((baseDensity + fort.addedKcalPerMl) * 10000) / 10000;
  const protPerMl = Math.round((baseProtPerMl + fort.addedProteinPerMl) * 10000) / 10000;

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

  const baseEnteralKcal = Math.round(enteralMl * baseDensity * 10) / 10;
  const baseEnteralProtein = Math.round(enteralMl * baseProtPerMl * 100) / 100;
  const fortKcal = Math.round(enteralMl * fort.addedKcalPerMl * 10) / 10;
  const fortProtein = Math.round(enteralMl * fort.addedProteinPerMl * 100) / 100;
  const enteralKcal = Math.round((baseEnteralKcal + fortKcal) * 10) / 10;
  const enteralProtein = Math.round((baseEnteralProtein + fortProtein) * 100) / 100;

  // Total IV kcal = dextrose + AA + lipid (TPN)
  const ivKcal = Math.round((dextroseKcal + aaKcal + lipidKcal) * 10) / 10;
  // Total = enteral + IV
  const totalKcal = Math.round((enteralKcal + ivKcal) * 10) / 10;
  const totalProtein = Math.round((enteralProtein + aaG) * 100) / 100;

  const kcalTarget: [number, number] = [110, 135];
  const proteinTarget: [number, number] = [3.5, 4.5]; // widened to 3.5-4.5 for preterm, was 3.5-4

  const warnings: string[] = [];
  if (densityAssumed && feedType !== "—") warnings.push(`Unknown feed type “${feedType}” — assumed EBM density 0.69 kcal/ml; pick a formulary feed.`);
  if (feedType === LEGACY_FORTIFIED_FEED && fort.status !== "active") {
    warnings.push("“EBM + HMF” is a legacy estimate (0.81 kcal/ml) — prescribe the fortifier product below for exact kcal/protein.");
  }
  if (legacyWithExplicitFortifier) warnings.push("Legacy “EBM + HMF” feed type overridden by the explicit fortifier prescription (counted once).");
  for (const w of fort.warnings) warnings.push(`Fortification: ${w}`);
  if (fort.status === "incomplete" && fort.missing) warnings.push(`Fortification incomplete — ${fort.missing} Calories shown exclude the fortifier.`);
  if (fort.status === "active" && !HUMAN_MILK_FEEDS.has(feedType)) {
    warnings.push(`Fortifier prescribed on top of “${feedType}” — HMF is normally added to human milk only; confirm prescription.`);
  }
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

  // Protein : energy ratio (ESPGHAN optimal 2.8–3.4 g / 100 kcal) — only meaningful once intake is substantial.
  const peRatio = totalKcal >= 40 ? Math.round((totalProtein / totalKcal) * 100 * 10) / 10 : 0;
  if (fort.status === "active" && totalKcal >= 80 && (peRatio < 2.5 || peRatio > 3.8)) {
    warnings.push(`Protein:energy ratio ${peRatio} g/100 kcal is outside the optimal 2.8–3.4 — review fortification strength.`);
  }

  const isAbnormal = warnings.length > 0;

  return {
    feedType,
    density,
    proteinPerMl: protPerMl,
    baseDensity,
    baseProteinPerMl: baseProtPerMl,
    densityAssumed,
    enteralMl,
    enteralKcal,
    enteralProtein,
    baseEnteralKcal,
    baseEnteralProtein,
    fortStatus: fort.status,
    fortLabel: fort.productLabel,
    fortSachetsPer100ml: fort.sachetsPer100ml,
    fortKcalPerMl: fort.addedKcalPerMl,
    fortProteinPerMl: fort.addedProteinPerMl,
    fortKcal,
    fortProtein,
    peRatio,
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
