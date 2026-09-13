export type NicuDrugGroup = "Antibiotics" | "Antifungal" | "Others";

export type NicuDoseInput = {
  drugId: string;
  weightKg: number;
  gestationalAgeWeeks: number;
  postnatalAgeDays: number;
  postmenstrualAgeWeeks?: number;
  strength?: number;
};

export type NicuDoseResult = {
  drug: string;
  indication?: string;
  dose: string;
  calculatedAmount?: string;
  frequency: string;
  route?: string;
  volume?: string;
  rule: string;
  caution?: string;
};

export type NicuDrug = {
  id: string;
  name: string;
  group: NicuDrugGroup;
  strengthUnit?: "mg/mL" | "mcg/mL" | "mmol/mL" | "mL";
  defaultStrength?: number;
  strengthLabel?: string;
  requiresWeight?: boolean;
  referenceRows: { condition: string; regimen: string }[];
  calculate: (input: NicuDoseInput) => NicuDoseResult;
};

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const range = (low: number, high: number, digits = 1) => low === high ? `${round(low, digits)}` : `${round(low, digits)}–${round(high, digits)}`;
const age = (input: NicuDoseInput) => input.postnatalAgeDays;
const ga = (input: NicuDoseInput) => input.gestationalAgeWeeks;
const pma = (input: NicuDoseInput) => input.postmenstrualAgeWeeks || ga(input) + age(input) / 7;
const amount = (dose: number, input: NicuDoseInput, unit = "mg") => `${round(dose * input.weightKg)} ${unit}`;
const volume = (calculatedAmount: number, input: NicuDoseInput, factor = 1, unit = "mL") => input.strength && input.strength > 0 ? `${round((calculatedAmount / input.strength) * factor)} ${unit}` : undefined;

function weightBand(weight: number): string {
  if (weight <= 0.8) return "800 g or less";
  if (weight <= 1.2) return "801–1200 g";
  if (weight <= 2) return "1201–2000 g";
  if (weight <= 2.8) return "2001–2800 g";
  return "2800 g or greater";
}

const commonCaution = "Verify renal function, indication, culture results and local NICU formulary before administration.";

