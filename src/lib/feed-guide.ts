/**
 * Feeding guidance for a Level 3B NICU: babies from 24 weeks / 500 g through to
 * discharge. Pure functions, no UI, so the numbers can be tested and argued
 * with.
 *
 * What is encoded here, and where it comes from:
 *
 *  Day-1 fluid by birth weight — WHO 2022 preterm feeding guidance and the UC
 *  Davis NICU nutrition guideline (2025): ≥1500 g start 60–80 ml/kg/day,
 *  1000–1500 g 80–100, 750–1000 g 100–130, <750 g 130+ (higher insensible loss).
 *  Ramp +20 ml/kg/day to day 3, then +30 ml/kg/day (faster advancement reaches
 *  full feeds sooner without more NEC — Cochrane, and Patel et al. Nutrients
 *  2015 for <1 kg starting nutritional feeds at 15–20 and ≥1 kg at 30).
 *
 *  Full feeds — 150–160 ml/kg/day, 160–180 for the <750 g band.
 *
 *  Feed interval — 2-hourly below 1250 g, 3-hourly above (Patel et al. 2015;
 *  Indian Pediatrics 2021 RCT found 3-hourly non-inferior in 1000–1500 g).
 *
 *  Fortification — start when enteral intake reaches 100 ml/kg/day, half
 *  strength (1:50) for 48 h, then full strength 1:25 (Patel et al. 2015).
 *
 *  Parenteral — GIR 4–6 to start, 3.5–4 in ELBW who are prone to hyperglycaemia,
 *  goal 10–12, max 14 (UC Davis 2025, CHOP consensus). Amino acids 2.5–3.5
 *  g/kg/day from day 1 to a goal of 3.5–4.5. Lipid 1 g/kg/day from day 1 to
 *  3 g/kg/day, stepping down to 1 g/kg/day at 80 ml/kg/day of fortified milk
 *  and stopping at 100 ml/kg/day (Frontiers in Pediatrics 2025).
 *
 *  Targets — energy 110–135 kcal/kg/day (115–140 below 1000 g), protein
 *  3.5–4.5 g/kg/day (4.0–4.5 below 1000 g), both AAP/ESPGHAN ranges.
 *
 * Nothing here writes to the chart. The feed tab shows the suggestion and the
 * clinician applies or edits it.
 */

export type WeightBandId = "microprem" | "elbw" | "vlbw" | "lbw" | "bigger";

export type WeightBand = {
  id: WeightBandId;
  /** Human label, e.g. "751–1000 g". */
  label: string;
  min: number;
  max: number;
  /** Fluid on day 1 of life, ml/kg/day, and the range it may sit in. */
  day1Fluid: number;
  day1FluidRange: [number, number];
  /** Fluid on day 2 and from day 3 onwards, ml/kg/day. */
  day2Fluid: number;
  day3Fluid: number;
  /** Daily enteral/fluid increment after day 3, ml/kg/day. */
  increment: number;
  /** First feed volume, ml/kg/day — trophic below 1500 g. */
  feedStart: number;
  /** Enteral volume considered full feeds. */
  fullFeeds: number;
  fullFeedsRange: [number, number];
  /** Feed interval used for this size. */
  feedFreq: string;
  /** Starting amino acid dose, g/kg/day. */
  aaStart: number;
  /** Starting GIR, mg/kg/min. */
  girStart: number;
};

