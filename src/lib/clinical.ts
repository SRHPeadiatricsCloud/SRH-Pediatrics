import { targetsFor, type ProtocolOverrides } from "./feed-guide";
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

/**
 * How a baby left the unit. Mirrors the `babies.status` column, which already
 * carries these values — this type just keeps the UI honest about them.
 */
export type DischargeOutcome = "discharged" | "transferred" | "death";

export const DISCHARGE_OUTCOMES: readonly DischargeOutcome[] = ["discharged", "transferred", "death"];

/**
 * The administrative discharge record, written once when a baby is marked as
 * discharged and kept with the chart for MRD retention.
 *
 * Kept separate from `Clinical.discharge` (the discharge-readiness criteria
 * checklist) and from `babies.status` (the board filter).
 */
export type DischargeRecord = {
  /** Full timestamp of when the discharge was signed. */
  at: string;
  /** Local calendar day, YYYY-MM-DD — the grouping key for day/month archives. */
  date: string;
  outcome: DischargeOutcome;
  /** Free-text condition at discharge / instructions given. */
  summary: string;
  /** Who signed the discharge. */
  signedBy: string;
  /** Snapshot values, so the record still reads correctly if the card changes. */
  weightAtDischarge?: number;
  bedAtDischarge?: string;
  unitAtDischarge?: string;
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
    /** Which stocked product this is — resolves default values and dose steps. */
    fortifierProductId?: string;
    fortificationAmount?: number;
    fortificationAmountUnit?: "sachet" | "g" | "ml" | "scoop" | "measure";
    fortificationFeedVolumeMl?: number;
    /**
     * How many feeds per day the fortifier is actually given in. Fortification
     * is not usually added to every feed, so the uplift is scaled by
     * doses/day ÷ feeds/day — recording "0.5 g twice a day" must not credit the
     * whole day's enteral volume with the fortifier.
     *
     * Absent means every feed is fortified, which preserves older records.
     */
    fortificationDosesPerDay?: number;
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
    /**
     * Bedside tolerance record for the current 24 h. `lastFeedAt` drives the
     * feed-due clock (it is the only field here that is a timestamp), and a
     * held feed or a residual prompts a review before the next increase.
     */
    lastFeedAt?: string;
    residualMl?: number;
    feedsHeldToday?: number;
    feedNotes?: string;
    /**
     * The unit's own protocol figures, replacing the published guidance for this
     * baby. Anything unset falls back to the published value, so an empty or
     * absent object behaves exactly as before.
     */
    protocol?: ProtocolOverrides;
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
  /** Discharge-readiness criteria checklist — ticked items, not the discharge event. */
  discharge?: string[];
  /**
   * The signed discharge record. Distinct from `discharge` above; see
   * DischargeRecord. Present only once a baby has been marked as discharged.
   */
  dischargeRecord?: DischargeRecord;
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

/** How a fortifier is measured at the bedside — a sachet, or weighed powder. */
export type FortifierUnit = "sachet" | "g";

/**
 * A fortifier / concentrated formula as the unit actually uses it.
 *
 * `kcalPerUnit` and `proteinPerUnit` are per ONE unit of `unit` — i.e. per 1 g
 * sachet, or per gram of powder — never per 100 g, so the bedside arithmetic
 * stays a single multiplication.
 */
export type FortifierProduct = {
  id: string;
  name: string;
  unit: FortifierUnit;
  kcalPerUnit: number;
  proteinPerUnit: number;
  /** Volume of milk one unit is nominally mixed into. */
  mixedWithMl: number;
  /** Dose steps the bedside actually uses, in units. */
  steps: readonly number[];
  /** Human label for a step, e.g. 0.25 -> "1/4 sachet". */
  stepLabel: (n: number) => string;
  note: string;
};

const sachetLabel = (n: number) =>
  n === 1 ? "1 sachet" : n === 0.5 ? "1/2 sachet" : n === 0.25 ? "1/4 sachet" : `${n} sachet`;
const gramLabel = (n: number) => `${n} g`;

/**
 * Products stocked in the unit.
 *
 * All values are per ONE unit of `unit`, so the bedside arithmetic is a single
 * multiplication. Sources:
 *  - Lactodex HMF (Raptakos Brett) and NeoLact MMF Plus: per 1 g sachet, from
 *    the published comparison of Indian multicomponent fortifiers (Cureus 2025,
 *    "Balancing Nutrition and Osmolality…", Table 1) cross-checked against the
 *    pack label. Lactodex 3.37 kcal / 0.27 g protein; MMF Plus 3.89 kcal /
 *    0.27 g protein. Both are reconstituted 1 sachet in 25 ml of milk.
 *  - PreNAN HMF (Nestlé) sachet: 4 kcal / 0.3 g protein per 1 g, same table.
 *  - PreNAN FM 85: 435 kcal and 35.5 g protein per 100 g powder (label).
 *  - Neocate Infant: the mixing chart states 1 g provides 4.87 kcal; protein
 *    is 13.5 g per 483 kcal, so 0.136 g per gram.
 *  - Similac NeoSure: 513 kcal and 15 g protein per 100 g powder.
 *
 * Every value is still overridable per baby via fortifierKcalPerUnit /
 * fortifierProteinPerUnit — labels and lot formulations differ, and the record
 * on the chart must win over a table here.
 */
export const FORTIFIER_CATALOG: readonly FortifierProduct[] = [
  {
    id: "prenan-hmf",
    name: "PreNAN HMF (Nestlé) — 1 g sachet",
    unit: "sachet",
    kcalPerUnit: 4,
    proteinPerUnit: 0.3,
    mixedWithMl: 25,
    steps: [0.25, 0.5, 1],
    stepLabel: sachetLabel,
    note: "1 g sachet in 25 ml milk · 4 kcal, 0.3 g protein, Ca 15.9 mg, P 8.8 mg, Na 7.3 mg per sachet",
  },
  {
    id: "lhmf",
    name: "Lactodex HMF (Raptakos Brett) — 1 g sachet",
    unit: "sachet",
    kcalPerUnit: 3.37,
    proteinPerUnit: 0.27,
    mixedWithMl: 25,
    steps: [0.25, 0.5, 1],
    stepLabel: sachetLabel,
    note: "1 g sachet in 25 ml milk · 3.37 kcal, 0.27 g protein, Ca 15.8 mg, P 7.9 mg, Na 1.9 mg, Fe 0.03 mg per sachet · bovine-derived",
  },
  {
    id: "mmf",
    name: "NeoLact MMF Plus (Mother's Milk Fortifier) — 1 g sachet",
    unit: "sachet",
    kcalPerUnit: 3.89,
    proteinPerUnit: 0.27,
    mixedWithMl: 25,
    steps: [0.25, 0.5, 1],
    stepLabel: sachetLabel,
    note: "1 g sachet in 25 ml milk · 3.89 kcal, 0.27 g protein, Ca 6 mg, P 1.4 mg, Na 2.2 mg per sachet · human-milk derived, maltodextrin-free",
  },
  {
    id: "prenan-fm85",
    name: "PreNAN FM 85 (Nestlé) — powder",
    unit: "sachet",
    kcalPerUnit: 4.35,
    proteinPerUnit: 0.355,
    mixedWithMl: 25,
    steps: [0.25, 0.5, 1],
    stepLabel: sachetLabel,
    note: "per 1 g of powder · 435 kcal and 35.5 g protein per 100 g · preterm follow-up formula, not a HMF sachet",
  },
  {
    id: "neocate",
    name: "Neocate Infant (amino-acid based)",
    unit: "g",
    kcalPerUnit: 4.87,
    proteinPerUnit: 0.136,
    mixedWithMl: 100,
    steps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5],
    stepLabel: gramLabel,
    note: "4.87 kcal and 0.136 g protein equivalent per gram of powder",
  },
  {
    id: "neosure",
    name: "Similac NeoSure (post-discharge preterm)",
    unit: "g",
    kcalPerUnit: 5.13,
    proteinPerUnit: 0.15,
    mixedWithMl: 100,
    steps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5],
    stepLabel: gramLabel,
    note: "513 kcal and 15 g protein per 100 g powder · 74 kcal and 2.1 g protein per 100 ml at standard dilution",
  },
];

