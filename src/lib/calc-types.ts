export type Severity = "good" | "info" | "warn" | "crit";

export type CalcResult = {
  value: string;
  severity: Severity;
  interpretation?: string;
  note?: string;
  outOfRange?: string;
};

export type CalcField =
  | { key: string; label: string; type: "number"; unit?: string; min?: number; max?: number; placeholder?: string }
  | { key: string; label: string; type: "select"; options: { value: number; label: string }[] };

export type CategoryKey =
  | "neonatal" | "critical" | "pain" | "warning" | "respiratory" | "cardio"
  | "fluid" | "dosing" | "trauma" | "sepsis" | "growth" | "neuro"
  | "gi" | "development" | "skin" | "endocrine";

export type Calculator = {
  id: string;
  name: string;
  category: CategoryKey;
  citation: string;
  fields: CalcField[];
  compute: (v: Record<string, number>) => CalcResult;
  external?: { label: string; url: string };
};

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "neonatal", label: "Neonatal / NICU" },
  { key: "critical", label: "Critical Care Severity & Mortality" },
  { key: "pain", label: "Pain & Sedation" },
  { key: "warning", label: "Vital Signs & Early Warning" },
  { key: "respiratory", label: "Respiratory" },
  { key: "cardio", label: "Cardiovascular" },
  { key: "fluid", label: "Fluid, Renal & Metabolic" },
  { key: "dosing", label: "Dosing & Sizing" },
  { key: "trauma", label: "Trauma" },
  { key: "sepsis", label: "Infection / Sepsis" },
  { key: "growth", label: "Growth & Nutrition" },
  { key: "neuro", label: "Neuro / Consciousness" },
  { key: "gi", label: "GI / Feeding" },
  { key: "development", label: "Developmental / Behavioral" },
  { key: "skin", label: "Skin / Wound" },
  { key: "endocrine", label: "Endocrine / Pubertal" },
];

export const CATEGORY_LABEL: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>;