export const WEIGHT_BANDS: readonly WeightBand[] = [
  {
    id: "microprem",
    label: "≤750 g",
    min: 0,
    max: 750,
    day1Fluid: 110,
    day1FluidRange: [100, 130],
    day2Fluid: 140,
    day3Fluid: 155,
    increment: 15,
    feedStart: 10,
    fullFeeds: 170,
    fullFeedsRange: [160, 180],
    feedFreq: "2 hourly",
    aaStart: 2.5,
    girStart: 4,
  },
  {
    id: "elbw",
    label: "751–1000 g",
    min: 751,
    max: 1000,
    day1Fluid: 100,
    day1FluidRange: [90, 130],
    day2Fluid: 130,
    day3Fluid: 145,
    increment: 20,
    feedStart: 20,
    fullFeeds: 160,
    fullFeedsRange: [150, 160],
    feedFreq: "2 hourly",
    aaStart: 3,
    girStart: 4,
  },
  {
    id: "vlbw",
    label: "1001–1500 g",
    min: 1001,
    max: 1500,
    day1Fluid: 90,
    day1FluidRange: [80, 100],
    day2Fluid: 110,
    day3Fluid: 135,
    increment: 30,
    feedStart: 20,
    fullFeeds: 155,
    fullFeedsRange: [150, 160],
    feedFreq: "3 hourly",
    aaStart: 3.5,
    girStart: 5,
  },
  {
    id: "lbw",
    label: "1501–2000 g",
    min: 1501,
    max: 2000,
    day1Fluid: 70,
    day1FluidRange: [60, 80],
    day2Fluid: 100,
    day3Fluid: 125,
    increment: 30,
    feedStart: 20,
    fullFeeds: 150,
    fullFeedsRange: [140, 160],
    feedFreq: "3 hourly",
    aaStart: 3.5,
    girStart: 5,
  },
  {
    id: "bigger",
    label: ">2000 g",
    min: 2001,
    max: Number.MAX_SAFE_INTEGER,
    day1Fluid: 65,
    day1FluidRange: [60, 80],
    day2Fluid: 90,
    day3Fluid: 115,
    increment: 30,
    feedStart: 30,
    fullFeeds: 150,
    fullFeedsRange: [140, 160],
    feedFreq: "3 hourly",
    aaStart: 3,
    girStart: 6,
  },
];

/** The fortifier the unit reaches for first; every record can override it. */
export const DEFAULT_FORTIFIER_ID = "lhmf";

/** Enteral intake at which fortification starts, ml/kg/day. */
export const FORTIFY_AT_ML_KG_DAY = 100;

/** Enteral intake at which IV lipid is usually stopped, ml/kg/day. */
export const STOP_LIPID_AT_ML_KG_DAY = 100;

/** Enteral intake at which IV lipid steps down to 1 g/kg/day. */
export const REDUCE_LIPID_AT_ML_KG_DAY = 80;

export function weightBand(weightG?: number | null): WeightBand | undefined {
  if (weightG == null || !(weightG > 0)) return undefined;
  return WEIGHT_BANDS.find((b) => weightG >= b.min && weightG <= b.max);
}

/* ------------------------------- the phases -------------------------------- */

export type FeedPhaseId = "stabilise" | "advance" | "fortify" | "full" | "wean" | "oral";

export type FeedPhase = {
  id: FeedPhaseId;
  label: string;
  /** One line shown under the phase strip. */
  blurb: string;
  /** 0-based position in the pathway, for the stepper. */
  step: number;
};

/** The pathway every baby walks, in order. */
export const FEED_PHASES: readonly { id: FeedPhaseId; label: string }[] = [
  { id: "stabilise", label: "Stabilise" },
  { id: "advance", label: "Advance feeds" },
  { id: "fortify", label: "Fortify" },
  { id: "full", label: "Full feeds" },
  { id: "wean", label: "Wean IV" },
  { id: "oral", label: "Oral / discharge" },
];

export type FeedPhaseContext = {
  weightG?: number | null;
  /** Day of life, 1 = day of birth. */
  dol?: number;
  /** Enteral volume already recorded, ml/kg/day. */
  enteralMlKgDay?: number;
  /** IV volume already recorded, ml/kg/day. */
  ivMlKgDay?: number;
  /** Feed route on the chart, e.g. "Oral", "OG tube". */
  feedRoute?: string;
};

/**
 * Where this baby is on the feeding pathway, from the volume they are actually
 * on — not from what the plan says they should be on.
 */
