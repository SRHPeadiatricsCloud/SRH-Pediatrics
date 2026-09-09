export type BloodGroup = "Unknown" | "O+" | "O-" | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-";

export type PhototherapyPoint = { hour: number; tsb: number };

export type PhototherapyCurve = {
  key: string;
  label: string;
  symbol: string;
  color: string;
  points: PhototherapyPoint[];
  exchange?: number;
  note?: string;
};

export type PhototherapyNomogram = {
  key: string;
  title: string;
  subtitle: string;
  shortTitle: string;
  maxHours: number;
  maxTsb: number;
  yTickStep?: number;
  curves: PhototherapyCurve[];
  eligibility: string;
  caution?: string;
};

export type PhototherapySelection = {
  nomogram: PhototherapyNomogram | null;
  curve: PhototherapyCurve | null;
  rationale: string;
  exchangeNomogram: PhototherapyNomogram | null;
  exchangeCurve: PhototherapyCurve | null;
};

export const BLOOD_GROUPS: BloodGroup[] = ["Unknown", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export function micromolToMgDl(tsbUmol: number): number {
  return Math.round((tsbUmol / 17.1) * 10) / 10;
}

export function mgDlToMicromol(tsbMgDl: number): number {
  return Math.round(tsbMgDl * 17.1);
}

function mgDlSeries(points: Array<[number, number]>): PhototherapyPoint[] {
  return points.map(([hour, mgDl]) => ({ hour, tsb: mgDlToMicromol(mgDl) }));
}

const MRD090: PhototherapyNomogram = {
  key: "mrd-090",
  title: "MRD/090 · Birth weight < 1250 grams",
  shortTitle: "MRD/090",
  subtitle: "Hospital birth-weight nomogram for very low birth weight neonates",
  maxHours: 120,
  maxTsb: 280,
  curves: [
    {
      key: "bw-1000-1249",
      label: "Birth weight 1000–1249 g",
      symbol: "^",
      color: "#38bdf8",
      points: [
        { hour: 12, tsb: 65 },
        { hour: 24, tsb: 100 },
        { hour: 48, tsb: 150 },
        { hour: 72, tsb: 158 },
        { hour: 96, tsb: 158 },
        { hour: 120, tsb: 158 },
      ],
      exchange: 250,
      note: "Plateau 158 µmol/L after 72 h.",
    },
    {
      key: "bw-750-999",
      label: "Birth weight 750–999 g",
      symbol: "*",
      color: "#a78bfa",
      points: [
        { hour: 12, tsb: 58 },
        { hour: 24, tsb: 90 },
        { hour: 48, tsb: 130 },
        { hour: 72, tsb: 140 },
        { hour: 96, tsb: 140 },
        { hour: 120, tsb: 140 },
      ],
      exchange: 225,
      note: "Plateau 140 µmol/L after 72 h.",
    },
    {
      key: "bw-500-749",
      label: "Birth weight 500–749 g",
      symbol: "#",
      color: "#4ade80",
      points: [
        { hour: 12, tsb: 48 },
        { hour: 24, tsb: 74 },
        { hour: 48, tsb: 110 },
        { hour: 72, tsb: 118 },
        { hour: 96, tsb: 118 },
        { hour: 120, tsb: 118 },
      ],
      exchange: 200,
      note: "Plateau 118 µmol/L after 72 h.",
    },
  ],
  eligibility: "Use when birth weight is below 1250 grams.",
  caution: "Between printed points the app interpolates linearly for bedside plotting.",
};

const MRD091: PhototherapyNomogram = {
  key: "mrd-091",
  title: "MRD/091 · Infant < 35 weeks gestation",
  shortTitle: "MRD/091",
  subtitle: "Hospital gestation-based nomogram for preterm infants under 35 weeks",
  maxHours: 120,
  maxTsb: 360,
  curves: [
    {
      key: "ga-gt-2500",
      label: "BW > 2500 g and < 35 weeks",
      symbol: "~",
      color: "#e5e7eb",
      points: [
        { hour: 24, tsb: 150 },
        { hour: 48, tsb: 200 },
        { hour: 72, tsb: 250 },
        { hour: 96, tsb: 290 },
        { hour: 120, tsb: 293 },
      ],
      note: "Rises to 293 µmol/L by 96–120 h.",
    },
    {
      key: "ga-2000-2499",
      label: "BW 2000–2499 g and < 35 weeks",
      symbol: "^",
      color: "#a78bfa",
      points: [
        { hour: 24, tsb: 130 },
        { hour: 48, tsb: 180 },
        { hour: 72, tsb: 225 },
        { hour: 96, tsb: 250 },
        { hour: 120, tsb: 252 },
      ],
      note: "Plateau 252 µmol/L.",
    },
    {
      key: "ga-1500-1999",
      label: "BW 1500–1999 g and < 35 weeks",
      symbol: "*",
      color: "#fb923c",
      points: [
        { hour: 24, tsb: 110 },
        { hour: 48, tsb: 150 },
        { hour: 72, tsb: 180 },
        { hour: 96, tsb: 200 },
        { hour: 120, tsb: 202 },
      ],
      exchange: 300,
      note: "Plateau 202 µmol/L · exchange ≥ 300 µmol/L.",
    },
    {
      key: "ga-1250-1499",
      label: "BW 1250–1499 g and < 35 weeks",
      symbol: "#",
      color: "#4ade80",
      points: [
        { hour: 24, tsb: 100 },
        { hour: 48, tsb: 135 },
        { hour: 72, tsb: 165 },
        { hour: 96, tsb: 176 },
        { hour: 120, tsb: 176 },
      ],
      note: "Lower preterm threshold curve plotted conservatively for the hospital chart family.",
    },
  ],
  eligibility: "Use when gestation is below 35 weeks and birth weight is 1250 grams or above.",
  caution:
    "Curves are plotted from the hospital threshold family shared in the brief; intermediate hours are interpolated for bedside use.",
};

const TERM_PHOTOTHERAPY: PhototherapyNomogram = {
  key: "term-phototherapy",
  title: "≥35 weeks · Phototherapy cut-off chart",
  shortTitle: "≥35 wk PT",
  subtitle: "Shared term / near-term bilirubin phototherapy threshold chart",
  maxHours: 168,
  maxTsb: 428,
  yTickStep: 85,
  curves: [
    {
      key: "term-lower-risk",
      label: "Lower risk (≥ 38 weeks and well)",
      symbol: "•",
      color: "#e5e7eb",
      points: mgDlSeries([
        [0, 6.5],
        [24, 12],
        [48, 15.5],
        [72, 17.5],
        [96, 19.8],
        [120, 20.8],
        [144, 20.8],
        [168, 20.8],
      ]),
      note: "Plateaus around 20.8 mg/dL (≈356 µmol/L) after day 5.",
    },
    {
      key: "term-medium-risk",
      label: "Medium risk (≥ 38 weeks + risk factors, or 35–37 6/7 weeks and well)",
      symbol: "– –",
      color: "#fbbf24",
      points: mgDlSeries([
        [0, 5],
        [24, 10.5],
        [48, 13.5],
        [72, 15.5],
        [96, 17.2],
        [120, 18],
        [144, 18],
        [168, 18],
      ]),
      note: "Plateaus around 18 mg/dL (≈308 µmol/L).",
    },
    {
      key: "term-higher-risk",
      label: "Higher risk (35–37 6/7 weeks + risk factors)",
      symbol: "—",
      color: "#4ade80",
      points: mgDlSeries([
        [0, 4],
        [24, 8],
        [48, 11.2],
        [72, 13.4],
        [96, 14.6],
        [120, 15],
        [144, 15],
        [168, 15],
      ]),
      note: "Plateaus around 15 mg/dL (≈257 µmol/L).",
    },
  ],
  eligibility:
    "Use when gestation is 35 weeks or above. Risk-tier selection follows the supplied chart: lower, medium or higher risk.",
  caution:
    "Recreated from the shared ≥35-week phototherapy image. Confirm against the original chart when the value sits close to a treatment boundary.",
};

const TERM_EXCHANGE: PhototherapyNomogram = {
  key: "term-exchange",
  title: "≥35 weeks · Exchange transfusion cut-off chart",
  shortTitle: "≥35 wk ET",
  subtitle: "Shared term / near-term bilirubin exchange transfusion threshold chart",
  maxHours: 168,
  maxTsb: 513,
  yTickStep: 85,
  curves: [
    {
      key: "term-lower-risk",
      label: "Lower risk (≥ 38 weeks and well)",
      symbol: "•",
      color: "#e5e7eb",
      points: mgDlSeries([
        [0, 14],
        [24, 19],
        [48, 22],
        [72, 24],
        [96, 25],
        [120, 25],
        [144, 25],
        [168, 25],
      ]),
      note: "Plateaus around 25 mg/dL (≈428 µmol/L).",
    },
    {
      key: "term-medium-risk",
      label: "Medium risk (≥ 38 weeks + risk factors, or 35–37 6/7 weeks and well)",
      symbol: "– –",
      color: "#fbbf24",
      points: mgDlSeries([
        [0, 12],
        [24, 16.5],
        [48, 19],
        [72, 21],
        [96, 22.5],
        [120, 22.5],
        [144, 22.5],
        [168, 22.5],
      ]),
      note: "Plateaus around 22.5 mg/dL (≈385 µmol/L).",
    },
    {
      key: "term-higher-risk",
      label: "Higher risk (35–37 6/7 weeks + risk factors)",
      symbol: "—",
      color: "#4ade80",
      points: mgDlSeries([
        [0, 12],
        [24, 15],
        [48, 17],
        [72, 18.5],
        [96, 19],
        [120, 19],
        [144, 19],
        [168, 19],
      ]),
      note: "Plateaus around 19 mg/dL (≈325 µmol/L).",
    },
  ],
  eligibility:
    "Use alongside the ≥35-week chart when assessing exchange-transfusion escalation for term / near-term infants.",
  caution:
    "The first 24 hours are dashed in the shared image because the source notes uncertainty. Immediate exchange is recommended if acute bilirubin encephalopathy is suspected or if TSB is ≥85 µmol/L (5 mg/dL) above the selected line.",
};

export const PHOTOTHERAPY_NOMOGRAMS: PhototherapyNomogram[] = [MRD090, MRD091, TERM_PHOTOTHERAPY, TERM_EXCHANGE];

export function curveValueAt(curve: PhototherapyCurve, hour: number): number {
  const pts = curve.points;
  if (!pts.length) return 0;
  if (hour <= pts[0]!.hour) {
    if (pts.length === 1) return pts[0]!.tsb;
    return interpolate(pts[0]!, pts[1]!, hour);
  }
  for (let i = 1; i < pts.length; i++) {
    if (hour <= pts[i]!.hour) return interpolate(pts[i - 1]!, pts[i]!, hour);
  }
  return pts[pts.length - 1]!.tsb;
}

function interpolate(a: PhototherapyPoint, b: PhototherapyPoint, hour: number): number {
  if (b.hour === a.hour) return b.tsb;
  const t = (hour - a.hour) / (b.hour - a.hour);
  return Math.round((a.tsb + (b.tsb - a.tsb) * t) * 10) / 10;
}

export function nominalPhototherapyChoice(
  weightGrams: number,
  gestWeeks: number,
  hasAdditionalRiskFactors = false,
): PhototherapySelection {
  if (weightGrams > 0 && weightGrams < 1250) {
    if (weightGrams >= 1000) {
      return {
        nomogram: MRD090,
        curve: MRD090.curves[0] ?? null,
        rationale: "Birth weight under 1250 g → MRD/090. 1000–1249 g band selected.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 750) {
      return {
        nomogram: MRD090,
        curve: MRD090.curves[1] ?? null,
        rationale: "Birth weight under 1250 g → MRD/090. 750–999 g band selected.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    return {
      nomogram: MRD090,
      curve: MRD090.curves[2] ?? null,
      rationale: "Birth weight under 1250 g → MRD/090. 500–749 g band selected.",
      exchangeNomogram: null,
      exchangeCurve: null,
    };
  }

  if (gestWeeks > 0 && gestWeeks < 35 && weightGrams >= 1250) {
    if (weightGrams > 2500) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[0] ?? null,
        rationale: "Gestation under 35 weeks → MRD/091. >2500 g band selected.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 2000) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[1] ?? null,
        rationale: "Gestation under 35 weeks → MRD/091. 2000–2499 g band selected.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 1500) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[2] ?? null,
        rationale: "Gestation under 35 weeks → MRD/091. 1500–1999 g band selected.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    return {
      nomogram: MRD091,
      curve: MRD091.curves[3] ?? null,
      rationale: "Gestation under 35 weeks → MRD/091. 1250–1499 g band selected.",
      exchangeNomogram: null,
      exchangeCurve: null,
    };
  }

  if (gestWeeks >= 35) {
    const curveKey = gestWeeks >= 38
      ? hasAdditionalRiskFactors
        ? "term-medium-risk"
        : "term-lower-risk"
      : hasAdditionalRiskFactors
        ? "term-higher-risk"
        : "term-medium-risk";

    const curve = TERM_PHOTOTHERAPY.curves.find((item) => item.key === curveKey) ?? null;
    const exchangeCurve = TERM_EXCHANGE.curves.find((item) => item.key === curveKey) ?? null;

    const rationale = gestWeeks >= 38
      ? hasAdditionalRiskFactors
        ? "Gestation ≥38 weeks with neurotoxicity / haemolysis risk → medium-risk ≥35 week line selected."
        : "Gestation ≥38 weeks and clinically well → lower-risk ≥35 week line selected."
      : hasAdditionalRiskFactors
        ? "Gestation 35–37 6/7 weeks with neurotoxicity / haemolysis risk → higher-risk ≥35 week line selected."
        : "Gestation 35–37 6/7 weeks and clinically well → medium-risk ≥35 week line selected.";

    return {
      nomogram: TERM_PHOTOTHERAPY,
      curve,
      rationale,
      exchangeNomogram: TERM_EXCHANGE,
      exchangeCurve,
    };
  }

  return {
    nomogram: null,
    curve: null,
    rationale: "Enter gestation and birth weight to auto-select the appropriate bilirubin nomogram.",
    exchangeNomogram: null,
    exchangeCurve: null,
  };
}

export function aboIncompatibilityRisk(mother: BloodGroup, baby: BloodGroup): boolean {
  const m = aboPart(mother);
  const b = aboPart(baby);
  if (!m || !b) return false;
  return m === "O" && ["A", "B", "AB"].includes(b);
}

export function rhIncompatibilityRisk(mother: BloodGroup, baby: BloodGroup): boolean {
  if (mother === "Unknown" || baby === "Unknown") return false;
  return mother.endsWith("-") && baby.endsWith("+");
}

export function bloodGroupRiskLabel(mother: BloodGroup, baby: BloodGroup): string[] {
  const out: string[] = [];
  if (aboIncompatibilityRisk(mother, baby)) out.push("Possible ABO incompatibility");
  if (rhIncompatibilityRisk(mother, baby)) out.push("Possible Rh incompatibility");
  return out;
}

function aboPart(group: BloodGroup): "O" | "A" | "B" | "AB" | null {
  if (group === "Unknown") return null;
  if (group.startsWith("AB")) return "AB";
  if (group.startsWith("A")) return "A";
  if (group.startsWith("B")) return "B";
  if (group.startsWith("O")) return "O";
  return null;
}
