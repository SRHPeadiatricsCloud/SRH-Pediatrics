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
  curves: PhototherapyCurve[];
  eligibility: string;
  caution?: string;
};

export type PhototherapySelection = {
  nomogram: PhototherapyNomogram | null;
  curve: PhototherapyCurve | null;
  rationale: string;
};

export const BLOOD_GROUPS: BloodGroup[] = ["Unknown", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export const PHOTOTHERAPY_NOMOGRAMS: PhototherapyNomogram[] = [
  {
    key: "mrd-090",
    title: "MRD/090 · Birth weight < 1250 grams",
    shortTitle: "MRD/090",
    subtitle: "Hospital birth-weight nomogram for very low birth weight neonates",
    maxHours: 120,
    maxTsb: 280,
    eligibility: "Use when birth weight is below 1250 grams.",
    caution: "Between printed points the app interpolates linearly for bedside plotting.",
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
  },
  {
    key: "mrd-091",
    title: "MRD/091 · Infant < 35 weeks gestation",
    shortTitle: "MRD/091",
    subtitle: "Hospital gestation-based nomogram for preterm infants under 35 weeks",
    maxHours: 120,
    maxTsb: 360,
    eligibility: "Use when gestation is below 35 weeks and birth weight is 1250 grams or above.",
    caution:
      "Curves are plotted from the hospital threshold family shared in the brief; intermediate hours are interpolated for bedside use.",
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
  },
];

export function micromolToMgDl(tsbUmol: number): number {
  return Math.round((tsbUmol / 17.1) * 10) / 10;
}

export function mgDlToMicromol(tsbMgDl: number): number {
  return Math.round(tsbMgDl * 17.1);
}

export function curveValueAt(curve: PhototherapyCurve, hour: number): number {
  const pts = curve.points;
  if (!pts.length) return 0;
  if (hour <= pts[0].hour) {
    if (pts.length === 1) return pts[0].tsb;
    return interpolate(pts[0], pts[1], hour);
  }
  for (let i = 1; i < pts.length; i++) {
    if (hour <= pts[i].hour) return interpolate(pts[i - 1], pts[i], hour);
  }
  return pts[pts.length - 1].tsb;
}

function interpolate(a: PhototherapyPoint, b: PhototherapyPoint, hour: number): number {
  if (b.hour === a.hour) return b.tsb;
  const t = (hour - a.hour) / (b.hour - a.hour);
  return Math.round((a.tsb + (b.tsb - a.tsb) * t) * 10) / 10;
}

export function nominalPhototherapyChoice(weightGrams: number, gestWeeks: number): PhototherapySelection {
  const chart090 = PHOTOTHERAPY_NOMOGRAMS[0];
  const chart091 = PHOTOTHERAPY_NOMOGRAMS[1];

  if (weightGrams > 0 && weightGrams < 1250) {
    if (weightGrams >= 1000) return { nomogram: chart090, curve: chart090.curves[0], rationale: "Birth weight under 1250 g → MRD/090. 1000–1249 g band selected." };
    if (weightGrams >= 750) return { nomogram: chart090, curve: chart090.curves[1], rationale: "Birth weight under 1250 g → MRD/090. 750–999 g band selected." };
    return { nomogram: chart090, curve: chart090.curves[2], rationale: "Birth weight under 1250 g → MRD/090. 500–749 g band selected." };
  }

  if (gestWeeks > 0 && gestWeeks < 35 && weightGrams >= 1250) {
    if (weightGrams > 2500) return { nomogram: chart091, curve: chart091.curves[0], rationale: "Gestation under 35 weeks → MRD/091. >2500 g band selected." };
    if (weightGrams >= 2000) return { nomogram: chart091, curve: chart091.curves[1], rationale: "Gestation under 35 weeks → MRD/091. 2000–2499 g band selected." };
    if (weightGrams >= 1500) return { nomogram: chart091, curve: chart091.curves[2], rationale: "Gestation under 35 weeks → MRD/091. 1500–1999 g band selected." };
    return { nomogram: chart091, curve: chart091.curves[3], rationale: "Gestation under 35 weeks → MRD/091. 1250–1499 g band selected." };
  }

  if (gestWeeks >= 35) {
    return {
      nomogram: null,
      curve: null,
      rationale: "These hospital nomograms are for BW <1250 g or gestation <35 weeks. For ≥35 weeks use the AAP / local term jaundice pathway.",
    };
  }

  return {
    nomogram: null,
    curve: null,
    rationale: "Enter gestation and birth weight to auto-select the appropriate neonatal nomogram.",
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