export function feedPhase(ctx: FeedPhaseContext): FeedPhase {
  const enteral = ctx.enteralMlKgDay ?? 0;
  const iv = ctx.ivMlKgDay ?? 0;
  const band = weightBand(ctx.weightG);
  const full = band?.fullFeeds ?? 150;
  const oral = /oral|breast|cup|spoon|nipple/i.test(ctx.feedRoute ?? "");
  const step = (id: FeedPhaseId) => FEED_PHASES.findIndex((p) => p.id === id);

  if (enteral >= full && iv <= 0 && oral) {
    return {
      id: "oral",
      label: "Oral feeds, IV off",
      blurb: "Fully enteral by mouth with no IV running — the discharge question is weight gain and temperature stability, not fluids.",
      step: step("oral"),
    };
  }
  if (enteral >= full) {
    return {
      id: "wean",
      label: "Full feeds — wean the IV",
      blurb: `On ${enteral} ml/kg/day enteral, at or above the ${full} ml/kg/day full-feed target. Wean IV fluids and amino acids as the feeds carry the intake.`,
      step: step("wean"),
    };
  }
  if (enteral >= FORTIFY_AT_ML_KG_DAY) {
    return {
      id: "fortify",
      label: "Fortify and keep advancing",
      blurb: `Enteral ${enteral} ml/kg/day has passed the ${FORTIFY_AT_ML_KG_DAY} ml/kg/day fortification threshold — human milk alone cannot carry the protein target from here.`,
      step: step("fortify"),
    };
  }
  if (enteral >= 40) {
    return {
      id: "advance",
      label: "Advancing feeds",
      blurb: `On ${enteral} ml/kg/day. Advance ${band && band.max <= 1000 ? "15–20" : "30"} ml/kg/day as tolerated; fortification starts at ${FORTIFY_AT_ML_KG_DAY} ml/kg/day.`,
      step: step("advance"),
    };
  }
  if (enteral > 0) {
    return {
      id: "stabilise",
      label: "Trophic / minimal enteral feeds",
      blurb: `On ${enteral} ml/kg/day of trophic feeds. These prime the gut; nutrition is still coming from the IV.`,
      step: step("stabilise"),
    };
  }
  if ((ctx.dol ?? 0) <= 3) {
    return {
      id: "stabilise",
      label: "Day 1–3, feeds not started",
      blurb: "Start colostrum swabs and trophic feeds within 24 hours if the baby is stable — delaying beyond 4 days has no benefit.",
      step: step("stabilise"),
    };
  }
  return {
    id: "advance",
    label: "NPO — feeds due to start",
    blurb: "No enteral volume recorded past day 3. Start trophic feeds unless there is a specific contraindication.",
    step: step("advance"),
  };
}

/* ------------------------------ the targets -------------------------------- */

export type NutritionTargets = {
  /** kcal/kg/day */
  kcal: [number, number];
  /** g/kg/day */
  protein: [number, number];
  /** ml/kg/day */
  fluids: [number, number];
  /** What drove these numbers, shown in the UI. */
  basis: string;
};

/**
 * Energy, protein and fluid targets by size and day of life.
 *
 * The fluid target follows the day-by-day ramp in the first days rather than
 * the full-feed range, so a day-1 baby is not measured against 150 ml/kg/day.
 */
export function targetsFor(input: {
  weightG?: number | null;
  dol?: number;
}): NutritionTargets {
  const band = weightBand(input.weightG);
  const dol = input.dol;
  const weightG = input.weightG ?? undefined;

  const kcal: [number, number] =
    weightG !== undefined && weightG < 1000 ? [115, 140] : weightG !== undefined && weightG > 1800 ? [100, 130] : [110, 135];
  const protein: [number, number] =
    weightG !== undefined && weightG < 1000 ? [4, 4.5] : weightG !== undefined && weightG > 1800 ? [3, 4] : [3.5, 4.5];

  if (!band) {
    return { kcal, protein, fluids: [140, 160], basis: "Enter a weight for size-specific targets" };
  }

  // Before full feeds the target is where the ramp should have got to today.
  const ramp = dayRampFluid(band, dol);
  if (ramp < band.fullFeedsRange[0]) {
    return {
      kcal,
      protein,
      fluids: [Math.max(0, ramp - 10), ramp + 10],
      basis: `${band.label}, day ${dol ?? "?"} ramp — full feeds ${band.fullFeedsRange[0]}–${band.fullFeedsRange[1]}`,
    };
  }
  return {
    kcal,
    protein,
    fluids: band.fullFeedsRange,
    basis: `${band.label} at full feeds`,
  };
}