export function fortifierById(id: string | undefined): FortifierProduct | undefined {
  return FORTIFIER_CATALOG.find((p) => p.id === id);
}

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
  /** kcal/ml added to the base milk, spread across the whole day's feeds. */
  fortKcalPerMl: number;
  /** g protein/ml added to the base milk, spread across the whole day's feeds. */
  fortProteinPerMl: number;
  /** kcal/ml inside a single fortified feed (before spreading over the day). */
  fortKcalPerMlInFeed: number;
  /** g protein/ml inside a single fortified feed. */
  fortProteinPerMlInFeed: number;
  /** Stocked product the per-unit values came from, if one was selected. */
  fortProduct: FortifierProduct | null;
  /** Feeds per day the fortifier is given in. */
  fortDosesPerDay: number;
  /** Total feeds per day implied by the feed frequency. */
  fortFeedsPerDay: number | undefined;
  /** Fraction of the day's enteral volume that is fortified, 0-1. */
  fortFraction: number;
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
  /** Total fluid target, ml/kg/day — the day ramp early on, full feeds later. */
  fluidsTarget: [number, number];
  /** What sized these targets, e.g. "751–1000 g, day 4 ramp". */
  targetsBasis: string;
  kcalDeficit: number;
  proteinDeficit: number;
  /** Total fluids short of (negative) or above (positive) the target. */
  fluidsGap: number;
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
  if (f.ivMlKgDay !== undefined && f.ivMlKgDay > 250) {
    notes.push(`IV ${f.ivMlKgDay} ml/kg/day exceeds the 250 cap — clamped`);
  }
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
/**
 * @param weightG current weight in grams. Optional for backwards compatibility,
 *   but without it a fortifier dose cannot be converted from "0.5 g twice a
 *   day" into an absolute daily amount, so the uplift falls back to assuming
 *   the fortified feeds are an equal share of the day.
 */
