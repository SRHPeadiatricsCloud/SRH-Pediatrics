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
  dashArray?: string;
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
  title: "SRH MRD/090 · Birth weight under 1250 g",
  shortTitle: "MRD/090",
  subtitle: "SRH local birth-weight nomogram for very-low-birth-weight neonates",
  maxHours: 120,
  maxTsb: 280,
  yTickStep: 50,
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
      note: "Plateaus near 158 µmol/L after 72 h.",
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
      note: "Plateaus near 140 µmol/L after 72 h.",
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
      note: "Plateaus near 118 µmol/L after 72 h.",
    },
  ],
  eligibility: "Use first when birth weight is below 1250 grams.",
  caution: "Between printed points the app interpolates linearly for bedside plotting.",
};

const MRD091: PhototherapyNomogram = {
  key: "mrd-091",
  title: "SRH MRD/091 · Preterm infant under 35 weeks",
  shortTitle: "MRD/091",
  subtitle: "SRH local gestation-based nomogram for preterm infants under 35 weeks",
  maxHours: 120,
  maxTsb: 360,
  yTickStep: 50,
  curves: [
    {
      key: "ga-gt-2500",
      label: "BW > 2500 g and < 35 weeks",
      symbol: "~",
      color: "#67e8f9",
      points: [
        { hour: 24, tsb: 150 },
        { hour: 48, tsb: 200 },
        { hour: 72, tsb: 250 },
        { hour: 96, tsb: 290 },
        { hour: 120, tsb: 293 },
      ],
      note: "Rises to about 293 µmol/L by 96–120 h.",
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
      note: "Plateaus near 252 µmol/L.",
    },
    {
      key: "ga-1500-1999",
      label: "BW 1500–1999 g and < 35 weeks",
      symbol: "*",
      color: "#f59e0b",
      points: [
        { hour: 24, tsb: 110 },
        { hour: 48, tsb: 150 },
        { hour: 72, tsb: 180 },
        { hour: 96, tsb: 200 },
        { hour: 120, tsb: 202 },
      ],
      exchange: 300,
      note: "Plateaus near 202 µmol/L · exchange line stored at 300 µmol/L.",
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
      note: "Lower preterm threshold curve retained for the local chart family.",
    },
  ],
  eligibility: "Use when gestation is below 35 weeks and birth weight is 1250 grams or above.",
  caution: "Curves are plotted from the local chart family; intermediate hours are interpolated for bedside use.",
};

const TERM_PHOTOTHERAPY: PhototherapyNomogram = {
  key: "term-phototherapy",
  title: "≥35 weeks · Phototherapy cut-off",
  shortTitle: "≥35 wk PT",
  subtitle: "Term / near-term phototherapy threshold chart fine-tuned from the shared image",
  maxHours: 168,
  maxTsb: 428,
  yTickStep: 85,
  curves: [
    {
      key: "term-lower-risk",
      label: "Lower risk · ≥38 weeks and well",
      symbol: "•••",
      color: "#67e8f9",
      dashArray: "1 10",
      points: mgDlSeries([
        [0, 6.5],
        [12, 8.6],
        [24, 11.8],
        [36, 13.8],
        [48, 15.5],
        [60, 16.8],
        [72, 17.8],
        [84, 18.9],
        [96, 19.8],
        [108, 20.3],
        [120, 20.8],
        [144, 20.8],
        [168, 20.8],
      ]),
      note: "Fine-tuned from the shared phototherapy chart · plateaus near 20.8 mg/dL (≈356 µmol/L).",
    },
    {
      key: "term-medium-risk",
      label: "Medium risk · ≥38 weeks + risk factors, or 35–37 6/7 weeks and well",
      symbol: "– –",
      color: "#fbbf24",
      dashArray: "14 10",
      points: mgDlSeries([
        [0, 5],
        [12, 7.1],
        [24, 10],
        [36, 11.8],
        [48, 13.5],
        [60, 14.6],
        [72, 15.6],
        [84, 16.6],
        [96, 17.3],
        [108, 17.8],
        [120, 18],
        [144, 18],
        [168, 18],
      ]),
      note: "Fine-tuned from the shared phototherapy chart · plateaus near 18 mg/dL (≈308 µmol/L).",
    },
    {
      key: "term-higher-risk",
      label: "Higher risk · 35–37 6/7 weeks + risk factors",
      symbol: "—",
      color: "#fb7185",
      points: mgDlSeries([
        [0, 3.8],
        [12, 5.6],
        [24, 8],
        [36, 9.8],
        [48, 11.4],
        [60, 12.6],
        [72, 13.5],
        [84, 14.2],
        [96, 14.8],
        [108, 15],
        [120, 15],
        [144, 15],
        [168, 15],
      ]),
      note: "Fine-tuned from the shared phototherapy chart · plateaus near 15 mg/dL (≈257 µmol/L).",
    },
  ],
  eligibility: "Auto-selected when gestation is 35 weeks or above. Risk tier is chosen from gestation plus haemolysis / neurotoxicity flags.",
  caution: "Recreated from the shared ≥35-week phototherapy image. If the bilirubin value lies very close to a treatment boundary, confirm against the original chart.",
};