/**
 * Where total fluids should be on a given day of life for this size: the day-1
 * volume, +20 ml/kg/day to day 3, then +30 ml/kg/day, capped at full feeds.
 */
export function dayRampFluid(band: WeightBand, dol?: number): number {
  const day = dol !== undefined && dol >= 1 ? Math.floor(dol) : 1;
  const base = day <= 1 ? band.day1Fluid : day === 2 ? band.day2Fluid : band.day3Fluid;
  const extraDays = Math.max(0, day - 3);
  return Math.min(band.fullFeedsRange[1], base + extraDays * band.increment);
}

/* --------------------------- the suggested plan ---------------------------- */

export type FeedSuggestion = {
  /** Short headline, e.g. "Day 6 · 850 g · advancing". */
  headline: string;
  band?: WeightBand;
  phase: FeedPhase;
  targets: NutritionTargets;
  /**
   * Values keyed by the field name on `Clinical.fluids`, so the UI can apply
   * the whole thing in one spread.
   */
  fields: {
    feedPlan: "static" | "increasing";
    /**
     * Only set when the plan is the right tool — see `usesPlan`. Applying the
     * suggestion clears it otherwise, so a stale target cannot take over the
     * enteral volume again.
     */
    tfiMlKgDay?: number;
    /** The total fluid target, written directly when the plan is not used. */
    totalMlKgDay?: number;
    feedIncrementMlKgDay: number;
    increaseAppliesTo: "iv-today" | "tomorrow-target";
    feedFreq: string;
    enteralMlKgDay: number;
    ivMlKgDay: number;
    dextrosePct: number;
    aminoAcid: number;
    lipid: number;
    fortifierProductId?: string;
    fortificationAmount?: number;
    fortificationDosesPerDay?: number;
  };
  /**
   * True when the feed plan can carry this prescription.
   *
   * The plan derives the enteral volume from the total fluid target, so it only
   * works once feeds are essentially the whole intake. While the IV is carrying
   * most of the fluid — the first days of life — the plan would force the feeds
   * up to the full target, so the volumes are written directly instead.
   */
  usesPlan: boolean;
  /** Today's total fluid target, ml/kg/day. */
  fluidTarget: number;
  /** Per-field rationale, keyed like `fields`. */
  why: Record<string, string>;
  notes: string[];
};

export type SuggestionContext = FeedPhaseContext & {
  gestWeeks?: number;
  /** What is already on the chart, so the suggestion respects real progress. */
  tfiMlKgDay?: number;
  feedIncrementMlKgDay?: number;
  /** Protein the enteral feeds are already delivering, g/kg/day. */
  enteralProteinGKgDay?: number;
};

/**
 * A guideline-based prescription for today. It never overrides what the baby is
 * already tolerating: if the chart records more enteral volume than the ramp
 * would suggest, the suggestion keeps the higher volume.
 */