/**
 * @param ctx Optional day of life, which moves the fluid target onto the
 *            day-by-day ramp instead of measuring a day-1 baby against full
 *            feeds. Energy and protein targets come from the weight alone.
 */
export function calcNutrition(c: Clinical, weightG?: number, ctx?: { dol?: number; protocol?: ProtocolOverrides | null }): NutritionCalc {
  const f = c.fluids ?? {};
  const feedType = f.feedType ?? "—";
  const density = KCAL_PER_ML[feedType] ?? 0.67;
  const protPerMl = PROTEIN_G_PER_ML[feedType] ?? 0.011;

  // --- Feed plan: TFI target split into today's enteral + IV volumes ---
  // The weight goes in so per-feed volumes resolve for every caller, not just
  // the feed tab that happens to pass one.
  const weightKg = weightG != null && weightG > 0 ? weightG / 1000 : undefined;
  const plan = resolveFeedPlan(f, weightKg);

  const warnings: string[] = [];
  // The plan's own findings (TFI clamped, total above target, no frequency to
  // split the day) have to travel with the calculation: the discharge, print
  // and daily-progress views only ever see `warnings`, never `plan.notes`.
  warnings.push(...plan.notes);

  // --- Input sanitization with physiological limits ---
  const rawEnteral = plan.active && plan.enteralMlKgDay !== undefined ? plan.enteralMlKgDay : f.enteralMlKgDay ?? 0;
  const enteralMl = clampMl(rawEnteral); // cap 250 ml/kg/day
  if (rawEnteral > 250) {
    warnings.push(`Enteral ${rawEnteral} ml/kg/day is above the 250 cap — the calculation used 250, check the entry`);
  }

  const rawIv = plan.active && plan.ivMlKgDay !== undefined ? plan.ivMlKgDay : f.ivMlKgDay ?? 0;
  const ivMl = clampMl(rawIv);
  // An IV entry above the cap is already reported by the feed plan's notes,
  // which travel with these warnings — no second copy of the same message.

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

  // --- Feed type: the density behind every enteral kcal and gram of protein --
  // An unrecognised feed type silently falls back to EBM values, which is the
  // single quietest way to get the wrong answer on this screen. Say so.
  if (f.feedType === undefined || f.feedType.trim() === "") {
    if (enteralMl > 0) {
      warnings.push(
        `No feed type chosen — the ${enteralMl} ml/kg/day of feeds is priced as EBM at ${density} kcal/ml and ${protPerMl} g protein/ml`,
      );
    }
  } else if (!(feedType in KCAL_PER_ML)) {
    warnings.push(
      `"${feedType}" is not in the milk density table — using ${density} kcal/ml and ${protPerMl} g protein/ml. Pick a listed feed type or the energy and protein will be wrong`,
    );
  }

  // --- Fortification: uplift the milk density from the recorded preparation ---
  // The product sets the per-unit values; amount ÷ volume it was mixed into
  // gives the concentration inside a fortified feed, and doses/day ÷ feeds/day
  // scales that across the whole day's enteral volume. Without that last step
  // "0.5 g given twice a day" would be credited to every feed the baby gets.
  const fortProduct = fortifierById(f.fortifierProductId);
  const fortAmount = f.fortificationAmount ?? 0;
  const fortMixedMl = f.fortificationFeedVolumeMl || fortProduct?.mixedWithMl || 0;
  const kcalPerUnit = f.fortifierKcalPerUnit ?? fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT;
  const proteinPerUnit = f.fortifierProteinPerUnit ?? fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT;
  const fortified = fortAmount > 0;
  if (fortified && /hmf|fortif/i.test(feedType)) {
    warnings.push(
      `Feed type "${feedType}" is already priced as fortified milk at ${density} kcal/ml — recording a fortifier as well counts it twice. Use plain EBM as the feed type, or remove the fortifier entry`,
    );
  }

  const fortFeedsPerDay = feedsPerDay(f.feedFreq);
  const fortDosesPerDay = fortified ? (f.fortificationDosesPerDay ?? fortFeedsPerDay ?? 1) : 0;
  let fortFraction = fortified ? 1 : 0;
  if (fortified && fortFeedsPerDay && fortDosesPerDay > fortFeedsPerDay) {
    warnings.push(
      `Fortifier is recorded for ${fortDosesPerDay} feeds/day but "${f.feedFreq}" only gives ${fortFeedsPerDay} feeds/day — check the dose count`,
    );
  }

  // Concentration inside a fortified feed, and the same spread over the day.
  let fortKcalPerMl = 0;
  let fortProteinPerMl = 0;
  let fortKcalPerMlEffective = 0;
  let fortProteinPerMlEffective = 0;
  if (fortified && fortMixedMl > 0) {
    fortKcalPerMl = (fortAmount * kcalPerUnit) / fortMixedMl;
    fortProteinPerMl = (fortAmount * proteinPerUnit) / fortMixedMl;
    // How much of the day's enteral volume is actually the fortified mixture:
    // mixed volume × doses/day, which needs the weight to express per kg.
    if (fortDosesPerDay === 1 && f.fortificationDosesPerDay === undefined && fortFeedsPerDay === undefined) {
      warnings.push(
        `"Times per day" is not set and "${f.feedFreq ?? "no frequency"}" gives no fixed number of feeds, so only 1 dose/day of fortifier has been counted — enter how many times a day it is given`,
      );
    }
    if (weightKg) {
      const fortifiedMlPerKgDay = (fortMixedMl * fortDosesPerDay) / weightKg;
      if (enteralMl <= 0) {
        warnings.push(
          "A fortifier is recorded but there is no enteral volume — enter the enteral ml/kg/day so its energy and protein can be counted",
        );
      } else if (fortifiedMlPerKgDay > enteralMl + 0.001) {
        warnings.push(
          `Fortifier mix volume ${fortMixedMl} ml × ${fortDosesPerDay} dose(s)/day exceeds the recorded enteral volume — the uplift is capped at the enteral volume`,
        );
      }
      fortFraction = enteralMl > 0 ? Math.min(1, fortifiedMlPerKgDay / enteralMl) : 0;
    } else {
      // No weight on record: fall back to the share of feeds that are fortified,
      // and say so — without a weight the fortified share cannot be checked
      // against the enteral volume, so this is an upper bound.
      fortFraction = fortFeedsPerDay
        ? Math.max(0, Math.min(1, fortDosesPerDay / fortFeedsPerDay))
        : 1;
      warnings.push(
        `No weight on record — the fortifier is credited to ${(fortFraction * 100).toFixed(0)}% of the enteral volume, which is an upper bound until the weight is entered`,
      );
    }
    fortKcalPerMlEffective = fortKcalPerMl * fortFraction;
    fortProteinPerMlEffective = fortProteinPerMl * fortFraction;
  } else if (fortified) {
    warnings.push(
      "Fortifier recorded without a mixed volume — enter \"Feed volume mixed (ml)\" so its energy and protein are counted",
    );
  }
  const effectiveKcalPerMl = density + fortKcalPerMlEffective;
  const effectiveProteinPerMl = protPerMl + fortProteinPerMlEffective;

  const enteralKcal = Math.round(enteralMl * effectiveKcalPerMl * 10) / 10;
  const fortKcal = Math.round(enteralMl * fortKcalPerMlEffective * 10) / 10;
  const milkKcal = Math.round((enteralKcal - fortKcal) * 10) / 10;
  const enteralProtein = Math.round(enteralMl * effectiveProteinPerMl * 100) / 100;
  const fortProtein = Math.round(enteralMl * fortProteinPerMlEffective * 100) / 100;
  const milkProtein = Math.round((enteralProtein - fortProtein) * 100) / 100;

  // Total IV kcal = dextrose + AA + lipid (TPN)
  const ivKcal = Math.round((dextroseKcal + aaKcal + lipidKcal) * 10) / 10;
  // Total energy = enteral (milk + fortifier) + IV (dextrose + AA + lipid)
  const totalKcal = Math.round((enteralKcal + ivKcal) * 10) / 10;
  // Total protein = enteral (milk + fortifier) + IV amino acids + lipid (0)
  const lipidProtein = Math.round(lipidG * LIPID_PROTEIN_G_PER_G * 100) / 100;
  const totalProtein = Math.round((enteralProtein + aaG + lipidProtein) * 100) / 100;

  // Targets follow the baby's size and day of life rather than one fixed
  // preterm pair — a 600 g microprem and a 2.2 kg growing preterm are not
  // aiming at the same numbers.
  const targets = targetsFor({ weightG, dol: ctx?.dol, protocol: c.fluids?.protocol ?? ctx?.protocol });
  const kcalTarget = targets.kcal;
  const proteinTarget = targets.protein;
  const fluidsTarget = targets.fluids;

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
  if ((f.dextrosePct ?? 0) > 0 && ivMl <= 0 && !f.girManual) {
    warnings.push(
      `Dextrose ${f.dextrosePct}% is recorded with no IV volume — the dextrose energy cannot be calculated until "IV ml/kg/d" is filled in`,
    );
  }
  if (f.girManual && derivedGir > 0 && Math.abs(storedGir - derivedGir) >= 1) {
    warnings.push(
      `Manual GIR ${storedGir} mg/kg/min disagrees with ${derivedGir} derived from dextrose ${f.dextrosePct}% × IV ${ivMl} ml/kg/day — one of the two is wrong`,
    );
  }
  if (totalKcal > 0 && totalKcal < 80) {
    warnings.push(`Low energy ${totalKcal} kcal/kg/day (<80) — below basal needs`);
  } else if (totalKcal > 0 && totalKcal < kcalTarget[0]) {
    warnings.push(
      `Energy ${totalKcal} kcal/kg/day is below the ${kcalTarget[0]}–${kcalTarget[1]} target for ${targets.basis}`,
    );
  }
  if (totalKcal > kcalTarget[1]) {
    warnings.push(`High energy ${totalKcal} kcal/kg/day — above the ${kcalTarget[0]}–${kcalTarget[1]} target for ${targets.basis}`);
  }
  if (totalProtein > 0 && totalProtein < proteinTarget[0]) {
    warnings.push(`Protein ${totalProtein} g/kg/day is below the ${proteinTarget[0]}–${proteinTarget[1]} target for ${targets.basis}`);
  }
  if (totalProtein > 0 && totalProtein < 2) warnings.push(`Low protein ${totalProtein} g/kg/day (<2) — inadequate for growth`);
  if (totalProtein > 5) warnings.push(`High protein ${totalProtein} g/kg/day (>5) — exceeds safe limit, check AA + enteral`);

  // Detect gross errors from old logic: if totalKcal >300 or protein >10 likely data entry error (e.g., ml/day entered as ml/kg/day)
  if (totalKcal > 300) warnings.push(`Grossly high energy ${totalKcal} — likely ml/day entered as ml/kg/day, please check weight and volumes`);
  if (totalProtein > 10) warnings.push(`Grossly high protein ${totalProtein} — likely unit error, check AA g/kg/day vs ml/kg/day`);

  const totalFromInputs = Math.round((enteralMl + ivMl) * 10) / 10;
  if (!plan.active && f.totalMlKgDay !== undefined && Math.abs(f.totalMlKgDay - totalFromInputs) > 1) {
    warnings.push(
      `Recorded total fluids ${f.totalMlKgDay} ml/kg/day does not match enteral ${enteralMl} + IV ${ivMl} = ${totalFromInputs} — check which one is current`,
    );
  }
  if (f.kcalManual === true && f.kcal !== undefined && Math.abs(f.kcal - totalKcal) > 5) {
    warnings.push(
      `This chart carries a manual energy of ${f.kcal} kcal/kg/day but the inputs calculate ${totalKcal} — reset to automatic or correct the inputs`,
    );
  }

  const totalFluidsValue = plan.active
    ? Math.round((enteralMl + ivMl) * 10) / 10
    : f.totalMlKgDay ?? Math.round((enteralMl + ivMl) * 10) / 10;
  if (totalFluidsValue > fluidsTarget[1] + 10) {
    warnings.push(
      `Total fluids ${totalFluidsValue} ml/kg/day is more than 10 above the ${fluidsTarget[0]}–${fluidsTarget[1]} target for ${targets.basis}`,
    );
  }

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
    totalFluids: totalFluidsValue,
    ivMl,
    fortified,
    // Spread across the whole day, so effectiveKcalPerMl = density + this.
    fortKcalPerMl: Math.round(fortKcalPerMlEffective * 1000) / 1000,
    fortProteinPerMl: Math.round(fortProteinPerMlEffective * 10000) / 10000,
    // Concentration inside a single fortified feed, for the readout. Kept at
    // 5 dp because a small fortifier uplift rounds away almost entirely at 3.
    fortKcalPerMlInFeed: Math.round(fortKcalPerMl * 100000) / 100000,
    fortProteinPerMlInFeed: Math.round(fortProteinPerMl * 100000) / 100000,
    fortProduct: fortProduct ?? null,
    fortDosesPerDay,
    fortFeedsPerDay,
    fortFraction: Math.round(fortFraction * 1000) / 1000,
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
    fluidsTarget,
    targetsBasis: targets.basis,
    fluidsGap: Math.round((totalFluidsValue - fluidsTarget[0]) * 10) / 10,
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