const TERM_EXCHANGE: PhototherapyNomogram = {
  key: "term-exchange",
  title: "≥35 weeks · Exchange transfusion cut-off",
  shortTitle: "≥35 wk ET",
  subtitle: "Term / near-term exchange-transfusion chart fine-tuned from the shared image",
  maxHours: 168,
  maxTsb: 513,
  yTickStep: 85,
  curves: [
    {
      key: "term-lower-risk",
      label: "Lower risk · ≥38 weeks and well",
      symbol: "•••",
      color: "#67e8f9",
      dashArray: "1 10",
      points: mgDlSeries([
        [0, 16],
        [12, 17.4],
        [24, 19],
        [36, 20.8],
        [48, 22],
        [60, 23.2],
        [72, 24],
        [84, 24.4],
        [96, 25],
        [120, 25],
        [144, 25],
        [168, 25],
      ]),
      note: "Fine-tuned from the shared exchange chart · plateaus near 25 mg/dL (≈428 µmol/L).",
    },
    {
      key: "term-medium-risk",
      label: "Medium risk · ≥38 weeks + risk factors, or 35–37 6/7 weeks and well",
      symbol: "– –",
      color: "#fbbf24",
      dashArray: "14 10",
      points: mgDlSeries([
        [0, 14],
        [12, 15.2],
        [24, 16.5],
        [36, 18],
        [48, 19],
        [60, 20],
        [72, 21.2],
        [84, 21.9],
        [96, 22.5],
        [120, 22.5],
        [144, 22.5],
        [168, 22.5],
      ]),
      note: "Fine-tuned from the shared exchange chart · plateaus near 22.5 mg/dL (≈385 µmol/L).",
    },
    {
      key: "term-higher-risk",
      label: "Higher risk · 35–37 6/7 weeks + risk factors",
      symbol: "—",
      color: "#fb7185",
      points: mgDlSeries([
        [0, 12],
        [12, 13.5],
        [24, 15],
        [36, 16],
        [48, 17],
        [60, 17.8],
        [72, 18.5],
        [84, 18.8],
        [96, 19],
        [120, 19],
        [144, 19],
        [168, 19],
      ]),
      note: "Fine-tuned from the shared exchange chart · plateaus near 19 mg/dL (≈325 µmol/L).",
    },
  ],
  eligibility: "Used alongside the ≥35-week phototherapy chart for exchange-transfusion escalation at term / near-term gestation.",
  caution:
    "The shared source marks the first 24 hours as uncertain with dashed early segments. Immediate exchange is recommended if acute bilirubin encephalopathy is suspected or TSB is at least 5 mg/dL (≈85 µmol/L) above the selected line.",
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
        rationale: "Auto-selected SRH MRD/090 because birth weight is under 1250 g. 1000–1249 g band is active.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 750) {
      return {
        nomogram: MRD090,
        curve: MRD090.curves[1] ?? null,
        rationale: "Auto-selected SRH MRD/090 because birth weight is under 1250 g. 750–999 g band is active.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    return {
      nomogram: MRD090,
      curve: MRD090.curves[2] ?? null,
      rationale: "Auto-selected SRH MRD/090 because birth weight is under 1250 g. 500–749 g band is active.",
      exchangeNomogram: null,
      exchangeCurve: null,
    };
  }

  if (gestWeeks > 0 && gestWeeks < 35 && weightGrams >= 1250) {
    if (weightGrams > 2500) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[0] ?? null,
        rationale: "Auto-selected SRH MRD/091 because gestation is under 35 weeks. >2500 g band is active.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 2000) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[1] ?? null,
        rationale: "Auto-selected SRH MRD/091 because gestation is under 35 weeks. 2000–2499 g band is active.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    if (weightGrams >= 1500) {
      return {
        nomogram: MRD091,
        curve: MRD091.curves[2] ?? null,
        rationale: "Auto-selected SRH MRD/091 because gestation is under 35 weeks. 1500–1999 g band is active.",
        exchangeNomogram: null,
        exchangeCurve: null,
      };
    }
    return {
      nomogram: MRD091,
      curve: MRD091.curves[3] ?? null,
      rationale: "Auto-selected SRH MRD/091 because gestation is under 35 weeks. 1250–1499 g band is active.",
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
        ? "Auto-selected the ≥35-week medium-risk pathway because gestation is ≥38 weeks but risk factors are present."
        : "Auto-selected the ≥35-week lower-risk pathway because gestation is ≥38 weeks and no additional risk factors are marked."
      : hasAdditionalRiskFactors
        ? "Auto-selected the ≥35-week higher-risk pathway because gestation is 35–37 6/7 weeks and risk factors are present."
        : "Auto-selected the ≥35-week medium-risk pathway because gestation is 35–37 6/7 weeks and no extra risk factors are marked.";

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
