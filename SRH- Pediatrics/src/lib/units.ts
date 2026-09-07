/** Unit framework for Sri Ramakrishna Hospital — multi-unit handover engine. */

export type UnitKey = "nicu" | "picu" | "stepdown" | "postnatal" | "paeds";

export type UnitDef = {
  key: UnitKey;
  code: string;
  name: string;
  short: string;
  color: string; // tailwind accent classes
  emoji: string;
  levels: string[];
  bedZones: { label: string; beds: string[] }[];
};

const R = (a: number, b: number, prefix: string) =>
  Array.from({ length: b - a + 1 }, (_, i) => `${prefix} ${a + i}`);

const LETTERS = ["A", "B", "C", "D"] as const;
const roomBlock = (prefix: string) => LETTERS.map((l) => `${prefix} ${l}`);
const ms = (n: number) => `MS ${n}`;

export const UNITS: Record<UnitKey, UnitDef> = {
  nicu: {
    key: "nicu",
    code: "NICU",
    name: "Neonatal Intensive Care Unit",
    short: "NICU",
    emoji: "👶",
    color: "cyan",
    levels: ["Level I", "Level II", "Level III A", "Level III B"],
    bedZones: [
      { label: "Radiant warmers", beds: R(1, 22, "Warmer") },
      { label: "Isolette", beds: ["Isolette 1"] },
      { label: "Incubators / cots", beds: R(1, 3, "Incubator") },
    ],
  },
  picu: {
    key: "picu",
    code: "PICU",
    name: "Paediatric Intensive Care Unit",
    short: "PICU",
    emoji: "❤️",
    color: "rose",
    levels: ["PICU Level II", "PICU Level III", "Cardiac ICU (CVICU)"],
    bedZones: [{ label: "PICU beds", beds: R(1, 6, "PICU") }],
  },
  stepdown: {
    key: "stepdown",
    code: "STEPDOWN",
    name: "Step-down PICU / High Dependency",
    short: "STEPDOWN",
    emoji: "🛏️",
    color: "amber",
    levels: ["HDU", "Step-down"],
    bedZones: [{ label: "Step-down beds", beds: R(1, 6, "SD") }],
  },
  postnatal: {
    key: "postnatal",
    code: "POSTNATAL",
    name: "Postnatal Ward (Mother & Baby)",
    short: "POSTNATAL",
    emoji: "🤱",
    color: "violet",
    levels: ["Routine postnatal", "Mother & baby combined care"],
    bedZones: [
      { label: "NEW rooms", beds: roomBlock("NEW") },
      { label: "SPECIAL rooms", beds: roomBlock("SPECIAL") },
      { label: "DELUXE rooms", beds: roomBlock("DELUXE") },
      { label: "MS rooms", beds: [ms(4), ms(5), ms(6), ms(7)] },
    ],
  },
  paeds: {
    key: "paeds",
    code: "PAEDS",
    name: "Paediatric Ward",
    short: "PAEDS",
    emoji: "🧒",
    color: "emerald",
    levels: ["General paediatrics", "Isolation / cubicle"],
    bedZones: [
      { label: "NEW rooms", beds: roomBlock("NEW") },
      { label: "SPECIAL rooms", beds: roomBlock("SPECIAL") },
      { label: "DELUXE rooms", beds: roomBlock("DELUXE") },
      { label: "MS rooms", beds: [ms(4), ms(5), ms(6), ms(7)] },
    ],
  },
};

export const UNIT_LIST = [UNITS.nicu, UNITS.picu, UNITS.stepdown, UNITS.postnatal, UNITS.paeds];

/** Sub-specialty ICUs that occasionally admit into PICU / step-down. */
export const SUBSPECIALTY = [
  { key: "picu", label: "General PICU" },
  { key: "ccu", label: "CCU — Critical Care Unit" },
  { key: "cvicu", label: "CVICU — Cardiac / Cardiothoracic ICU" },
  { key: "licu", label: "LICU — Liver ICU" },
] as const;

export type SubSpecialtyKey = (typeof SUBSPECIALTY)[number]["key"];

export const SUB_SPECIALTY_META: Record<string, { label: string; tone: string; note: string }> = {
  picu: { label: "General PICU", tone: "border-rose-400/40 bg-rose-400/10 text-rose-200", note: "General paediatric intensive care" },
  ccu: { label: "CCU", tone: "border-amber-400/40 bg-amber-400/10 text-amber-200", note: "Critical care / neuro-trauma overflow" },
  cvicu: { label: "CVICU", tone: "border-sky-400/40 bg-sky-400/10 text-sky-200", note: "Post-cardiac surgery, CHF, arrhythmia" },
  licu: { label: "LICU", tone: "border-violet-400/40 bg-violet-400/10 text-violet-200", note: "Acute liver failure, hepatic encephalopathy" },
};

export function unitOf(key: string | null | undefined): UnitDef {
  if (key && key in UNITS) return UNITS[key as UnitKey];
  return UNITS.nicu;
}

export function allBeds(unit: UnitKey): string[] {
  return UNITS[unit].bedZones.flatMap((z) => z.beds);
}

/** Default bed for a unit (used on admission forms). */
export function defaultBed(unit: UnitKey): string {
  return UNITS[unit].bedZones[0].beds[0];
}