export const NICU_DRUGS: NicuDrug[] = [
  {
    id: "amoxicillin-clavulanate", name: "Amoxicillin & clavulanate", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "30 mg/kg/dose BD" }],
    calculate: (input) => ({ drug: "Amoxicillin & clavulanate", dose: "30 mg/kg/dose", calculatedAmount: amount(30, input), frequency: "BD (every 12 h)", volume: volume(30 * input.weightKg, input), rule: "30 mg/kg/dose BD", caution: commonCaution }),
  },
  {
    id: "ampicillin", name: "Ampicillin", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [
      { condition: "GA ≤34 wk; PNA ≤7 d", regimen: "50 mg/kg/dose IV BD" },
      { condition: "GA ≤34 wk; PNA 8 to <28 d", regimen: "75 mg/kg/dose IV BD" },
      { condition: "GA >34 wk; PNA ≤28 d", regimen: "50 mg/kg/dose IV every 8 h" },
    ],
    calculate: (input) => {
      const dose = ga(input) <= 34 ? age(input) <= 7 ? 50 : age(input) < 28 ? 75 : null : age(input) <= 28 ? 50 : null;
      if (!dose) return { drug: "Ampicillin", dose: "Not covered by this chart", frequency: "—", rule: "The supplied chart ends at the stated postnatal-age bands.", caution: "Select a current local neonatal dosing reference for this age." };
      const frequency = ga(input) <= 34 ? "BD (every 12 h)" : "every 8 h";
      return { drug: "Ampicillin", dose: `${dose} mg/kg/dose`, calculatedAmount: amount(dose, input), frequency, route: "IV", volume: volume(dose * input.weightKg, input), rule: `${ga(input) <= 34 ? "GA ≤34 wk" : "GA >34 wk"}; PNA ${age(input)} d`, caution: commonCaution };
    },
  },
  {
    id: "amikacin", name: "Amikacin", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [
      { condition: "≤800 g; PNA <14 d", regimen: "16 mg/kg/dose every 48 h" }, { condition: "≤800 g; PNA ≥14 d", regimen: "20 mg/kg/dose every 42 h" },
      { condition: "801–1200 g; PNA <14 d", regimen: "16 mg/kg/dose every 42 h" }, { condition: "801–1200 g; PNA ≥14 d", regimen: "20 mg/kg/dose every 36 h" },
      { condition: "1201–2000 g; PNA <14 d", regimen: "15 mg/kg/dose every 36 h" }, { condition: "1201–2000 g; PNA ≥14 d", regimen: "18 mg/kg/dose every 30 h" },
      { condition: "2001–2800 g; PNA <14 d", regimen: "15 mg/kg/dose every 36 h" }, { condition: "2001–2800 g; PNA ≥14 d", regimen: "18 mg/kg/dose every 24 h" },
      { condition: "≥2800 g; PNA <14 d", regimen: "15 mg/kg/dose every 30 h" }, { condition: "≥2800 g; PNA ≥14 d", regimen: "18 mg/kg/dose every 20 h" },
    ],
    calculate: (input) => {
      const bands: Record<string, { early: [number, string]; late: [number, string] }> = {
        "800 g or less": { early: [16, "every 48 h"], late: [20, "every 42 h"] },
        "801–1200 g": { early: [16, "every 42 h"], late: [20, "every 36 h"] },
        "1201–2000 g": { early: [15, "every 36 h"], late: [18, "every 30 h"] },
        "2001–2800 g": { early: [15, "every 36 h"], late: [18, "every 24 h"] },
        "2800 g or greater": { early: [15, "every 30 h"], late: [18, "every 20 h"] },
      };
      const selected = age(input) < 14 ? bands[weightBand(input.weightKg)].early : bands[weightBand(input.weightKg)].late;
      return { drug: "Amikacin", dose: `${selected[0]} mg/kg/dose`, calculatedAmount: amount(selected[0], input), frequency: selected[1], route: "IV", volume: volume(selected[0] * input.weightKg, input), rule: `${weightBand(input.weightKg)}; PNA ${age(input)} d`, caution: "Therapeutic drug monitoring and renal adjustment are essential; interval alone is not a prescription." };
    },
  },
  {
    id: "gentamicin", name: "Gentamicin", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [
      { condition: "GA <30 wk; PNA ≤14 d", regimen: "5 mg/kg/dose every 48 h" }, { condition: "GA <30 wk; PNA ≥15 d", regimen: "5 mg/kg/dose every 36 h" },
      { condition: "GA 30 to <35 wk; PNA ≤10 d", regimen: "5 mg/kg/dose every 36 h" }, { condition: "GA 30 to <35 wk; PNA 11–60 d", regimen: "5 mg/kg/dose every 24 h" },
      { condition: "GA ≥35 wk; PNA ≤7 d", regimen: "4 mg/kg/dose every 24 h" }, { condition: "GA ≥35 wk; PNA 8–60 d", regimen: "5 mg/kg/dose every 24 h" },
    ],
    calculate: (input) => {
      let dose: number; let frequency: string;
      if (ga(input) < 30) { dose = 5; frequency = age(input) <= 14 ? "every 48 h" : "every 36 h"; }
      else if (ga(input) < 35) { dose = 5; frequency = age(input) <= 10 ? "every 36 h" : "every 24 h"; }
      else { dose = age(input) <= 7 ? 4 : 5; frequency = "every 24 h"; }
      return { drug: "Gentamicin", dose: `${dose} mg/kg/dose`, calculatedAmount: amount(dose, input), frequency, route: "IV", volume: volume(dose * input.weightKg, input), rule: `GA ${ga(input)} wk; PNA ${age(input)} d`, caution: "Therapeutic drug monitoring and renal adjustment are essential; check the local maximum age/interval policy." };
    },
  },
  {
    id: "piperacillin-tazobactam", name: "Piperacillin & tazobactam", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "PMA ≤30 wk", regimen: "100 mg piperacillin/kg/dose every 8 h" }, { condition: "PMA >30 wk", regimen: "80 mg piperacillin/kg/dose every 6 h" }],
    calculate: (input) => { const dose = pma(input) <= 30 ? 100 : 80; const frequency = pma(input) <= 30 ? "every 8 h" : "every 6 h"; return { drug: "Piperacillin & tazobactam", dose: `${dose} mg piperacillin/kg/dose`, calculatedAmount: amount(dose, input), frequency, route: "IV", volume: volume(dose * input.weightKg, input), rule: `PMA ${round(pma(input), 1)} wk`, caution: "Dose is expressed as the piperacillin component; verify the product ratio and renal adjustment." }; },
  },
  {
    id: "meropenem", name: "Meropenem", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "GA <32 wk; PNA <14 d", regimen: "20 mg/kg/dose every 12 h" }, { condition: "GA <32 wk; PNA ≥14 d", regimen: "20 mg/kg/dose every 8 h" }, { condition: "GA ≥32 wk; PNA <14 d", regimen: "20 mg/kg/dose every 8 h" }, { condition: "GA ≥32 wk; PNA ≥14 d", regimen: "30 mg/kg/dose every 8 h" }],
    calculate: (input) => { const early = age(input) < 14; const dose = !early && ga(input) >= 32 ? 30 : 20; const frequency = !early || ga(input) >= 32 ? "every 8 h" : "every 12 h"; return { drug: "Meropenem", dose: `${dose} mg/kg/dose`, calculatedAmount: amount(dose, input), frequency, route: "IV", volume: volume(dose * input.weightKg, input), rule: `GA ${ga(input)} wk; PNA ${age(input)} d`, caution: commonCaution }; },
  },
  {
    id: "cefotaxime", name: "Cefotaxime", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "GA <32 wk; PNA <7 d", regimen: "50 mg/kg/dose every 12 h" }, { condition: "GA <32 wk; PNA 7–28 d", regimen: "50 mg/kg/dose every 8 h" }, { condition: "GA ≥32 wk; PNA ≤7 d", regimen: "50 mg/kg/dose every 12 h" }, { condition: "GA ≥32 wk; PNA 8–28 d", regimen: "50 mg/kg/dose every 8 h" }],
    calculate: (input) => { const dose = 50; const frequency = age(input) < 7 ? "every 12 h" : "every 8 h"; return { drug: "Cefotaxime", dose: "50 mg/kg/dose", calculatedAmount: amount(dose, input), frequency, route: "IV", volume: volume(dose * input.weightKg, input), rule: `GA ${ga(input)} wk; PNA ${age(input)} d`, caution: commonCaution }; },
  },
  {
    id: "metronidazole", name: "Metronidazole", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "PMA 23 to <34 wk", regimen: "Loading 15 mg/kg; maintenance 7.5 mg/kg/dose every 12 h" }, { condition: "PMA 34–40 wk", regimen: "Loading 15 mg/kg; maintenance 7.5 mg/kg/dose every 8 h" }, { condition: "PMA >40 wk", regimen: "Loading 15 mg/kg; maintenance 7.5 mg/kg/dose every 6 h or 10 mg/kg/dose every 8 h" }],
    calculate: (input) => { const p = pma(input); const frequency = p < 34 ? "every 12 h" : p <= 40 ? "every 8 h" : "every 6 h (or 10 mg/kg every 8 h per local protocol)"; return { drug: "Metronidazole", dose: "Loading 15 mg/kg; maintenance 7.5 mg/kg/dose", calculatedAmount: `Loading ${amount(15, input)}; maintenance ${amount(7.5, input)}`, frequency, route: "IV / oral", volume: input.strength ? `Loading ${volume(15 * input.weightKg, input)}; maintenance ${volume(7.5 * input.weightKg, input)}` : undefined, rule: `PMA ${round(p, 1)} wk`, caution: "Confirm the selected maintenance regimen and indication with the local neonatal protocol." }; },
  },
  {
    id: "vancomycin", name: "Vancomycin", group: "Antibiotics", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "PMA <29 wk", regimen: "15 mg/kg/dose every 24 h" }, { condition: "PMA 29–35 wk", regimen: "15 mg/kg/dose every 12 h" }, { condition: "PMA >35 wk", regimen: "15 mg/kg/dose every 8 h" }],
    calculate: (input) => { const p = pma(input); const frequency = p < 29 ? "every 24 h" : p <= 35 ? "every 12 h" : "every 8 h"; return { drug: "Vancomycin", dose: "15 mg/kg/dose", calculatedAmount: amount(15, input), frequency, route: "IV", volume: volume(15 * input.weightKg, input), rule: `PMA ${round(p, 1)} wk`, caution: "Use therapeutic drug monitoring/AUC or trough protocol and renal adjustment; infusion rate matters." }; },
  },
  {
    id: "fluconazole", name: "Fluconazole", group: "Antifungal", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "3–6 mg/kg/dose twice weekly for up to 6 weeks" }],
    calculate: (input) => ({ drug: "Fluconazole", dose: "3–6 mg/kg/dose", calculatedAmount: amount(3, input) + "–" + amount(6, input), frequency: "Twice weekly; up to 6 weeks", route: "IV / oral", volume: input.strength ? `${volume(3 * input.weightKg, input)}–${volume(6 * input.weightKg, input)}` : undefined, rule: "3–6 mg/kg/dose twice weekly for up to 6 weeks", caution: "Confirm prophylaxis versus treatment indication and hepatic/renal monitoring." }),
  },
  {
    id: "caffeine", name: "Caffeine", group: "Others", strengthUnit: "mg/mL", defaultStrength: 10, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "Loading 10 mg/kg/dose; maintenance 5–10 mg/kg/dose" }],
    calculate: (input) => ({ drug: "Caffeine", dose: "Loading 10 mg/kg/dose; maintenance 5–10 mg/kg/dose", calculatedAmount: `Loading ${amount(10, input)}; maintenance ${amount(5, input)}–${amount(10, input)}`, frequency: "Per NICU protocol", route: "IV / oral", volume: input.strength ? `Loading ${volume(10 * input.weightKg, input)}; maintenance ${volume(5 * input.weightKg, input)}–${volume(10 * input.weightKg, input)}` : undefined, rule: "10 mg/mL reference strength shown in the supplied chart", caution: "Check whether local product dosing is expressed as caffeine citrate or caffeine base." }),
  },
  {
    id: "furosemide", name: "Furosemide", group: "Others", strengthUnit: "mg/mL", defaultStrength: 10, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "0.5–2 mg/kg/dose" }],
    calculate: (input) => ({ drug: "Furosemide", dose: "0.5–2 mg/kg/dose", calculatedAmount: amount(0.5, input) + "–" + amount(2, input), frequency: "As prescribed", route: "IV / oral", volume: input.strength ? `${volume(0.5 * input.weightKg, input)}–${volume(2 * input.weightKg, input)}` : undefined, rule: "0.5–2 mg/kg/dose; 10 mg/mL reference strength shown", caution: "Monitor urine output, electrolytes, renal function and ototoxicity risk." }),
  },
  {
    id: "spironolactone", name: "Spironolactone", group: "Others", strengthUnit: "mg/mL", requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "1–3 mg/kg/day OD or BD; 1 tablet = 25 mg" }],
    calculate: (input) => ({ drug: "Spironolactone", dose: "1–3 mg/kg/day", calculatedAmount: amount(1, input) + "–" + amount(3, input), frequency: "OD or BD", route: "Oral", rule: "1–3 mg/kg/day OD or BD; supplied chart lists 1 tablet = 25 mg", caution: "Monitor potassium and renal function; tablet splitting/liquid concentration must be verified." }),
  },
  {
    id: "domstal", name: "Domstal (domperidone)", group: "Others", strengthUnit: "mg/mL", defaultStrength: 1, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "0.3–0.6 mg/kg/dose 3–4 times daily; max 10 mg/dose or 30 mg/day; 1 mg = 1 mL" }],
    calculate: (input) => ({ drug: "Domstal (domperidone)", dose: "0.3–0.6 mg/kg/dose", calculatedAmount: amount(0.3, input) + "–" + amount(0.6, input), frequency: "3–4 times daily; max 10 mg/dose or 30 mg/day", route: "Oral", volume: input.strength ? `${volume(0.3 * input.weightKg, input)}–${volume(0.6 * input.weightKg, input)}` : undefined, rule: "Supplied chart lists 1 mg = 1 mL", caution: "Verify current regulatory/local neonatal policy before use; assess QT risk and indication." }),
  },
  {
    id: "digoxin", name: "Digoxin", group: "Others", strengthUnit: "mcg/mL", defaultStrength: 50, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "5–10 mcg/kg/day BD; 1 mL = 50 mcg" }],
    calculate: (input) => { const low = 2.5 * input.weightKg; const high = 5 * input.weightKg; return { drug: "Digoxin", dose: "5–10 mcg/kg/day", calculatedAmount: `${range(low, high)} mcg per dose (BD)`, frequency: "BD", route: "Oral / IV", volume: input.strength ? `${round(low / input.strength)}–${round(high / input.strength)} mL per dose` : undefined, rule: "Daily dose divided BD; supplied chart lists 1 mL = 50 mcg", caution: "Confirm loading versus maintenance dose, ECG, renal function and drug level protocol." }; },
  },
  {
    id: "calcium", name: "Calcium", group: "Others", strengthUnit: "mg/mL", defaultStrength: 25, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "25–50 mg/kg/day; maximum 100 mg/kg/day; 1 mL = 25 mg" }],
    calculate: (input) => ({ drug: "Calcium", dose: "25–50 mg/kg/day (maximum 100 mg/kg/day)", calculatedAmount: amount(25, input) + "–" + amount(50, input) + "/day", frequency: "OD / divided per protocol", route: "IV / oral", volume: input.strength ? `${volume(25 * input.weightKg, input)}–${volume(50 * input.weightKg, input)} / day` : undefined, rule: "Supplied chart lists 1 mL = 25 mg", caution: "Specify calcium salt/elemental calcium and route; never administer concentrated calcium without local protocol." }),
  },
  {
    id: "phosphorus", name: "Phosphorus", group: "Others", strengthUnit: "mmol/mL", defaultStrength: 1.61, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "0.5 mmol/kg/day OD; 1 mL = 1.61 mmol" }],
    calculate: (input) => ({ drug: "Phosphorus", dose: "0.5 mmol/kg/day", calculatedAmount: `${round(0.5 * input.weightKg)} mmol/day`, frequency: "OD", route: "Oral / enteral", volume: input.strength ? `${round((0.5 * input.weightKg) / input.strength)} mL/day` : undefined, rule: "Supplied chart lists 1 mL = 1.61 mmol", caution: "Check calcium/phosphate compatibility, serum levels and renal function." }),
  },
  {
    id: "mct-oil", name: "MCT oil", group: "Others", strengthUnit: "mL", requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "3–5 mL/kg/day q6h" }],
    calculate: (input) => ({ drug: "MCT oil", dose: "3–5 mL/kg/day", calculatedAmount: `${round(3 * input.weightKg)}–${round(5 * input.weightKg)} mL/day`, frequency: "q6h (divide daily total into 4 doses)", route: "Enteral", rule: "3–5 mL/kg/day q6h", caution: "Confirm enteral tolerance and total calorie/volume plan." }),
  },
  {
    id: "oseltamivir", name: "Oseltamivir", group: "Others", strengthUnit: "mg/mL", defaultStrength: 12, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "3 mg/kg/dose; 1 mL = 12 mg" }],
    calculate: (input) => ({ drug: "Oseltamivir", dose: "3 mg/kg/dose", calculatedAmount: amount(3, input), frequency: "Per antiviral protocol", route: "Oral", volume: input.strength ? volume(3 * input.weightKg, input) : undefined, rule: "Supplied chart lists 1 mL = 12 mg", caution: "Confirm age-specific treatment/prophylaxis schedule with infectious diseases guidance." }),
  },
  {
    id: "iron", name: "Iron", group: "Others", strengthUnit: "mg/mL", defaultStrength: 10, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "3–6 mg/kg/day; 1 mL = 10 mg" }],
    calculate: (input) => ({ drug: "Iron", dose: "3–6 mg/kg/day", calculatedAmount: amount(3, input) + "–" + amount(6, input) + "/day", frequency: "OD / divided per product", route: "Oral", volume: input.strength ? `${volume(3 * input.weightKg, input)}–${volume(6 * input.weightKg, input)} / day` : undefined, rule: "Supplied chart lists 1 mL = 10 mg", caution: "Check elemental iron content and transfusion/feeding status." }),
  },
  {
    id: "ursodeoxycholic-acid", name: "Ursodeoxycholic acid", group: "Others", strengthUnit: "mg/mL", defaultStrength: 25, requiresWeight: true,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "10–15 mg/kg/dose BD; 1 mL = 25 mg" }],
    calculate: (input) => ({ drug: "Ursodeoxycholic acid", dose: "10–15 mg/kg/dose", calculatedAmount: amount(10, input) + "–" + amount(15, input), frequency: "BD", route: "Oral", volume: input.strength ? `${volume(10 * input.weightKg, input)}–${volume(15 * input.weightKg, input)}` : undefined, rule: "Supplied chart lists 1 mL = 25 mg", caution: "Confirm cholestasis work-up and local neonatal gastroenterology protocol." }),
  },
  {
    id: "zincovit", name: "Zincovit", group: "Others", strengthUnit: "mL", defaultStrength: 2.5,
    referenceRows: [{ condition: "All listed NICU patients", regimen: "0.5 mL BD; 1 mL = 2.5 mg zinc" }],
    calculate: () => ({ drug: "Zincovit", dose: "0.5 mL/dose", calculatedAmount: "0.5 mL per dose", frequency: "BD", route: "Oral", rule: "Supplied chart lists 1 mL = 2.5 mg zinc", caution: "Verify formulation and total micronutrient intake." }),
  },
];

export const NICU_DRUG_GROUPS: NicuDrugGroup[] = ["Antibiotics", "Antifungal", "Others"];
export const getNicuDrug = (id: string) => NICU_DRUGS.find((drug) => drug.id === id) ?? NICU_DRUGS[0];