export function suggestFluids(ctx: SuggestionContext): FeedSuggestion {
  const band = weightBand(ctx.weightG);
  const phase = feedPhase(ctx);
  const targets = targetsFor(ctx);
  const dol = ctx.dol ?? 1;
  const notes: string[] = [];
  const why: Record<string, string> = {};

  const fullFeeds = band?.fullFeedsRange[1] ?? 160;
  // Total fluid target for today — the ramp. Not the same as the feed volume:
  // on day 1 a baby is on trophic feeds and the IV makes up the difference.
  const ramp = band ? dayRampFluid(band, dol) : 150;
  const recordedEnteral = ctx.enteralMlKgDay ?? 0;
  const increment = band?.increment ?? 30;
  const feedStart = band?.feedStart ?? 20;

  // Today's enteral volume: yesterday's plus the increment, or the starting
  // volume if feeds have not begun. Never below what the baby is already on.
  const enteral = recordedEnteral > 0
    ? Math.min(fullFeeds, Math.max(recordedEnteral, Math.min(fullFeeds, recordedEnteral + increment)))
    : feedStart;
  why.enteralMlKgDay = recordedEnteral > 0
    ? enteral > recordedEnteral
      ? `Advance ${increment} ml/kg/day from the recorded ${recordedEnteral} (faster advancement reaches full feeds sooner without more NEC).`
      : `Already at full feeds — hold at ${recordedEnteral} ml/kg/day.`
    : `Trophic start for ${band?.label ?? "this weight"} is ${feedStart} ml/kg/day, within 24 h of birth if the baby is stable.`;

  // Tomorrow's step, capped at full feeds.
  const stepUp = enteral >= fullFeeds ? 0 : Math.min(increment, fullFeeds - enteral);
  why.feedIncrementMlKgDay = stepUp
    ? `Advance ${stepUp} ml/kg/day${band && band.max <= 1000 ? " (15–20 for ≤1 kg)" : ""} — faster advancement reaches full feeds sooner without more NEC.`
    : "Already at full feeds — nothing to increase.";
  why.feedFreq = `${band?.feedFreq ?? "2 hourly"}: 2-hourly below 1250 g, 3-hourly above.`;
  why.feedPlan = stepUp
    ? `Increasing: ${enteral} ml/kg/day today, ${enteral + stepUp} ml/kg/day tomorrow.`
    : "Static: already at full feeds, so today and tomorrow are the same.";
  why.increaseAppliesTo =
    "The increase becomes tomorrow's feed target; the IV entered below covers today's fluid gap.";

  // IV makes up the difference between today's feeds and the fluid target.
  const tfi = Math.max(enteral, Math.min(ramp, fullFeeds));
  if (enteral > ramp + 0.5) {
    notes.push(`Feeds (${enteral} ml/kg/day) are ahead of the day-${dol} fluid ramp (${ramp}) — the fluid target follows the feeds.`);
  }
  const iv = Math.max(0, Math.round((tfi - enteral) * 10) / 10);
  why.tfiMlKgDay = `Total fluids ${tfi} ml/kg/day on day ${dol}${band ? ` (day 1 ${band.day1FluidRange[0]}–${band.day1FluidRange[1]})` : ""}.`;
  why.ivMlKgDay =
    iv > 0
      ? `The gap between ${tfi} ml/kg/day of fluid and ${enteral} ml/kg/day of feed.`
      : "Feeds already cover the fluid target. If IV is still running for drugs or electrolytes, keep it and enter the volume.";
  why.totalMlKgDay = why.tfiMlKgDay;

  // A baby who has never been fed still starts on trophic volumes however late
  // it is — the ramp is the fluid target, not a feed volume to jump to.
  if (recordedEnteral <= 0 && dol > 3) {
    notes.push(
      `No enteral feeds recorded on day ${dol}. Starting at the trophic volume (${enteral} ml/kg/day) and advancing — check there is no contraindication to feeding before applying.`,
    );
  }

  // Dextrose% from the GIR this size should be on, given the IV volume. Only
  // D5–D25 exist, so a small IV volume cannot carry the target GIR — say what
  // the concentration actually delivers instead of printing an impossible %.
  const girTarget = phase.id === "stabilise" ? (band?.girStart ?? 4) : Math.min(10, (band?.girStart ?? 4) + 2);
  const girFrom = (pct: number) => Math.round(((pct * 10 * iv) / 1440) * 100) / 100;
  const rawPct = iv > 0 ? (girTarget * 1440) / (10 * iv) : 10;
  const dextrosePct = Math.max(5, Math.min(25, Math.round(rawPct * 2) / 2));
  why.dextrosePct =
    iv <= 0
      ? "No IV volume, so this is only a placeholder."
      : rawPct > 25
        ? `D25% at ${iv} ml/kg/day is the most that can be given and still only reaches a GIR of ${girFrom(25)} mg/kg/min — the IV volume is too small to carry more dextrose.`
        : `D${dextrosePct}% gives a GIR of ${girFrom(dextrosePct)} mg/kg/min at ${iv} ml/kg/day (target ${girTarget}${band && band.max <= 750 ? " — ELBW are prone to hyperglycaemia, so start low" : ""}).`;

  // Amino acids: fill the protein gap the feeds are not covering.
  const enteralProtein = ctx.enteralProteinGKgDay ?? 0;
  // Day 1–2 sits at the starting dose; from day 3 the shortfall between what the
  // feeds deliver and the protein target is what the IV has to carry.
  const aaTarget = dol <= 2 ? (band?.aaStart ?? 3) : targets.protein[0] - enteralProtein;
  const aa = enteral >= fullFeeds ? 0 : Math.max(0, Math.min(4.5, Math.round(aaTarget * 10) / 10));
  why.aminoAcid =
    enteral >= fullFeeds
      ? "Full enteral feeds carry the protein target — IV amino acids can stop."
      : dol <= 2
        ? `Start at ${aa} g/kg/day on day ${dol} and build by 0.5 g/kg/day to ${targets.protein[0]}–${targets.protein[1]} (max 4.5).`
        : `Feeds give ${enteralProtein} g/kg/day; the IV covers the rest of the ${targets.protein[0]}–${targets.protein[1]} target.`;

  // Lipid: step down as the fortified milk takes over.
  const lipid =
    enteral >= STOP_LIPID_AT_ML_KG_DAY ? 0 : enteral >= REDUCE_LIPID_AT_ML_KG_DAY ? 1 : Math.min(3, 1 + Math.max(0, dol - 1) * 0.5);
  why.lipid =
    enteral >= STOP_LIPID_AT_ML_KG_DAY
      ? `Stop IV lipid at ${STOP_LIPID_AT_ML_KG_DAY} ml/kg/day of fortified milk — the milk carries the fat.`
      : enteral >= REDUCE_LIPID_AT_ML_KG_DAY
        ? `Step down to 1 g/kg/day once fortified milk reaches ${REDUCE_LIPID_AT_ML_KG_DAY} ml/kg/day.`
        : `Build to 3 g/kg/day by 0.5 g/kg/day a day (day ${dol}).`;

  // Fortification from 100 ml/kg/day, half strength first.
  const shouldFortify = enteral >= FORTIFY_AT_ML_KG_DAY;
  const feedsPerDay = /(\d+(?:\.\d+)?) hourly/.exec(band?.feedFreq ?? "2 hourly");
  const doses = feedsPerDay ? Math.round(24 / Number(feedsPerDay[1])) : 12;
  why.fortificationAmount = shouldFortify
    ? enteral < FORTIFY_AT_ML_KG_DAY + 10
      ? "Half strength (1:50) for 48 h, then full strength."
      : "Full strength — 1 sachet per 25 ml of milk."
    : `Fortification starts at ${FORTIFY_AT_ML_KG_DAY} ml/kg/day of enteral feeds.`;
  if (shouldFortify) {
    notes.push(
      `Fortify: ${enteral < FORTIFY_AT_ML_KG_DAY + 10 ? "half strength for 48 h, then full" : "full strength"} — 1 g sachet per 25 ml, given in ${doses} feeds/day.`,
    );
  } else {
    notes.push(`Not yet time to fortify — the threshold is ${FORTIFY_AT_ML_KG_DAY} ml/kg/day of enteral feeds.`);
  }
  if (!ctx.weightG) notes.push("No weight on record — the whole suggestion assumes 1500 g. Enter the weight.");

  const usesPlan = enteral >= tfi - 0.5;

  return {
    headline: `Day ${dol} · ${band ? band.label : "no weight"} · ${phase.label}`,
    band,
    phase,
    targets,
    usesPlan,
    fluidTarget: tfi,
    fields: {
      feedPlan: stepUp > 0 ? "increasing" : "static",
      ...(usesPlan ? { tfiMlKgDay: tfi } : { tfiMlKgDay: undefined, totalMlKgDay: tfi }),
      feedIncrementMlKgDay: stepUp,
      increaseAppliesTo: "tomorrow-target",
      feedFreq: band?.feedFreq ?? "2 hourly",
      enteralMlKgDay: enteral,
      ivMlKgDay: iv,
      dextrosePct,
      aminoAcid: aa,
      lipid: Math.round(lipid * 10) / 10,
      ...(shouldFortify
        ? {
            fortifierProductId: DEFAULT_FORTIFIER_ID,
            fortificationAmount: enteral < FORTIFY_AT_ML_KG_DAY + 10 ? 0.5 : 1,
            fortificationDosesPerDay: doses,
          }
        : {}),
    },
    why,
    notes,
  };
}
