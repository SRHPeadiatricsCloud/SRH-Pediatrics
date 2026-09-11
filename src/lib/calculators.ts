import type { Calculator, CalcField, CategoryKey, Severity, CalcResult } from "./calc-types";
import { CATEGORIES } from "./calc-types";
export { CATEGORIES };

type F = CalcField;
type R2 = CalcResult;
type Interp = (total: number, values?: Record<string, number>) => R2;
type Opt = { value: number; label: string };
const sel = (key: string, label: string, options: [number, string][] | Opt[]): F =>
  ({ key, label, type: "select", options: options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o)) });
const f = (key: string, label: string, min: number, max: number, unit?: string): F =>
  ({ key, label, type: "number", min, max, unit });

type Sev = Severity;
type R = { severity: Severity; interpretation?: string; note?: string; outOfRange?: string };
const r = (severity: Sev, interpretation: string): R => ({ severity, interpretation });
const band = (t: number, bands: [number, Sev, string][]): R => {
  for (const [limit, severity, note] of bands) if (t <= limit) return { severity, interpretation: note };
  return { severity: bands[bands.length - 1][1], interpretation: bands[bands.length - 1][2] };
};
const out = (value: string, res: R): CalcResult => ({ value, ...res });
const oor = (msg: string): CalcResult => ({
  value: "—", severity: "warn", interpretation: "Out of validated range", outOfRange: msg,
});
const sum = (v: Record<string, number>) => Object.values(v).reduce((n, x) => n + (x ?? 0), 0);

type ScaleItem = { key: string; label: string; options: [number, string][] };
function scale(
  id: string, name: string, category: CategoryKey, citation: string,
  items: readonly (ScaleItem | F)[],
  interpret: (...args: any[]) => R,
  maxOverride?: number,
  scoreOf?: (values: Record<string, number>) => number,
): Calculator {
  const optsOf = (i: unknown) =>
    Array.isArray((i as { options?: unknown }).options)
      ? ((i as { options: [number, string][] }).options)
      : [];
  const max = maxOverride ?? items.reduce((n, i) => {
    const opts = optsOf(i);
    return opts.length ? n + Math.max(...opts.map((o) => Math.abs(o[0]))) : n;
  }, 0);
  const fields: F[] = items.map((i) => {
    const item = i as { key: string; label: string; options?: [number, string][]; type?: string; min?: number; max?: number; unit?: string };
    return item.options
      ? sel(item.key, item.label, item.options)
      : f(item.key, item.label, item.min ?? 0, item.max ?? 100, item.unit);
  });
  return {
    id, name, category, citation, fields,
    compute: (v) => {
      const numeric = Object.values(v).filter((x) => typeof x === "number") as number[];
      const total = scoreOf ? scoreOf(v) : numeric.reduce((n, x) => n + x, 0);
      return out(`${Math.round(total * 100) / 100}`, interpret(total, v));
    },
  };
}

// The official New Ballard Score uses an even-week conversion grid rather than
// a linear equation. Intermediate scores are recorded as completed weeks only;
// the official FAQ illustrates downward interpolation (for example, 27 = 34
// weeks and 28 = 35 weeks). Keep the grid explicit so the bedside convention
// remains visible and cannot silently drift into false half-week precision.
const NEW_BALLARD_GA_GRID: readonly [score: number, weeks: number][] = [
  [-10, 20], [-5, 22], [0, 24], [5, 26], [10, 28], [15, 30], [20, 32],
  [25, 34], [30, 36], [35, 38], [40, 40], [45, 42], [50, 44],
];

export function newBallardCompletedWeeks(score: number): number | null {
  if (score < NEW_BALLARD_GA_GRID[0][0] || score > NEW_BALLARD_GA_GRID.at(-1)![0]) return null;
  for (let index = 1; index < NEW_BALLARD_GA_GRID.length; index += 1) {
    const [upperScore, upperWeeks] = NEW_BALLARD_GA_GRID[index];
    if (score <= upperScore) {
      const [lowerScore, lowerWeeks] = NEW_BALLARD_GA_GRID[index - 1];
      const interpolatedWeeks = lowerWeeks + ((score - lowerScore) / (upperScore - lowerScore)) * (upperWeeks - lowerWeeks);
      return Math.floor(interpolatedWeeks);
    }
  }
  return NEW_BALLARD_GA_GRID.at(-1)![1];
}

export const CALCULATORS: Calculator[] = [

  /* ================= Neonatal / NICU ================= */
  {
    id: "phototherapy-nomograms",
    name: "SRH Bilirubin Nomograms (MRD/090, MRD/091, ≥35 wk PT & ET)",
    category: "neonatal",
    citation:
      "Sri Ramakrishna Hospital bilirubin charts — MRD/090 for birth weight under 1250 g, MRD/091 for infants under 35 weeks gestation, plus ≥35-week phototherapy and exchange-transfusion cut-off charts recreated from the supplied images.",
    fields: [],
    compute: () => ({
      value: "Open the interactive charts below",
      severity: "info",
      note: "Auto-selects the relevant bilirubin line from age, gestation, birth weight, TSB and risk flags, while showing both mg/dL and µmol/L.",
    }),
  },
  scale("apgar", "Apgar Score", "neonatal",
    "Apgar V, Curr Res Anesth Analg 1953; ACOG/AAP Committee Opinion 2015",
    [
      { key: "hr", label: "Heart rate", options: [[0, "Absent"], [1, "< 100/min"], [2, "≥ 100/min"]] },
      { key: "resp", label: "Respiratory effort", options: [[0, "Absent"], [1, "Slow, irregular"], [2, "Good, crying"]] },
      { key: "tone", label: "Muscle tone", options: [[0, "Limp"], [1, "Some flexion"], [2, "Active motion"]] },
      { key: "grimmace", label: "Reflex irritability", options: [[0, "No response"], [1, "Grimace"], [2, "Cry / sneeze"]] },
      { key: "colour", label: "Colour", options: [[0, "Blue / pale"], [1, "Body pink, limbs blue"], [2, "Completely pink"]] },
    ],
    (t) => band(t, [[3, "crit", "Severely depressed — full resuscitation."], [6, "warn", "Moderately depressed — support likely."], [10, "good", "Good condition."]])),

  scale("silverman", "Silverman–Andersen Score", "neonatal",
    "Silverman WA, Andersen DH. Pediatrics 1956;17:1–10",
    [
      { key: "chest", label: "Upper chest movement", options: [[0, "Synchronous"], [1, "Lag on inspiration"], [2, "See-saw"]] },
      { key: "intercostal", label: "Intercostal retraction", options: [[0, "None"], [1, "Just visible"], [2, "Marked"]] },
      { key: "xiphoid", label: "Xiphoid retraction", options: [[0, "None"], [1, "Just visible"], [2, "Marked"]] },
      { key: "nares", label: "Nares dilation / flaring", options: [[0, "None"], [1, "Minimal"], [2, "Marked"]] },
      { key: "expir", label: "Expiratory grunt", options: [[0, "None"], [1, "Heard with stethoscope"], [2, "Heard without stethoscope"]] },
    ],
    (t) => band(t, [[0, "good", "No respiratory distress."], [3, "warn", "Mild–moderate distress."], [6, "warn", "Moderate–severe distress."], [10, "crit", "Severe — impending respiratory failure."]])),

  scale("downes", "Downes Score", "neonatal",
    "Downes JJ, Vidyasagar D, Boggs TR Jr, Morrow GM. Clin Pediatr (Phila). 1970;9:325–31; modified Downes score evidence in neonatal respiratory distress",
    [
      { key: "rr", label: "Respiratory rate (/min)", options: [[0, "< 60"], [1, "60–80"], [2, "> 80"]] },
      { key: "cyanosis", label: "Cyanosis / oxygen requirement", options: [[0, "None in FiO₂ 0.21"], [1, "In FiO₂ 0.21"], [2, "In FiO₂ 0.40"]] },
      { key: "retraction", label: "Retractions", options: [[0, "None"], [1, "Mild"], [2, "Marked"]] },
      { key: "grunting", label: "Grunting", options: [[0, "None"], [1, "With stethoscope"], [2, "Audible without"]] },
      { key: "airEntry", label: "Air entry", options: [[0, "Clear"], [1, "Delayed / harsh"], [2, "Very poor"]] },
    ],
    (t) => t === 0
      ? { severity: "good", interpretation: "No clinical respiratory distress by this score." }
      : t <= 4
        ? { severity: "warn", interpretation: "Mild respiratory distress (1–4). Reassess serially and correlate with SpO₂, FiO₂, blood gas and work of breathing." }
        : t <= 7
          ? { severity: "warn", interpretation: "Moderate respiratory distress (5–7). Escalate monitoring and consider respiratory support according to the clinical picture." }
          : { severity: "crit", interpretation: "Severe distress / impending respiratory failure (8–10). Urgent senior neonatal review and respiratory support; do not use the score alone to delay airway care." }),

  scale("nips", "NIPS (Neonatal Infant Pain Scale)", "neonatal",
    "Lawrence J et al. 1993 (NIPS)",
    [
      { key: "face", label: "Facial expression", options: [[0, "Relaxed"], [1, "Grimace"]] },
      { key: "cry", label: "Cry", options: [[0, "No cry"], [1, "Whimper"], [2, "Vigorous cry"]] },
      { key: "breath", label: "Breathing", options: [[0, "Relaxed"], [1, "Changed pattern"]] },
      { key: "arms", label: "Arms", options: [[0, "Relaxed"], [1, "Flexed / extended"]] },
      { key: "legs", label: "Legs", options: [[0, "Relaxed"], [1, "Flexed / extended"]] },
      { key: "state", label: "Arousal state", options: [[0, "Sleeping / awake"], [1, "Fussy"]] },
    ],
    (t) => band(t, [[2, "good", "Minimal pain."], [3, "warn", "Pain present — intervene."], [7, "crit", "Severe pain."]])),

  scale("npass", "N-PASS (Neonatal Pain, Agitation & Sedation)", "neonatal",
    "Hummel P et al. 2008 (N-PASS)",
    [
      { key: "prem", label: "Prematurity adjustment", options: [[0, "≥ 30 w corrected"], [1, "< 30 w corrected (+1)"]] },
      { key: "cry", label: "Crying / irritability", options: [[-2, "No cry with stimuli"], [-1, "Moans / minimal"], [0, "Appropriate cry"], [1, "Irritable, consolable"], [2, "Inconsolable / high-pitched"]] },
      { key: "beh", label: "Behaviour state", options: [[-2, "No arousal"], [-1, "Minimal arousal"], [0, "Appropriate for GA"], [1, "Restless"], [2, "Arching / kicking / constant awake"]] },
      { key: "face", label: "Facial expression", options: [[-2, "Lax, no expression"], [-1, "Minimal expression"], [0, "Relaxed"], [1, "Intermittent pain expression"], [2, "Continual pain expression"]] },
      { key: "tone", label: "Extremity tone", options: [[-2, "Flaccid"], [-1, "Decreased tone"], [0, "Normal tone"], [1, "Intermittent clenching"], [2, "Continual clenching / tense"]] },
      { key: "vs", label: "Vital signs", options: [[-2, "No variability / apnoea"], [-1, "< 10% variability"], [0, "Within baseline"], [1, "↑ 10–20% / SpO₂ 76–85%"], [2, "↑ > 20% / SpO₂ ≤ 75%"]] },
    ],
    (t) => band(t, [[3, "good", "Below pain threshold."], [5, "warn", "At/above threshold — treat."], [11, "crit", "Severe pain."]]),
    11),

  scale("pipp", "PIPP-R (Premature Infant Pain Profile – Revised)", "neonatal",
    "Stevens B et al. 2014 (PIPP-R)",
    [
      { key: "ga", label: "Gestational age (wk)", options: [[0, "≥ 36"], [1, "32–35+6"], [2, "28–31+6"], [3, "< 28"]] },
      { key: "beh", label: "Behavioural state", options: [[0, "Active / eyes open, facial movement"], [1, "Quiet / eyes open, no facial movement"], [2, "Active / eyes closed, facial movement"], [3, "Quiet / eyes closed, no facial movement"]] },
      { key: "hr", label: "Max HR rise from baseline", options: [[0, "0–4 bpm"], [1, "5–14"], [2, "15–24"], [3, "≥ 25"]] },
      { key: "spo2", label: "Min SpO₂ drop", options: [[0, "0–2.4%"], [1, "2.5–4.9%"], [2, "5.0–7.4%"], [3, "≥ 7.5%"]] },
      { key: "brow", label: "Brow bulge", options: [[0, "None (< 9%)"], [1, "Minimum (10–39%)"], [2, "Moderate (40–69%)"], [3, "Maximum (≥ 70%)"]] },
      { key: "eye", label: "Eye squeeze", options: [[0, "None"], [1, "Minimum"], [2, "Moderate"], [3, "Maximum"]] },
      { key: "nlf", label: "Nasolabial furrow", options: [[0, "None"], [1, "Minimum"], [2, "Moderate"], [3, "Maximum"]] },
    ],
    (t) => band(t, [[6, "good", "Minimal pain (≤ 6)."], [12, "warn", "Moderate pain (7–12)."], [21, "crit", "Severe pain (> 12)."]]),
    21),

  scale("finnegan", "Finnegan Neonatal Abstinence Scoring System", "neonatal",
    "Finnegan LP et al. 1975; J Addict Dis 2003 revision; NNF/IAP guidance",
    [
      { key: "cry", label: "Crying", options: [[0, "None"], [2, "High pitched"], [3, "Continuous high pitched"]] },
      { key: "sleep", label: "Sleep after feeding (h)", options: [[0, "> 3"], [1, "2–3"], [2, "1–2"], [3, "< 1"]] },
      { key: "moro", label: "Moro reflex", options: [[0, "Suppressed"], [1, "Hyperactive"], [2, "Markedly hyperactive"]] },
      { key: "tremor", label: "Tremors (disturbed)", options: [[0, "None"], [1, "Mild"], [2, "Moderate–severe"], [3, "Mild undisturbed"], [4, "Moderate–severe undisturbed"]] },
      { key: "tone", label: "Increased muscle tone", options: [[0, "Normal"], [1, "Increased"], [2, "Markedly increased"]] },
      { key: "seizures", label: "Convulsions", options: [[0, "None"], [5, "Present"]] },
      { key: "sweating", label: "Sweating", options: [[0, "No"], [1, "Yes"]] },
      { key: "fever", label: "Fever / yawning", options: [[0, "None"], [1, "< 37.3 °C"], [2, "≥ 37.3 °C"]] },
      { key: "mottling", label: "Mottling", options: [[0, "No"], [1, "Yes"]] },
      { key: "nose", label: "Nasal stuffiness / sneezing", options: [[0, "No"], [1, "Yes"]] },
      { key: "resp", label: "Respiratory rate", options: [[0, "< 60"], [1, "60–80 / retractions"]] },
      { key: "feeds", label: "Feeding", options: [[0, "Poor / regurgitation"], [2, "Excessive"]] },
      { key: "vomit", label: "Vomiting / loose stools", options: [[0, "No"], [2, "Regurgitation"], [3, "Projectile / loose"]] },
    ],
    (t) => band(t, [[7, "good", "Below threshold — rescore q4h."], [8, "warn", "At threshold — rescore in 1 h."], [16, "crit", "Above threshold — initiate pharmacotherapy."]]),
    40),

  scale("bell", "Bell Staging (NEC)", "neonatal",
    "Bell MJ et al. 1978; Walsh & Kliegman 1986; Kliegman & Walsh 1987",
    [
      { key: "bell", label: "Bell stage", options: [[1, "Stage IA — suspected"], [2, "Stage IB — suspected + ileus"], [3, "Stage IIA — definite, mildly ill"], [4, "Stage IIB — definite, moderately ill"], [5, "Stage IIIA — advanced, severely ill"], [6, "Stage IIIB — advanced + perforation"]] },
    ],
    (t) => band(t, [[1, "warn", "Suspected NEC — NPO, IV antibiotics, serial AXR."], [2, "warn", "Suspected NEC with ileus."], [3, "warn", "Definite NEC, mildly ill — medical management."], [4, "crit", "Definite NEC, moderately ill — portal gas / ascites; surgical consult."], [5, "crit", "Advanced NEC — bowel necrosis; urgent surgical referral."], [6, "crit", "Advanced NEC with perforation — urgent laparotomy / drain."]]),
    6),

  scale("papile", "Papile Grading (IVH)", "neonatal",
    "Papile LA et al. J Pediatr 1978;93:286–91; Volpe 2018 update",
    [
      { key: "grade", label: "IVH grade", options: [[1, "Grade I — germinal matrix haemorrhage"], [2, "Grade II — IVH without ventricular dilatation"], [3, "Grade III — IVH with ventricular dilatation"], [4, "Grade IV — IVH with parenchymal involvement"]] },
    ],
    (t) => band(t, [[1, "info", "Grade I — good prognosis, serial cranial USG."], [2, "info", "Grade II — good prognosis, monitor."], [3, "warn", "Grade III — risk of post-haemorrhagic dilatation; serial USG."], [4, "crit", "Grade IV — high risk of PVL, hydrocephalus, neurodevelopmental impairment."]]),
    4),

  scale("rop", "ROP Zone / Stage Classification", "neonatal",
    "International Classification of ROP, 3rd ed (ICROP3, 2021); AAP/AAO screening and treatment guidance",
    [
      { key: "zone", label: "Zone", options: [[1, "Zone I — posterior circle centred on optic disc"], [2, "Zone II — to nasal ora serrata"], [3, "Zone III — remaining temporal crescent"]] },
      { key: "stage", label: "Stage", options: [[0, "Stage 0 — immature vascularisation"], [1, "Stage 1 — demarcation line"], [2, "Stage 2 — ridge"], [3, "Stage 3 — extraretinal fibrovascular proliferation"], [4, "Stage 4A/4B — partial retinal detachment"], [5, "Stage 5 — total retinal detachment"]] },
      { key: "plus", label: "Posterior vascular status", options: [[0, "No plus disease"], [1, "Pre-plus disease"], [2, "Plus disease"]] },
      { key: "aprop", label: "Aggressive posterior ROP (AP-ROP)", options: [[0, "Absent"], [1, "Present"]] },
    ],
    (t, v) => {
      const stage = v?.stage ?? 0;
      const zone = v?.zone ?? 2;
      const vascular = v?.plus ?? 0;
      const plus = vascular === 2;
      const aprop = (v?.aprop ?? 0) === 1;
      const type1 = aprop
        || (zone === 1 && (plus || stage === 3))
        || (zone === 2 && plus && (stage === 2 || stage === 3));
      if (stage >= 4) {
        return { severity: "crit", interpretation: "Stage 4–5 ROP — retinal detachment is present or total. Urgent vitreoretinal ophthalmology referral; this screen does not choose surgical treatment." };
      }
      if (type1) {
        return { severity: "crit", interpretation: "Type 1 / treatment-requiring ROP or AP-ROP — urgent ophthalmology. Laser or anti-VEGF decision must be made by the treating ophthalmologist; treatment is generally performed promptly." };
      }
      if (zone === 1 && stage >= 1) {
        return { severity: "warn", interpretation: "Zone I ROP without the selected Type 1 criteria — high-risk disease requiring very close ophthalmology follow-up." };
      }
      if (zone === 2 && stage === 3 && !plus) {
        return { severity: "warn", interpretation: "Type 2 pattern: Zone II stage 3 without plus disease — close, usually weekly ophthalmology follow-up; treat if progression or plus develops." };
      }
      if (plus) {
        return { severity: "warn", interpretation: "Plus disease is present but the selected zone/stage combination is outside the Type 1 pattern — urgent specialist review and close follow-up are still required." };
      }
      if (vascular === 1) {
        return { severity: "warn", interpretation: "Pre-plus vascular abnormality — follow closely and correlate with the retinal examination; pre-plus is not equivalent to plus disease." };
      }
      return { severity: stage >= 2 ? "warn" : "good", interpretation: stage >= 2 ? "Active ROP without selected Type 1 criteria — follow the ophthalmologist's zone/stage schedule." : "No treatment threshold selected; continue the prescribed ROP screening schedule." };
    }),

  {
    id: "crib2", name: "CRIB-II", category: "neonatal",
    citation: "Parry G et al. Pediatrics 2003;111:281–7 (ELBW, GA < 32 wk, < 28 d)",
    fields: [
      sel("ga", "Gestational age (wk)", [[1, "> 27"], [3, "25–27"], [4, "24"], [7, "< 24"]]),
      sel("bw", "Birth weight (g)", [[0, "> 800"], [1, "751–800"], [4, "700–750"], [7, "< 700"]]),
      sel("temp", "Lowest temperature (°C)", [[0, "37.0–37.9"], [1, "36.0–36.9"], [2, "35.0–35.9"], [5, "34.0–34.9"], [8, "< 34"]]),
      sel("bsl", "Base excess (mmol/L)", [[0, "> -7.5"], [1, "-7.5 to -15.0"], [3, "< -15.0"]]),
      sel("pf", "pO₂/FiO₂ ratio", [[0, "No supplemental O₂"], [1, "1.00–2.49"], [3, "0.30–0.99"], [6, "< 0.30"]]),
    ],
    compute: (v) => out(`${Math.round(sum(v) * 10) / 10}`, band(sum(v), [[5, "good", "Very low risk."], [10, "warn", "Moderate mortality risk."], [15, "crit", "High mortality risk."], [30, "crit", "Very high mortality risk."]])),
  },

  {
    id: "snappe2", name: "SNAPPE-II / SNAP-II", category: "neonatal",
    citation: "Richardson DK et al. Pediatrics 2001;108:459–65",
    fields: [
      sel("map", "Mean BP (mmHg)", [[0, "≥ 30"], [9, "20–29"], [19, "< 20"]]),
      sel("temp", "Lowest temperature (°C)", [[0, "> 35.6"], [8, "35.0–35.6"], [15, "< 35.0"]]),
      sel("pf", "pO₂/FiO₂", [[0, "> 2.49"], [5, "1.0–2.49"], [16, "0.3–0.99"], [28, "< 0.3"]]),
      sel("ph", "Serum pH", [[0, "≥ 7.20"], [7, "7.10–7.19"], [16, "< 7.10"]]),
      sel("seiz", "Multiple seizures", [[0, "No"], [19, "Yes"]]),
      sel("urine", "Urine output (ml/kg/h)", [[0, "≥ 1.0"], [5, "0.1–0.9"], [18, "< 0.1"]]),
      sel("bw", "Birth weight (g)", [[0, "≥ 1000"], [10, "750–999"], [17, "< 750"]]),
      sel("sga", "Small for gestational age", [[0, "No"], [12, "Yes"]]),
      sel("apgar5", "Apgar at 5 min", [[0, "≥ 7"], [18, "< 7"]]),
    ],
    compute: (v) => {
      const full = sum(v);
      const snap2 = full - ((v.bw ?? 0) + (v.sga ?? 0) + (v.apgar5 ?? 0));
      return out(`SNAPPE-II ${full} · SNAP-II ${snap2}`,
        band(full, [[10, "good", "Mild illness / low risk."], [20, "warn", "Moderate risk (20–39)."], [40, "crit", "Very high mortality risk (≥ 40)."], [162, "crit", "Extreme risk."]]));
    },
  },

  {
    id: "ntiss", name: "NTISS (Therapeutic Intervention Scoring System)", category: "neonatal",
    citation: "Gray JE et al. Pediatrics 1992;90:564–9",
    fields: Object.entries({
      g1: "Assisted enteral tube feeding (2)", g2: "Parenteral nutrition / lipids (2)",
      g3: "Continuous pulse oximetry (2)", g4: "Temp regulation / skin care (1–5)",
      m1: "Continuous vital signs (5)", m2: "Frequent BP checks (3)",
      m3: "Continuous BP / CVP (4)", m4: "Intermittent BP (2)",
      m5: "Arterial line sampling (3)", m6: "Intermittent lab sampling (1)",
      m7: "Cardiac / respiratory monitor (3)", m8: "ECG (2)",
      r1: "Chest physiotherapy (1)", r2: "Airway suctioning (2)",
      r3: "Mechanical ventilation (5)", r4: "CPAP / nasal prong O₂ (3)",
      r5: "Supplemental O₂ (1)", r6: "Chest tube (5)",
      r7: "Ventilation with surfactant (8)",
      p1: "Antibiotics (2)", p2: "Anticonvulsants (2)", p3: "Corticosteroids (2)",
      p4: "Vasoactive drugs (4)", p5: "Bronchodilators (2)", p6: "Diuretics (3)",
      p7: "Narcotics / analgesics (4)", p8: "Anticoagulants / thrombolytics (5)",
      p9: "Blood / component transfusion (3)",
    }).map(([key, label]) => {
      const pts = parseInt(label.match(/\((\d+)\)/)?.[1] ?? "0", 10);
      return sel(key, label.replace(/ \(\d+\)$/, ""), [[0, "No"], [pts, `Yes (+${pts})`]]);
    }),
    compute: (v) => out(`${sum(v)}`, band(sum(v), [[9, "good", "Low intensity of care."], [20, "warn", "Moderate therapy intensity."], [30, "crit", "High therapy intensity."], [60, "crit", "Very high — PICU-level neonatal care."]])),
  },

  scale("ballard", "New Ballard Score (gestational age)", "neonatal",
    "Ballard JL et al. J Pediatr 1991;119:417–23; official New Ballard Score sheet and conversion guidance (20–44 weeks)",
    [
      { key: "posture", label: "Posture", options: [[-1, "Arms and legs extended"], [0, "Slight flexion"], [1, "Beginning flexion"], [2, "Well flexed"], [3, "Full flexion"]] },
      { key: "sw", label: "Square window (wrist)", options: [[-1, "> 90°"], [0, "90°"], [1, "60°"], [2, "45°"], [3, "< 45°"], [4, "0°"]] },
      { key: "ar", label: "Arm recoil", options: [[-1, "180° / no recoil"], [0, "140–180°"], [1, "110–140°"], [2, "90–110°"], [3, "< 90°"], [4, "Full recoil"]] },
      { key: "pa", label: "Popliteal angle", options: [[-1, "180°"], [0, "160°"], [1, "140°"], [2, "120°"], [3, "100°"], [4, "90°"], [5, "< 90°"]] },
      { key: "sc", label: "Scarf sign", options: [[-1, "Full crossing"], [0, "Opposite axilla"], [1, "Contralateral axilla"], [2, "At chin"], [3, "At nipple"], [4, "Between nipple and umbilicus"]] },
      { key: "he", label: "Heel to ear", options: [[-1, "Heel to whole leg / ear"], [0, "Heel near ear"], [1, "Heel between ear and nipple"], [2, "Heel at nipple"], [3, "Heel above nipple"], [4, "Heel below nipple"]] },
      { key: "skin", label: "Skin", options: [[-1, "Sticky, friable, transparent"], [0, "Gelatinous, red, translucent"], [1, "Smooth pink, visible veins"], [2, "Superficial peeling or rash"], [3, "Cracking, pale areas"], [4, "Parchment, deep cracking"], [5, "Leathery, cracked, wrinkled"]] },
      { key: "lanugo", label: "Lanugo", options: [[-1, "None"], [0, "Sparse"], [1, "Abundant"], [2, "Thinning"], [3, "Bald areas"], [4, "Mostly bald"]] },
      { key: "plantar", label: "Plantar surface", options: [[-2, "Heel-toe length < 40 mm"], [-1, "Heel-toe length 40–50 mm"], [0, "> 50 mm, no crease"], [1, "Faint red marks"], [2, "Anterior transverse crease only"], [3, "Creases over anterior two-thirds"], [4, "Creases over entire sole"]] },
      { key: "breast", label: "Breast", options: [[-1, "Imperceptible"], [0, "Barely perceptible"], [1, "Flat areola, no bud"], [2, "Stippled areola, 1–2 mm bud"], [3, "Raised areola, 3–4 mm bud"], [4, "Full areola, 5–10 mm bud"]] },
      { key: "eyeear", label: "Eye / ear", options: [[-1, "Lids fused loosely"], [0, "Lids open, pinna flat; stays folded"], [1, "Slightly curved, soft; slow recoil"], [2, "Well curved, soft; ready recoil"], [3, "Formed and firm; instant recoil"], [4, "Thick cartilage; ear stiff"]] },
      { key: "genitalia", label: "Genitalia (select sex-appropriate description)", options: [[-1, "Male: scrotum flat and smooth · Female: clitoris prominent, labia flat"], [0, "Male: scrotum empty, faint rugae · Female: prominent clitoris, small labia minora"], [1, "Male: testes upper canal, rare rugae · Female: prominent clitoris, enlarging minora"], [2, "Male: testes descending, few rugae · Female: majora and minora equally prominent"], [3, "Male: testes down, good rugae · Female: majora large, minora small"], [4, "Male: testes pendulous, deep rugae · Female: majora cover clitoris and minora"]] },
      { key: "sex", label: "Genitalia row used", options: [[0, "Male"], [1, "Female"]] },
    ],
    (t) => {
      const completedWeeks = newBallardCompletedWeeks(t);
      if (completedWeeks === null) {
        return { severity: "warn", interpretation: `Total maturity score ${t} is outside the validated New Ballard range (−10 to 50).` };
      }
      return {
        severity: completedWeeks < 32 ? "crit" : completedWeeks < 37 ? "warn" : "info",
        interpretation: `Estimated gestational age ${completedWeeks} completed weeks (maturity score ${t}). This uses the official even-week grid with downward interpolation to completed weeks; correlate with reliable early ultrasound or menstrual dates, as clinical estimates are typically only accurate within about 2 weeks.`,
      };
    },
    undefined,
    (v) => Object.entries(v).reduce((total, [key, value]) => key === "sex" ? total : total + value, 0)),

  /* ================= Critical Care Severity & Mortality ================= */
  {
    id: "abg-vbg-auto-interpreter",
    name: "ABG / VBG Auto Interpreter",
    category: "critical",
    citation:
      "Standard acid-base interpretation using arterial / venous blood gas patterns, Winter's formula, expected respiratory compensation rules, albumin-corrected anion gap, and PaO₂/FiO₂ oxygenation grading for ABG samples.",
    fields: [],
    compute: () => ({
      value: "Live auto-interpretation enabled below",
      severity: "info",
      note: "Enter pH, pCO₂ and HCO₃⁻ to classify primary acid-base disorder, compensation, anion gap and oxygenation.",
    }),
  },

  {
    id: "prism3", name: "PRISM III", category: "critical",
    citation: "Pollack MM et al. Crit Care Med 1996;24:743–52 (PICU, first 12 & 24 h)",
    fields: [
      sel("sbp", "Systolic BP (mmHg)", [[3, "< 40"], [7, "40–50"], [0, "≥ 51"]]),
      sel("temp", "Lowest temperature (°C)", [[3, "< 33"], [0, "≥ 33"]]),
      sel("mental", "Mental status", [[5, "Confused / agitated"], [7, "Stupor / coma"], [10, "GCS < 8"], [0, "Normal"]]),
      sel("pupils", "Pupillary reflexes", [[7, "Both fixed & dilated"], [11, "One fixed & dilated"], [0, "Both reactive"]]),
      sel("hr", "Heart rate", [[3, "Tachy"], [4, "Brady"], [0, "Normal"]]),
      sel("ph", "pH", [[2, "7.28–7.34"], [6, "< 7.28"], [0, "≥ 7.35"]]),
      sel("pco2", "pCO₂ (mmHg)", [[2, "50–65"], [6, "> 65"], [0, "< 50"]]),
      sel("glu", "Blood glucose (mg/dL)", [[2, "> 200"], [5, "> 250"], [0, "Normal"]]),
      sel("pot", "Potassium (mEq/L)", [[5, "< 3.0"], [5, "> 6.5"], [0, "Normal"]]),
      sel("creat", "Creatinine (mg/dL)", [[2, "0.9–1.5"], [3, "1.6–2.8"], [6, "> 2.8"], [0, "Normal"]]),
      sel("wbc", "Total WBC (/mm³)", [[4, "< 3000"], [5, "> 15000"], [0, "Normal"]]),
      sel("plt", "Platelets (/mm³)", [[4, "< 50000"], [6, "< 100000"], [0, "≥ 100000"]]),
      sel("pt", "PT / aPTT", [[3, "PT 1.3× control"], [3, "aPTT 1.25× control"], [0, "Normal"]]),
    ],
    compute: (v) => out(`${sum(v)}`, band(sum(v), [[0, "good", "Low risk of mortality."], [5, "warn", "Moderate risk."], [10, "warn", "High risk."], [20, "crit", "Very high risk of mortality."]])),
  },

  {
    id: "pim3", name: "PIM3 (Paediatric Index of Mortality 3)", category: "critical",
    citation: "Straney L et al. Pediatr Crit Care Med 2013;14:673–81 (admission-only)",
    fields: [
      sel("elective", "Elective ICU admission", [[0, "No"], [1, "Yes"]]),
      sel("surgery", "Recovery from surgery", [[0, "No"], [1, "Yes"]]),
      sel("cardiac", "Underlying diagnosis — cardiac", [[0, "Non-cardiac"], [1, "Cardiac bypass"], [2, "Cardiac non-bypass"]]),
      sel("pupils", "Fixed pupils at admission", [[0, "No"], [1, "Yes"]]),
      sel("vent", "Mechanical ventilation in first hour", [[0, "No"], [1, "Yes"]]),
      sel("sbp", "Systolic BP", [[0, "Normal"], [1, "Low"]]),
      sel("base", "Base excess (mmol/L)", [[0, "Normal"], [1, "Deranged"]]),
    ],
    compute: (v) => out(`PIM3 sum ${sum(v)}`, band(sum(v), [[0, "good", "Low risk of mortality."], [1, "warn", "Moderate risk."], [3, "warn", "High risk."], [6, "crit", "Very high risk."]])),
  },

  scale("pelod2", "PELOD-2", "critical",
    "Leteurtre S et al. Pediatr Crit Care Med 2013;14:e461–9",
    [
      sel("gcs", "GCS", [[0, "10–15"], [1, "7–9"], [3, "4–6"], [5, "3"]]),
      sel("pupils", "Pupillary reaction", [[0, "Both reactive"], [5, "One fixed / both unreactive"]]),
      sel("lactate", "Lactate (mmol/L)", [[0, "< 5"], [1, "≥ 5"]]),
      sel("map", "Mean arterial pressure", [[0, "Above threshold"], [2, "Below age threshold"]]),
      sel("creat", "Creatinine (µmol/L)", [[0, "< 93"], [2, "≥ 93"]]),
      sel("pao2", "PaO₂ / FiO₂", [[0, "≥ 300"], [3, "< 300"]]),
      sel("pco2", "PaCO₂ (mmHg)", [[0, "< 51"], [3, "≥ 51"]]),
      sel("invasive", "Invasive ventilation", [[0, "No"], [3, "Yes"]]),
      sel("wbc", "Total WBC (/mm³)", [[0, "≥ 2000"], [5, "< 2000"]]),
    ],
    (t) => band(t, [[0, "good", "No organ dysfunction."], [5, "warn", "Mild–moderate dysfunction."], [10, "warn", "Significant dysfunction."], [20, "crit", "Severe multi-organ dysfunction."]])),

  scale("psofa", "pSOFA", "critical",
    "Matics ES & Sanchez-Pinto LN 2017; adapted from Vincent SOFA 1996",
    [
      sel("pf", "PaO₂/FiO₂ (mmHg)", [[0, "≥ 400"], [1, "< 400"], [2, "< 300"], [3, "< 200 or SpO₂/FiO₂ ≤ 330"]]),
      sel("platelets", "Platelets (×10³/µL)", [[0, "≥ 150"], [1, "< 150"], [2, "< 100"], [3, "< 50"]]),
      sel("map", "Vasoactives / MAP", [[0, "None / MAP ≥ 5th centile"], [1, "MAP < 5th centile"], [2, "Dopamine ≤ 5 or dobutamine"], [3, "Dopamine > 5 / adrenaline / noradrenaline"]]),
      sel("gcs", "GCS", [[0, "≥ 14"], [1, "11–13"], [2, "8–10"], [3, "< 8"]]),
      sel("creat", "Creatinine (mg/dL) or urine output", [[0, "< 0.8 / ≥ 1 ml/kg/h"], [1, "0.8–1.1 / < 1"], [2, "1.2–1.9 / < 0.5"], [3, "≥ 2 / anuria"]]),
      sel("bili", "Bilirubin (mg/dL)", [[0, "< 1.2"], [1, "1.2–2.9"], [2, "3.0–5.9"], [3, "≥ 6.0"]]),
    ],
    (t) => band(t, [[0, "good", "No organ dysfunction."], [3, "warn", "Mild–moderate dysfunction."], [6, "warn", "Significant dysfunction."], [10, "crit", "Severe multi-organ dysfunction (SOFA ≥ 2 = sepsis-associated)."]])),

  scale("pards", "PARDS Criteria", "critical",
    "PALICC Group, Pediatr Crit Care Med 2015 (updated 2023)",
    [
      sel("timing", "Timing", [[1, "Within 7 days of known insult"], [0, "> 7 days / unclear"]]),
      sel("chest", "Chest imaging", [[1, "Bilateral opacities not explained by effusion / atelectasis"], [0, "Other"]]),
      sel("origin", "Origin of oedema", [[1, "Not fully explained by cardiac failure or fluid overload"], [0, "Other"]]),
      sel("oi", "Severity (OI or OSI)", [[0, "Mild — OI 4–8 / OSI 5–7"], [1, "Moderate — OI 8–16 / OSI 7.6–12.3"], [2, "Severe — OI > 16 / OSI > 12.3"]]),
    ],
    (t, v) => {
      const allMet = (v.timing ?? 0) && (v.chest ?? 0) && (v.origin ?? 0);
      const sev = v.oi ?? 0;
      if (!allMet) return { severity: "info", note: "Timing, imaging or oedema-origin criterion not met." };
      const label = sev === 2 ? "Severe" : sev === 1 ? "Moderate" : "Mild";
      return {
        severity: sev === 2 ? "crit" : sev === 1 ? "warn" : "info",
        note: sev === 2 ? `${label} PARDS — consider HFOV / ECMO referral, lung-protective ventilation.`
          : sev === 1 ? `${label} PARDS — lung-protective ventilation, PEEP titration.`
          : `${label} PARDS — supportive care, monitor closely.`,
      };
    }),

  /* ================= Pain & Sedation ================= */
  scale("flacc", "FLACC Scale", "pain",
    "Merkel SI et al. Pediatr Nurs 1997 (2 mo–7 y / non-verbal)",
    [
      { key: "face", label: "Face", options: [[0, "No particular expression"], [1, "Occasional grimace"], [2, "Frequent quivering chin"]] },
      { key: "legs", label: "Legs", options: [[0, "Normal position"], [1, "Uneasy, restless"], [2, "Kicking, legs drawn up"]] },
      { key: "activity", label: "Activity", options: [[0, "Lying quietly"], [1, "Squirming, tense"], [2, "Arched, rigid, jerking"]] },
      { key: "cry", label: "Cry", options: [[0, "No cry"], [1, "Moans / whimpers"], [2, "Crying steadily, screams"]] },
      { key: "consol", label: "Consolability", options: [[0, "Content, relaxed"], [1, "Reassured by touch"], [2, "Difficult to console"]] },
    ],
    (t) => band(t, [[0, "good", "No pain."], [3, "warn", "Mild–moderate pain."], [6, "warn", "Moderate–severe pain."], [10, "crit", "Severe pain — treat now."]])),

  {
    id: "wongbaker", name: "Wong-Baker FACES Pain Rating Scale", category: "pain",
    citation: "Wong DL & Baker CM, Pediatr Nurs 1988; Hockenberry MJ 2005 (≥ 3 y)",
    fields: [f("score", "Self-reported score", 0, 10, "0 = no hurt, 10 = worst")],
    compute: (v) => out(`${v.score ?? 0}/10`, band(v.score ?? 0,
      [[0, "good", "No hurt."], [2, "info", "Hurts little bit."], [4, "warn", "Hurts little more."], [6, "warn", "Hurts even more."], [8, "crit", "Hurts whole lot."], [10, "crit", "Hurts worst."]])),
  },

  scale("comfortb", "COMFORT-B (Behavioural Scale)", "pain",
    "van Dijk M et al. 2000; Ista E et al. 2009 (PICU sedation)",
    [
      { key: "alert", label: "Alertness", options: [[1, "Deeply asleep"], [2, "Lightly asleep"], [3, "Drowsy"], [4, "Fully awake"], [5, "Hyper-alert"]] },
      { key: "calm", label: "Calmness / agitation", options: [[1, "Calm"], [2, "Slightly anxious"], [3, "Anxious"], [4, "Very anxious"], [5, "Panicky"]] },
      { key: "resp", label: "Respiratory response", options: [[1, "No coughing / no spontaneous breaths"], [2, "Little or no response"], [3, "Occasional cough / rebel"], [4, "Actively breathes against ventilator"], [5, "Fights ventilator, coughing"]] },
      { key: "cry", label: "Crying", options: [[1, "Quiet"], [2, "Sobbing / occasional moan"], [3, "Crying intermittently"], [4, "Almost continuously crying"], [5, "Full-scale crying"]] },
      { key: "body", label: "Physical movement", options: [[1, "No movement"], [2, "Occasional movement"], [3, "Frequent slight movement"], [4, "Vigorous movement incl. extremities"], [5, "Vigorous movement incl. torso and head"]] },
      { key: "facial", label: "Facial tension", options: [[1, "Totally relaxed"], [2, "Normal facial tone"], [3, "Tone increased, forehead/facial muscles prominent"], [4, "Facial muscles contorted"], [5, "Facial muscles contorted, grimacing"]] },
      { key: "posture", label: "Muscle tone", options: [[1, "No resistance"], [2, "Resistance to passive arm movement"], [3, "Strong resistance, won't relax"], [4, "Extremely tense, difficult to ventilate"], [5, "Extremely tense, arching back / neck"]] },
    ],
    (t) => band(t, [[11, "good", "Deep sedation (≤ 11)."], [17, "warn", "Light sedation (12–17)."], [22, "warn", "Sedation inadequate / awake (18–22)."], [35, "crit", "Agitated / pain likely (> 22)."]]),
    35),

  scale("riley", "Riley Infant Pain Scale", "pain",
    "Joyce BA et al. J Soc Pediatr Nurs 1994 (≤ 36 mo)",
    [
      { key: "facial", label: "Facial expression", options: [[0, "Neutral"], [1, "Frowning"], [2, "Grimacing"]] },
      { key: "body", label: "Body position", options: [[0, "Neutral"], [1, "Tense"], [2, "Rigid"]] },
      { key: "motor", label: "Motor activity", options: [[0, "Still"], [1, "Squirming"], [2, "Thrashing"]] },
      { key: "sleep", label: "Sleep", options: [[0, "Normal"], [1, "Less than usual"], [2, "No sleep"]] },
      { key: "consol", label: "Consolability", options: [[0, "Easily consoled"], [1, "Consolable with effort"], [2, "Inconsolable"]] },
      { key: "affinity", label: "Affection toward caregiver", options: [[0, "Normal"], [1, "Diminished"], [2, "Absent"]] },
    ],
    (t) => band(t, [[2, "good", "Minimal pain."], [5, "warn", "Moderate pain."], [12, "crit", "Severe pain."]])),

  scale("sbs", "State Behavioural Scale (SBS)", "pain",
    "Curley MAQ et al. 2006 (Pediatr Crit Care Med)",
    [
      { key: "sbs", label: "Observed state", options: [
        [-3, "-3 Unarousable (deep sedation)"],
        [-2, "-2 Responsive to noxious stimuli"],
        [-1, "-1 Responsive to gentle touch / voice"],
        [0, "0 Awake and able to maintain eye contact"],
        [1, "+1 Agitated but will console"],
        [2, "+2 Agitated, does not consistently console"],
        [3, "+3 Very agitated, unsafe (risk of injury)"],
      ]},
    ],
    (t, v) => {
      const s = v.sbs ?? 0;
      return {
        severity: s >= 2 ? "crit" : s === 1 ? "warn" : s <= -3 ? "warn" : "good",
        note: s >= 2 ? "Severely agitated — assess pain, ventilator synchrony, safety."
          : s === 1 ? "Mildly agitated — reassure, review analgesia."
          : s <= -3 ? "Deep sedation — minimise sedation if clinically appropriate."
          : s <= -1 ? "Appropriate sedation range (-1 to 0)." : "Awake and calm.",
      };
    }),

  scale("wat1", "WAT-1 (Withdrawal Assessment Tool v1)", "pain",
    "Franck LS et al. 2008; Curley MAQ 2014 (PICU weaning)",
    [
      { key: "diarrhoea", label: "Diarrhoea (3+ loose stools / 24 h)", options: [[0, "No"], [2, "Yes"]] },
      { key: "vomit", label: "Vomiting / retching / gagging", options: [[0, "No"], [2, "Yes"]] },
      { key: "temp", label: "Temperature ≥ 37.8 °C", options: [[0, "No"], [1, "Yes"]] },
      { key: "tacho", label: "HR ≥ 20% above age baseline", options: [[0, "No"], [1, "Yes"]] },
      { key: "mydriasis", label: "Any 3 of tremor / yawning / sneezing / mydriasis", options: [[0, "No"], [1, "Yes"]] },
      { key: "sweating", label: "Diaphoresis / unexplained sweating", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement", label: "Time to fall asleep > 20 min", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement2", label: "Involuntary movement / tremor / seizure-like activity", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement3", label: "Any 3 of agitation / crying / reduced wake response / increased sedation", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement4", label: "Decreased interaction / limited response to staff", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement5", label: "Uncooperative / fighting ventilator", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement6", label: "Grimacing / furrowed brow", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement7", label: "Increased tone / level of consciousness", options: [[0, "No"], [1, "Yes"]] },
      { key: "movement8", label: "Increased need for non-pharmacological intervention", options: [[0, "No"], [1, "Yes"]] },
    ],
    (t) => band(t, [[2, "good", "No clinically significant withdrawal."], [3, "warn", "WAT-1 = 3 — monitor closely."], [11, "crit", "WAT-1 ≥ 3 — withdrawal present; taper opioids, add adjuncts."]]),
    12),

  /* ================= Vital Signs & Early Warning ================= */
  scale("pews", "PEWS (Brighton / Bedside Paediatric Early Warning Score)", "warning",
    "Monaghan A, Nursing Standard 2005; Paediatric Early Warning Score (Brighton PEWS)",
    [
      { key: "behaviour", label: "Behaviour", options: [[0, "Playing / appropriate"], [1, "Sleeping"], [2, "Irritable"], [3, "Lethargic / confused"]] },
      { key: "cvs", label: "Cardiovascular", options: [[0, "Pink or CRT 1–2 s"], [1, "Pale or CRT 3 s"], [2, "Grey or CRT 4 s"], [3, "Grey & mottled or CRT ≥ 5 s"]] },
      { key: "resp", label: "Respiratory", options: [[0, "Within normal"], [1, "RR > 10 above normal or accessory muscle use"], [2, "RR > 20 above normal or recession"], [3, "RR ≥ 5 below normal + sternal recession or grunting"]] },
    ],
    (t) => band(t, [[2, "good", "Stable — routine observation."], [4, "warn", "At risk — reassess hourly."], [6, "warn", "Deteriorating — notify SR, reassess q30 min."], [13, "crit", "Critical — PICU review immediately."]]),
    13),

  scale("pmews", "PMEWS (Paediatric Modified Early Warning Score)", "warning",
    "Tume L & Thorburn K 2007; Paediatric Early Warning System (Northern England)",
    [
      { key: "behav", label: "Behaviour", options: [[0, "Normal"], [1, "Abnormal for age"], [2, "Abnormal and drowsy"], [3, "Unresponsive / requires stimulation"]] },
      { key: "resp", label: "Respiratory rate", options: [[0, "Within normal"], [1, "Slightly raised"], [2, "Markedly raised"], [3, "Severely deranged / apnoea"]] },
      { key: "cv", label: "Cardiovascular", options: [[0, "Normal"], [1, "Tachy / brady mild"], [2, "Marked tachy / brady"], [3, "Severe / hypotension"]] },
      { key: "temp", label: "Temperature", options: [[0, "36.1–37.2 °C"], [1, "37.3–38.0 °C"], [2, "38.1–38.5 °C"], [3, "> 38.5 or < 36 °C"]] },
      { key: "sp", label: "SpO₂ / O₂ requirement", options: [[0, "≥ 95% room air"], [1, "92–94% or 1–2 L"], [2, "90–91% or > 2 L"], [3, "< 90% on high-flow / ventilation"]] },
    ],
    (t) => band(t, [[1, "good", "Stable."], [3, "warn", "Review — increase observations."], [5, "warn", "Escalate to SR."], [13, "crit", "Emergency team review now."]]),
    13),

  {
    id: "agevitals", name: "Age-Based Vital Sign Reference (lookup)", category: "warning",
    citation: "Advanced Paediatric Life Support (APLS) 8th ed.; RCH Melbourne Clinical Practice Guidelines",
    fields: [
      sel("band", "Age group", [
        [0, "Neonate (< 28 d)"], [1, "1–12 months"], [2, "1–3 years"],
        [3, "3–5 years"], [4, "5–12 years"], [5, "> 12 years"],
      ]),
    ],
    compute: (v) => {
      const bands = [
        { hr: "110–160", rr: "40–60", sbp: "65–90", map: "≥ 40", crt: "< 2 s", wt: "3–5 kg" },
        { hr: "110–160", rr: "30–50", sbp: "70–100", map: "≥ 40", crt: "< 2 s", wt: "5–10 kg" },
        { hr: "100–150", rr: "25–35", sbp: "80–100", map: "≥ 45", crt: "< 2 s", wt: "10–15 kg" },
        { hr: "95–140", rr: "20–30", sbp: "85–105", map: "≥ 50", crt: "< 2 s", wt: "15–20 kg" },
        { hr: "80–120", rr: "16–25", sbp: "90–115", map: "≥ 55", crt: "< 2 s", wt: "20–40 kg" },
        { hr: "60–110", rr: "12–20", sbp: "100–135", map: "≥ 60", crt: "< 2 s", wt: "> 40 kg" },
      ];
      const r = bands[v.band ?? 0];
      return out(`HR ${r.hr} · RR ${r.rr}`, {
        severity: "info",
        interpretation: `HR ${r.hr}/min · RR ${r.rr}/min · SBP ${r.sbp} mmHg · MAP ≥ ${r.map} · CRT ${r.crt} · weight ~${r.wt} kg`,
      });
    },
  },

  /* ================= Respiratory ================= */
  scale("westley", "Westley Croup Score", "respiratory",
    "Westley CR et al. Pediatrics 1978 (croup, 0–17)",
    [
      { key: "stridor", label: "Stridor", options: [[0, "None"], [1, "At rest"], [2, "With agitation"]] },
      { key: "retract", label: "Retractions", options: [[0, "None"], [1, "Mild"], [2, "Moderate"], [3, "Severe"]] },
      { key: "air", label: "Air entry", options: [[0, "Normal"], [1, "Decreased"], [2, "Markedly decreased"]] },
      { key: "cyan", label: "Cyanosis", options: [[0, "None"], [4, "With agitation"], [5, "At rest"]] },
      { key: "mental", label: "Level of consciousness", options: [[0, "Normal"], [1, "Altered"], [2, "Disoriented"], [3, "Depressed"], [4, "Coma"]] },
    ],
    (t) => band(t, [[2, "good", "Mild croup — dexamethasone, observe."], [3, "warn", "Mild–moderate — dexamethasone ± nebulised epinephrine."], [6, "crit", "Severe — nebulised epinephrine, consider intubation."]]),
    17),

  scale("pram", "PRAM (Paediatric Respiratory Assessment Measure)", "respiratory",
    "Gorelick M et al. Arch Pediatr Adolesc Med 2004 (asthma, 0–12)",
    [
      { key: "sao2", label: "SpO₂", options: [[0, "≥ 94%"], [1, "91–93%"], [2, "< 91%"]] },
      { key: "supra", label: "Suprasternal retraction", options: [[0, "None"], [2, "Intermittent"], [3, "Continuous"]] },
      { key: "scalene", label: "Scalene muscle retraction", options: [[0, "None"], [1, "Intermittent"], [2, "Continuous"]] },
      { key: "wheez", label: "Wheeze — inspiratory", options: [[0, "None / end expiratory only"], [1, "Expiratory only"], [2, "Inhale + exhale"], [3, "Audible without stethoscope"]] },
      { key: "wheez2", label: "Wheeze — expiratory", options: [[0, "None"], [1, "Expiratory only"], [2, "Inhale + exhale"], [3, "Audible without stethoscope"]] },
      { key: "air", label: "Air entry", options: [[0, "Normal"], [1, "Unequal basally"], [2, "Decreased at lung bases"], [3, "Minimal / absent"]] },
    ],
    (t) => band(t, [[3, "good", "Mild — discharge / good response."], [7, "warn", "Moderate — inhaled bronchodilator ± steroid."], [12, "crit", "Severe — continuous nebulisation, IV magnesium, ICU review."]]),
    12),

  scale("pass", "PASS (Paediatric Asthma Severity Score)", "respiratory",
    "Gorelick MH et al. Acad Emerg Med 2004 (0–18)",
    [
      { key: "wheezA", label: "Wheeze (anterior chest)", options: [[0, "None"], [1, "End-expiratory"], [2, "Expiratory"], [3, "Inspiratory & expiratory"], [4, "Audible without stethoscope"]] },
      { key: "wheezP", label: "Wheeze (posterior chest)", options: [[0, "None"], [1, "End-expiratory"], [2, "Expiratory"], [3, "Inspiratory & expiratory"], [4, "Audible without stethoscope"]] },
      { key: "ratio", label: "Length of expiration : inspiration", options: [[0, "1:2 or less"], [1, "1:3"], [2, "1:4"], [3, "> 1:4"]] },
      { key: "sao2", label: "SpO₂", options: [[0, "≥ 94%"], [1, "91–93%"], [2, "< 91%"]] },
      { key: "accessory", label: "Accessory muscle use", options: [[0, "None"], [1, "Sternocleidomastoid"], [2, "Suprasternal + scalene"], [3, "Intercostal / subcostal"], [4, "Suprasternal + intercostal"]] },
      { key: "mental", label: "Mental status", options: [[0, "Alert"], [1, "Agitated"], [2, "Depressed / confused"]] },
    ],
    (t) => band(t, [[5, "good", "Mild — discharge consideration."], [8, "warn", "Moderate — emergency treatment."], [19, "crit", "Severe — ICU consideration, IV therapy."]]),
    19),

  scale("rdai", "RDAI (Respiratory Distress Assessment Instrument)", "respiratory",
    "Wojcik R et al. Ann Emerg Med 1993 (bronchiolitis)",
    [
      { key: "rate", label: "Respiratory rate", options: [[0, "< 40"], [1, "40–50"], [2, "50–60"], [3, "> 60"]] },
      { key: "wheeze", label: "Wheeze", options: [[0, "None"], [1, "End expiratory"], [2, "Whole expiration"], [3, "Inspiration + expiration"], [4, "Audible without stethoscope"], [5, "Barely audible"]] },
      { key: "retract", label: "Retractions — suprasternal", options: [[0, "None"], [1, "Mild"], [2, "Moderate"], [3, "Marked"]] },
      { key: "retract2", label: "Retractions — intercostal", options: [[0, "None"], [1, "Mild"], [2, "Moderate"], [3, "Marked"]] },
      { key: "retract3", label: "Retractions — subcostal", options: [[0, "None"], [1, "Mild"], [2, "Moderate"], [3, "Marked"]] },
    ],
    (t) => band(t, [[3, "good", "Mild — supportive."], [7, "warn", "Moderate — consider nebulised epinephrine."], [16, "crit", "Severe — escalate to HDU / PICU."]]),
    16),

  scale("tal", "Tal Score (infant acute life-threatening event)", "respiratory",
    "Tal A et al. J Pediatr 1998 (ALTE risk stratification)",
    [
      { key: "colour", label: "Colour change", options: [[0, "None"], [1, "Cyanotic / pale / red"]] },
      { key: "resp", label: "Respiratory change", options: [[0, "None"], [1, "Apnoea / altered breathing"]] },
      { key: "tone", label: "Change in muscle tone", options: [[0, "None"], [1, "Hypertonia / hypotonia"]] },
      { key: "choke", label: "Choking / gagging", options: [[0, "None"], [1, "Present"]] },
      { key: "age", label: "Age > 1 month", options: [[0, "≤ 1 month"], [1, "> 1 month"]] },
      { key: "formula", label: "Exclusively formula-fed", options: [[0, "No"], [1, "Yes"]] },
    ],
    (t) => band(t, [[2, "good", "Low risk — observe, consider reflux."], [3, "warn", "Moderate risk — investigate."], [6, "crit", "High risk — admit, full workup, consider cardiopulmonary monitoring."]]),
    6),

  scale("wood", "Wood-Downes Score (status asthmaticus)", "respiratory",
    "Downes JJ & Wood DW, Pediatr Clin North Am 1970 (modified Wood)",
    [
      { key: "mental", label: "Conscious level", options: [[0, "Normal"], [1, "Depressed / agitated"], [2, "Coma / combatative"]] },
      { key: "cyan", label: "Cyanosis in FiO₂ 0.40", options: [[0, "Absent"], [1, "Present"], [2, "Present with ABG PaO₂ < 65"]] },
      { key: "air", label: "Air entry", options: [[0, "Decreased"], [1, "Markedly decreased"], [2, "Silent chest"]] },
      { key: "access", label: "Use of accessory muscles", options: [[0, "None / minimal"], [1, "Moderate"], [2, "Marked"]] },
      { key: "wheeze", label: "Expiratory wheeze", options: [[0, "Moderate"], [1, "Marked"], [2, "Absent — no air entry"]] },
      { key: "pulsus", label: "Pulsus paradoxus (mmHg)", options: [[0, "< 10"], [1, "10–20"], [2, "> 25"]] },
    ],
    (t) => band(t, [[4, "good", "Mild — inhaled therapy."], [6, "warn", "Moderate — add IV bronchodilators, steroids."], [8, "warn", "Severe — HDU / PICU, consider ventilation."], [12, "crit", "Impending respiratory failure — intubate."]]),
    12),

  scale("mpis", "Modified Pulmonary Index Score", "respiratory",
    "Gorelick MH et al. 2006 (asthma severity, 0–18)",
    [
      { key: "sao2", label: "SpO₂", options: [[0, "≥ 94%"], [1, "91–93%"], [2, "< 91%"]] },
      { key: "access", label: "Accessory muscle use", options: [[0, "None"], [1, "Sternocleidomastoid"], [2, "Suprasternal + scalene"], [3, "Intercostal + subcostal"]] },
      { key: "air", label: "Air entry", options: [[0, "Normal"], [1, "Decreased"], [2, "Markedly decreased"], [3, "Minimal / absent"]] },
      { key: "wheez", label: "Expiratory wheeze", options: [[0, "None"], [1, "End expiratory"], [2, "Inhale & exhale"], [3, "Audible without stethoscope"]] },
      { key: "ratio", label: "Exp : Insp ratio", options: [[0, "< 1:2"], [1, "1:3"], [2, "1:4"], [3, "> 1:4"]] },
      { key: "hr", label: "Heart rate", options: [[0, "Normal"], [1, "Slightly raised"], [2, "Markedly raised"], [3, "Very raised"]] },
    ],
    (t) => band(t, [[6, "good", "Mild."], [10, "warn", "Moderate."], [18, "crit", "Severe."]]),
    18),

  /* ================= Cardiovascular ================= */
  {
    id: "vis", name: "Vasoactive-Inotropic Score (VIS)", category: "cardio",
    citation: "Gaies MG et al. Pediatr Crit Care Med 2010;11:234–8 (post cardiac surgery)",
    fields: [
      f("dopamine", "Dopamine (µg/kg/min)", 0, 100),
      f("dobutamine", "Dobutamine (µg/kg/min)", 0, 100),
      f("adrenaline", "Adrenaline / Epinephrine (µg/kg/min)", 0, 5),
      f("noradrenaline", "Noradrenaline (µg/kg/min)", 0, 5),
      f("milrinone", "Milrinone (µg/kg/min)", 0, 5),
      f("vasopressin", "Vasopressin (mU/kg/min)", 0, 10),
    ],
    compute: (v) => {
      const val = (v.dopamine ?? 0) + (v.dobutamine ?? 0)
        + 100 * ((v.adrenaline ?? 0) + (v.noradrenaline ?? 0))
        + 10 * (v.milrinone ?? 0);
      const sev = val >= 20 ? "crit" : val >= 10 ? "warn" : "good";
      return out(`VIS ${Math.round(val * 100) / 100}`, {
        severity: sev,
        interpretation: val >= 20 ? "High vasoactive support — poor prognostic marker, consider ECMO."
          : val >= 10 ? "Moderate vasoactive support — reassess volume, add steroid if refractory."
          : "Low vasoactive support.",
      });
    },
  },

  scale("ross", "Ross / Modified Ross Heart Failure Classification", "cardio",
    "Ross RD et al. J Pediatr 1987 (Modified Ross 2004)",
    [
      sel("history", "History", [[0, "None"], [1, "Sweating with feeds"], [2, "Dyspnoea with feeds"], [3, "Dyspnoea at rest"]]),
      sel("resp", "Respiratory", [[0, "None"], [1, "Mild tachypnoea"], [2, "Marked tachypnoea / retractions"], [3, "Severe distress / grunting"]]),
      sel("exam", "Physical examination", [[0, "None"], [1, "Hepatomegaly 2–3 cm"], [2, "Hepatomegaly > 3 cm"], [3, "Cardiomegaly + murmur / gallop"]]),
    ],
    (t) => band(t, [[0, "good", "No heart failure."], [3, "warn", "Mild CHF."], [6, "warn", "Moderate CHF."], [9, "crit", "Severe CHF — IV inotropes / diuretics, urgent cardiology."]]),
    9),

  scale("rachs1", "RACHS-1 Category (lookup)", "cardio",
    "Jenkins KJ et al. Circulation 2002;106:147–52 (Risk Adjustment for Congenital Heart Surgery)",
    [
      { key: "cat", label: "RACHS-1 category", options: [
        [1, "Category 1 — lowest risk (ASD / VSD closure, PDA ligation)"],
        [2, "Category 2 — TOF repair, AVC without valve surgery"],
        [3, "Category 3 — TGA arterial switch, AV canal with valve"],
        [4, "Category 4 — truncus, interrupted arch"],
        [5, "Category 5 — highest risk"],
        [6, "Category 6 — single ventricle palliation"],
      ]},
    ],
    (t, v) => {
      const cat = v.cat ?? 0;
      const map: Record<number, { sev: Sev; note: string }> = {
        1: { sev: "good", note: "Lowest mortality risk (~0.5–1%)." },
        2: { sev: "info", note: "Low–moderate mortality risk (~2–3%)." },
        3: { sev: "warn", note: "Moderate mortality risk (~5–7%)." },
        4: { sev: "crit", note: "High mortality risk (~10–15%)." },
        5: { sev: "crit", note: "Highest mortality risk (> 20%)." },
        6: { sev: "crit", note: "Single ventricle palliation — high risk; staged palliation required." },
      };
      const m = map[cat] ?? { sev: "info" as Sev, note: "Select a category." };
      return { severity: m.sev, note: m.note };
    }),

  {
    id: "kawasaki", name: "Kawasaki Disease — Diagnostic Criteria", category: "cardio",
    citation: "AHA Scientific Statement 2017 (McCrindle BW et al. Circulation 2017;135:e927–99)",
    fields: [
      f("fever", "Fever (days)", 0, 30, "days"),
      sel("conj", "Bilateral conjunctival injection", [[0, "No"], [1, "Yes"]]),
      sel("lip", "Oral changes (erythema / fissured lips / strawberry tongue)", [[0, "No"], [1, "Yes"]]),
      sel("extremity", "Peripheral extremity changes (erythema / oedema / desquamation)", [[0, "No"], [1, "Yes"]]),
      sel("rash", "Polymorphous rash", [[0, "No"], [1, "Yes"]]),
      sel("cervical", "Cervical lymphadenopathy ≥ 1.5 cm", [[0, "No"], [1, "Yes"]]),
      sel("echo", "Coronary artery abnormality on echo", [[0, "No"], [1, "Yes"]]),
    ],
    compute: (v) => {
      const fever = v.fever ?? 0;
      const criteria = (v.conj ?? 0) + (v.lip ?? 0) + (v.extremity ?? 0) + (v.rash ?? 0) + (v.cervical ?? 0);
      const meets = fever >= 5 && (criteria >= 4 || (v.echo ?? 0) === 1);
      const atypical = fever >= 5 && criteria >= 2 && (v.echo ?? 0) === 1;
      return out(meets ? "Meets criteria" : atypical ? "Atypical / incomplete" : fever >= 5 ? "Incomplete — monitor" : "Fever < 5 days", {
        severity: meets ? "crit" : atypical ? "warn" : "info",
        note: meets
          ? "Classic Kawasaki disease — IVIG 2 g/kg + high-dose aspirin within 10 days; baseline echocardiography."
          : atypical ? "Incomplete / atypical Kawasaki — consider IVIG with lab support (CRP, ESR, platelets, sterile pyuria, ALT)."
          : fever >= 5 ? "Fever ≥ 5 days without criteria — continue monitoring, repeat exam and echo."
          : "Fever < 5 days — Kawasaki cannot be diagnosed yet.",
      });
    },
  },

  /* ================= Fluid, Renal & Metabolic ================= */
  {
    id: "holliday", name: "Holliday–Segar Maintenance Fluid", category: "fluid",
    citation: "Holliday MA & Segar WE, Pediatrics 1957;19:823–32 (4-2-1 rule)",
    fields: [f("wt", "Body weight", 0.3, 120, "kg")],
    compute: (v) => {
      const w = v.wt ?? 0;
      if (w <= 0) return out("—", { severity: "info", note: "Enter a weight." });
      const mlDay = w <= 10 ? w * 100 : w <= 20 ? 1000 + (w - 10) * 50 : 1500 + (w - 20) * 20;
      const mlHr = Math.round(mlDay / 24);
      const na = Math.round((mlDay / 1000) * 30);
      const k = Math.round((mlDay / 1000) * 20);
      return out(`${mlDay} ml/day`, {
        severity: "info",
        note: `${mlHr} ml/hr · Na⁺ ≈ ${na} mmol/day · K⁺ ≈ ${k} mmol/day (Holliday–Segar 4-2-1 rule). Not appropriate where fluid restriction is needed.`,
      });
    },
  },

  {
    id: "parkland", name: "Paediatric Burn Resuscitation (Parkland / modified Parkland)", category: "fluid",
    citation: "Baxter CR & Shires T, Ann NY Acad Sci 1968 (classic Parkland); American Burn Association / paediatric burn protocols",
    fields: [
      f("wt", "Body weight", 3, 120, "kg"),
      f("burn", "Partial/full-thickness TBSA", 0, 100, "%"),
      sel("coef", "Resuscitation coefficient", [[3, "Modified paediatric Parkland · 3 ml/kg/%TBSA"], [4, "Classic Parkland · 4 ml/kg/%TBSA"]]),
    ],
    compute: (v) => {
      const w = v.wt ?? 0, b = v.burn ?? 0, coefficient = v.coef ?? 0;
      if (w <= 0 || b <= 0 || coefficient <= 0) return out("—", { severity: "info", note: "Enter weight, partial/full-thickness %TBSA, and the local burn-team coefficient." });
      const total = coefficient * w * b;
      const first8 = Math.round(total / 2);
      const next16 = Math.round(total - first8);
      const first8Rate = Math.round(first8 / 8);
      const next16Rate = Math.round(next16 / 16);
      const maintenance = w <= 10 ? w * 4 : w <= 20 ? 40 + (w - 10) * 2 : 60 + (w - 20);
      return out(`${Math.round(total)} ml LR / 24 h`, {
        severity: b >= 20 ? "crit" : "warn",
        interpretation: `Estimated crystalloid replacement: ${Math.round(total)} ml in 24 h. Give ${first8} ml over the first 8 h from the time of injury (starting rate ≈ ${first8Rate} ml/h), then ${next16} ml over the next 16 h (≈ ${next16Rate} ml/h). Add paediatric maintenance ≈ ${Math.round(maintenance)} ml/h separately; subtract fluids already given and titrate hourly to urine output about 1 ml/kg/h. Use only partial- and full-thickness burn area; superficial erythema is not counted.`,
        note: "This is a starting estimate, not a prescription. Follow the local burn service protocol and monitor for both under-resuscitation and fluid overload.",
      });
    },
  },

  {
    id: "schwartz", name: "Schwartz Formula (estimated GFR)", category: "fluid",
    citation: "Schwartz GJ et al. J Pediatr 1976 (original); 2009 (updated k values)",
    fields: [
      f("ht", "Height", 30, 210, "cm"),
      f("creat", "Serum creatinine", 0.1, 15, "mg/dL"),
      sel("k", "k constant", [
        [0.33, "Preterm infant"], [0.45, "Full-term infant (< 1 y)"],
        [0.55, "Child 1–13 y / adolescent female"], [0.7, "Adolescent male"],
      ]),
    ],
    compute: (v) => {
      const gfr = ((v.ht ?? 0) * (v.k ?? 0)) / (v.creat ?? 1);
      if (gfr <= 0) return out("—", { severity: "info", note: "Enter height and creatinine." });
      const val = Math.round(gfr);
      return out(`${val} ml/min/1.73 m²`, {
        severity: val < 30 ? "crit" : val < 60 ? "warn" : val < 90 ? "info" : "good",
        interpretation: val < 30 ? "Stage 4–5 CKD range — nephrology referral."
          : val < 60 ? "Moderately reduced GFR (Stage 3)."
          : val < 90 ? "Mildly reduced GFR (Stage 2)." : "Normal GFR for age.",
      });
    },
  },

  scale("cds", "Clinical Dehydration Scale", "fluid",
    "Friedman JN et al. Pediatrics 2004 (1 mo–5 y)",
    [
      { key: "eyes", label: "General appearance — eyes", options: [[0, "Normal"], [1, "Slightly sunken"], [2, "Very sunken"]] },
      { key: "tongue", label: "Mucous membranes (tongue)", options: [[0, "Moist"], [1, "Sticky"], [2, "Dry"]] },
      { key: "tears", label: "Tears", options: [[0, "Present"], [1, "Decreased"], [2, "Absent"]] },
      { key: "cap", label: "Capillary refill", options: [[0, "Normal"], [1, "Prolonged (> 2 s)"], [2, "Very prolonged"]] },
      { key: "alert", label: "General appearance — consciousness", options: [[0, "Normal"], [1, "Restless / irritable"], [2, "Lethargic / unconscious"]] },
    ],
    (t) => band(t, [[0, "good", "No dehydration (< 3% loss)."], [3, "warn", "Mild–moderate dehydration (3–9%). ORS 50–100 ml/kg."], [8, "crit", "Severe dehydration (≥ 10%). IV 20 ml/kg bolus NS / RL."]]),
    8),

  /* ================= Dosing & Sizing ================= */
  {
    id: "broselow", name: "Broselow Tape lookup (equipment & drug sizing)", category: "dosing",
    citation: "Luten R et al. (Broselow Paediatric Emergency Tape); APLS / PALS colour zones",
    external: { label: "Broselow Tape — authoritative reference", url: "https://www.broselowtape.com/" },
    fields: [
      sel("colour", "Broselow colour zone", [
        [3, "Grey 3–5 kg"], [4, "Pink 6–7 kg"], [5, "Red 8–9 kg"], [6, "Purple 10–11 kg"],
        [7, "Yellow 12–14 kg"], [8, "White 15–18 kg"], [9, "Blue 19–23 kg"], [10, "Orange 24–29 kg"],
        [11, "Green 30–36 kg"],
      ]),
    ],
    compute: (v) => {
      const c = v.colour ?? 0;
      const drugs: Record<number, string> = {
        3: "Adrenaline 0.15 mg IV · Defib 6 J · NS 60 ml bolus",
        4: "Adrenaline 0.2 mg · Defib 10 J · NS 90 ml",
        5: "Adrenaline 0.3 mg · Defib 13 J · NS 140 ml",
        6: "Adrenaline 0.4 mg · Defib 17 J · NS 200 ml",
        7: "Adrenaline 0.5 mg · Defib 25 J · NS 260 ml",
        8: "Adrenaline 0.7 mg · Defib 33 J · NS 330 ml",
        9: "Adrenaline 0.8 mg · Defib 42 J · NS 420 ml",
        10: "Adrenaline 1.0 mg · Defib 53 J · NS 530 ml",
        11: "Adrenaline 1.2 mg · Defib 66 J · NS 660 ml",
      };
      return out(`Zone colour ${c}`, {
        severity: "info",
        interpretation: `${drugs[c] ?? "Select a colour zone."} Always verify against the actual tape at cot-side.`,
      });
    },
  },

  {
    id: "bsa", name: "Body Surface Area (Mosteller / DuBois / Haycock)", category: "dosing",
    citation: "Mosteller RD 1987; DuBois & DuBois Arch Intern Med 1916; Haycock GB 1978",
    fields: [
      f("wt", "Weight", 0.3, 150, "kg"),
      f("ht", "Height", 30, 220, "cm"),
      sel("formula", "Formula", [
        [1, "Mosteller — √(ht × wt / 3600)"],
        [2, "DuBois & DuBois — 0.007184 × ht⁰·⁷²⁵ × wt⁰·⁴²⁵"],
        [3, "Haycock — 0.024265 × ht⁰·³⁹⁶⁴ × wt⁰·⁵³⁷⁸"],
      ]),
    ],
    compute: (v) => {
      const w = v.wt ?? 0, h = v.ht ?? 0;
      if (w <= 0 || h <= 0) return out("—", { severity: "info", note: "Enter height and weight." });
      let bsa: number;
      if (v.formula === 2) bsa = 0.007184 * Math.pow(h, 0.725) * Math.pow(w, 0.425);
      else if (v.formula === 3) bsa = 0.024265 * Math.pow(h, 0.3964) * Math.pow(w, 0.5378);
      else bsa = Math.sqrt((h * w) / 3600);
      const bsaV = Math.round(bsa * 100) / 100;
      return out(`${bsaV} m²`, {
        severity: "info",
        interpretation: `Calculated by ${v.formula === 2 ? "DuBois & DuBois" : v.formula === 3 ? "Haycock" : "Mosteller"}. Chemotherapy and burn fluid calculations should use this BSA.`,
      });
    },
  },

  /* ================= Trauma ================= */
  {
    id: "pecarn", name: "PECARN Paediatric Head Injury Rule", category: "trauma",
    citation: "Kuppermann N et al. Lancet 2009;374:1160–70 (PECARN, < 18 y)",
    fields: [
      sel("age", "Age", [[0, "< 2 years"], [1, "≥ 2 years"]]),
      sel("mental", "Altered mental status", [[0, "No"], [1, "Yes"]]),
      sel("loss", "Loss of consciousness", [[0, "No"], [1, "Yes"]]),
      sel("vomit", "Vomiting", [[0, "No"], [1, "Yes"]]),
      sel("mechanism", "Severe mechanism of injury", [[0, "No"], [1, "Yes"]]),
      sel("palp", "Palpable skull fracture", [[0, "No"], [1, "Yes"]]),
      sel("signs", "Signs of basilar skull fracture", [[0, "No"], [1, "Yes"]]),
      sel("haematoma", "Scalp haematoma (occipital / temporal / parietal)", [[0, "No"], [1, "Yes"]]),
      sel("severe", "Severe / worsening headache", [[0, "No"], [1, "Yes"]]),
      sel("act", "Acting normally per parent", [[1, "Yes"], [0, "No"]]),
    ],
    compute: (v) => {
      const highRisk = (v.mental ?? 0) === 1 || (v.palp ?? 0) === 1 || (v.signs ?? 0) === 1;
      const mediumRisk = (v.loss ?? 0) === 1 || (v.vomit ?? 0) === 1 || (v.severe ?? 0) === 1
        || (v.haematoma ?? 0) === 1 || (v.act ?? 0) === 0;
      const severeMech = (v.mechanism ?? 0) === 1;
      const isUnder2 = (v.age ?? 0) === 0;
      if (highRisk) {
        return out("High risk — CT recommended", { severity: "crit", note: "Obtain head CT immediately (risk of clinically important TBI > 4%). Monitor for deterioration while awaiting imaging." });
      }
      if (mediumRisk && (isUnder2 ? severeMech : severeMech || (v.vomit ?? 0) === 1)) {
        return out("Intermediate risk — observe then CT", {
          severity: "warn",
          note: isUnder2
            ? "Observe 4–6 h and perform CT if persistent / emerging risk factors (risk < 0.9%)."
            : "Observe before CT; perform CT if risk factors persist (risk < 0.9%).",
        });
      }
      return out("Low risk — no CT", { severity: "good", note: "CT is not indicated (risk of clinically important TBI < 0.02%). Discharge with head-injury advice." });
    },
  },

  scale("pecarnspine", "PECARN Paediatric Cervical Spine Rule", "trauma",
    "Leonard JC et al. Lancet Child Adolesc Health 2019 (PECARN c-spine study)",
    [
      { key: "altered", label: "Altered mental status", options: [[0, "No"], [1, "Yes"]] },
      { key: "posterior", label: "Posterior midline neck tenderness", options: [[0, "No"], [1, "Yes"]] },
      { key: "painful", label: "Aura of a painful distracting injury", options: [[0, "No"], [1, "Yes"]] },
      { key: "submerged", label: "Submersion injury", options: [[0, "No"], [1, "Yes"]] },
      { key: "dive", label: "Dive or axial load to head (e.g. football tackle)", options: [[0, "No"], [1, "Yes"]] },
      { key: "highrisk", label: "High-risk MVC (death in same crash, ejection, rollover, ≥ 65 km/h, bike / ski vs vehicle)", options: [[0, "No"], [1, "Yes"]] },
      { key: "paresthesia", label: "Paresthesias / extremity numbness", options: [[0, "No"], [1, "Yes"]] },
      { key: "neckpain", label: "Neck pain", options: [[0, "No"], [1, "Yes"]] },
      { key: "torticollis", label: "Torticollis", options: [[0, "No"], [1, "Yes"]] },
      { key: "substantial", label: "Substantial torso injury", options: [[0, "No"], [1, "Yes"]] },
      { key: "cond", label: "Predisposing condition (Down syndrome, achondroplasia, RA, etc.)", options: [[0, "No"], [1, "Yes"]] },
    ],
    (t) => band(t, [[0, "good", "Low risk — imaging not required (risk of cervical spine injury < 0.2%)."], [1, "warn", "≥ 1 risk factor — obtain cervical spine imaging."], [11, "crit", "High risk — immobilise and image urgently."]]),
    11),

  scale("pts", "Pediatric Trauma Score", "trauma",
    "Tepas JJ et al. J Pediatr Surg 1987 (Paediatric Trauma Score, −6 to +12)",
    [
      sel("size", "Size (weight)", [[2, "≥ 20 kg"], [1, "10–20 kg"], [-1, "< 10 kg"]]),
      sel("airway", "Airway", [[2, "Normal"], [1, "Maintainable"], [-1, "Unmaintainable"]]),
      sel("bp", "Systolic BP", [[2, "≥ 90 mmHg"], [1, "50–90 mmHg"], [-1, "< 50 mmHg"]]),
      sel("conscious", "Conscious level", [[2, "Awake"], [1, "Obtunded / loss of consciousness"], [-1, "Coma / decerebrate"]]),
      sel("fracture", "Fractures", [[2, "None / closed"], [1, "Open or multiple"], [-1, "Open + multiple"]]),
      sel("wound", "Cutaneous wounds", [[2, "None / minor"], [1, "Major open wound"], [-1, "Penetrating / degloving / burns > 15%"]]),
    ],
    (t) => band(t, [[8, "good", "Minor injury — discharge if appropriate."], [8, "warn", "Mild–moderate trauma — hospital care."], [-1, "crit", "Significant trauma — refer to paediatric trauma centre."]]),
    12),

  /* ================= Infection / Sepsis ================= */
  {
    id: "sepsiscalc", name: "Kaiser Permanente Neonatal Sepsis Calculator", category: "sepsis",
    citation: "Kuzniewicz MW et al. JAMA Pediatr 2017 (Kaiser Permanente Neonatal Sepsis Calculator)",
    external: { label: "Neonatal Sepsis Calculator", url: "https://neonatalsepsiscalculator.kaiserpermanente.org/" },
    fields: [
      sel("gbs", "Maternal GBS status", [[0, "Negative / unknown"], [1, "Positive"], [2, "GBS bacteraemia this pregnancy"]]),
      f("temp", "Highest maternal intrapartum temperature", 35, 42, "°C"),
      sel("rom", "Duration of membrane rupture", [[0, "< 18 h"], [1, "≥ 18 h"]]),
      sel("abx", "Intrapartum antibiotics", [[0, "None"], [1, "One dose ≥ 4 h before delivery"], [2, "Antibiotics < 4 h / other regimen"]]),
      sel("risk", "Additional risk factor", [[0, "None"], [1, "Prolonged ROM, chorioamnionitis risk, low-access care"]]),
    ],
    compute: (v) => {
      const gbsHigh = (v.gbs ?? 0) === 2;
      const fever = (v.temp ?? 36) >= 38;
      const rom = (v.rom ?? 0) === 1;
      const abx4h = (v.abx ?? 0) === 1;
      const extra = (v.risk ?? 0) === 1;
      if (gbsHigh || fever) {
        if (abx4h && !extra && !fever)
          return out("Enhanced observation (well-appearing)", { severity: "warn", note: "GBS-positive with adequate cover — observe 36–48 h. No lab evaluation indicated." });
        if (fever)
          return out("Risk category — enhanced observation or evaluation", { severity: "warn", note: "Maternal intrapartum fever. Well-appearing: enhanced observation ± limited labs. Unwell: full sepsis evaluation and empirical antibiotics." });
        return out("Risk category", { severity: "warn", note: "GBS bacteraemia or incomplete prophylaxis with additional risk factors. Enhanced observation with serial clinical assessment." });
      }
      if (rom) return out("Routine newborn care", { severity: "good", note: "GBS negative/unknown with ROM ≥ 18 h — routine newborn care with clinical observation." });
      return out("Routine newborn care", { severity: "good", note: "Low risk — routine newborn care and discharge criteria apply." });
    },
  },

  scale("rochester", "Rochester Criteria (low-risk febrile infant)", "sepsis",
    "Dagan R et al. J Pediatr 1985; Rochester Criteria (0–60 d)",
    [
      { key: "well", label: "Previously healthy, term, no antibiotics", options: [[0, "No"], [1, "Yes"]] },
      { key: "exam", label: "Non-toxic appearance, no focal infection", options: [[0, "No"], [1, "Yes"]] },
      { key: "temp", label: "Temperature ≥ 38 °C (rectal)", options: [[0, "No"], [1, "Yes"]] },
      f("wbc", "Total WBC (×10⁹/L)", 0, 60),
      { key: "bands", label: "Band forms", options: [[0, "≥ 1.5 ×10⁹/L"], [1, "< 1.5 ×10⁹/L"]] },
      f("urine", "Urine WBC (×10⁹/L)", 0, 100),
    ],
    (t, v) => {
      const meets = (v.well ?? 0) === 1 && v.temp === 1 && (v.wbc ?? 0) >= 5 && (v.wbc ?? 0) <= 15 && (v.bands ?? 0) === 1 && (v.urine ?? 99) < 10;
      return out(meets ? "Low risk (meets criteria)" : "Does not meet criteria", {
        severity: meets ? "good" : "warn",
        note: meets
          ? "Low risk of serious bacterial infection (< 1%). Discharge with close follow-up — no empirical antibiotics."
          : "Does not meet Rochester criteria — full septic screen and empirical antibiotics.",
      });
    }),

  scale("philadelphia", "Philadelphia Criteria", "sepsis",
    "Baker MD et al. J Pediatr 1993 (Philadelphia, 1–24 mo)",
    [
      { key: "well", label: "Well-appearing", options: [[0, "No"], [1, "Yes"]] },
      { key: "temp", label: "Temperature ≥ 39.0 °C", options: [[0, "No"], [1, "Yes"]] },
      f("wbc", "Total WBC (×10⁹/L)", 0, 60),
      f("bands", "Band forms (×10⁹/L)", 0, 20),
      f("urine", "Urine WBC (×10⁹/L)", 0, 100),
      f("stool", "Stool WBC (if diarrhoea)", 0, 100),
    ],
    (t, v) => {
      const meets = (v.well ?? 0) === 1 && (v.temp ?? 0) === 0 && (v.wbc ?? 0) < 15 && (v.bands ?? 0) < 1.5 && (v.urine ?? 0) < 10;
      return out(meets ? "Low risk (meets criteria)" : "Does not meet criteria", {
        severity: meets ? "good" : "warn",
        note: meets
          ? "Low risk of serious bacterial infection (< 1.4%). Discharge with close follow-up."
          : "Does not meet Philadelphia criteria — full septic screen, empirical antibiotics, consider admission.",
      });
    }),

  scale("boston", "Boston Criteria (febrile infant 1–3 mo)", "sepsis",
    "Baskin MN et al. Arch Pediatr Adolesc Med 1993 (Boston, 1–3 mo)",
    [
      { key: "well", label: "Well-appearing", options: [[0, "No"], [1, "Yes"]] },
      { key: "temp", label: "Temperature ≥ 38 °C", options: [[0, "No"], [1, "Yes"]] },
      f("wbc", "Total WBC (×10⁹/L)", 0, 60),
      f("bands", "Band forms (×10⁹/L)", 0, 20),
      f("urine", "Urine WBC (×10⁹/L)", 0, 100),
      f("csf", "CSF WBC (×10⁹/L)", 0, 100),
      f("cxr", "Chest X-ray infiltrate (0/1)", 0, 1),
    ],
    (t, v) => {
      const meets = (v.well ?? 0) === 1 && (v.wbc ?? 0) < 20 && (v.bands ?? 0) < 1.5 && (v.urine ?? 0) < 10 && (v.csf ?? 0) < 10 && (v.cxr ?? 0) === 0;
      return out(meets ? "Low risk (meets Boston criteria)" : "Does not meet criteria", {
        severity: meets ? "good" : "warn",
        note: meets
          ? "Low risk — perform CSF + labs, give ceftriaxone 50 mg/kg, follow up in 24 h."
          : "Does not meet Boston criteria — full septic screen, empirical antibiotics, admit.",
      });
    }),

  scale("yale", "Yale Observation Scale", "sepsis",
    "McCarthy PL et al. J Pediatr 1982 (Yale Observation Scale, 3–36 mo)",
    [
      { key: "cry", label: "Quality of cry", options: [[1, "Strong/normal"], [3, "Moaning / high-pitched"], [5, "Weak / whimpering"]] },
      { key: "respond", label: "Reaction to parent stimulation", options: [[1, "Cries briefly then stops"], [3, "Cries off and on"], [5, "Continuous cry / hardly responds"]] },
      { key: "state", label: "State change", options: [[1, "Awake, stays awake"], [3, "Awake briefly"], [5, "Falls asleep / will not awaken"]] },
      { key: "colour", label: "Colour", options: [[1, "Pink"], [3, "Pale extremities / acrocyanosis"], [5, "Pale / cyanotic / mottled"]] },
      { key: "hyd", label: "Hydration", options: [[1, "Skin, eyes, moist mucosa"], [3, "Slightly dry mucosa"], [5, "Dry mucosa, poor turgor"]] },
      { key: "social", label: "Response to social overtures", options: [[1, "Smiles / alerts"], [3, "Brief smile / alerts briefly"], [5, "No smile, face blank, does not alert"]] },
    ],
    (t) => band(t, [[10, "good", "Low risk — observation and follow-up."], [16, "warn", "Increased risk — full septic screen."], [26, "crit", "High risk — admit, empirical antibiotics."]]),
    30),

  scale("phoenix", "Phoenix Sepsis Score (2024)", "sepsis",
    "Sanchez-Pinto LN et al. JAMA 2024;331:675–86 (Phoenix Sepsis Criteria)",
    [
      sel("resp", "Respiratory: PaO₂/FiO₂, SpO₂/FiO₂, or invasive ventilation", [[0, "Normal"], [1, "Dysfunction"], [3, "Severe dysfunction"]]),
      sel("cardio", "Cardiovascular: lactate, MAP, vasoactives", [[0, "Normal"], [1, "Dysfunction"], [3, "Severe dysfunction"]]),
      sel("coag", "Coagulation: platelets, PT/INR", [[0, "Normal"], [1, "Dysfunction"], [3, "Severe dysfunction"]]),
      sel("neuro", "Neurological: GCS / pupil response", [[0, "Normal"], [1, "Dysfunction"], [3, "Severe dysfunction"]]),
    ],
    (t) => band(t, [[1, "good", "No sepsis (Phoenix score < 2)."], [4, "warn", "Infection with organ dysfunction (Phoenix ≥ 2)."], [8, "crit", "SEPSIS — infection + Phoenix score ≥ 2. Mortality risk rises with score."]])),

  /* ================= Growth & Nutrition ================= */
  {
    id: "muac", name: "MUAC z-score / nutritional classification", category: "growth",
    citation: "WHO Child Growth Standards 2006; WHO MUAC cut-offs (SAM < 11.5 cm)",
    fields: [f("muac", "Mid-upper arm circumference", 5, 40, "cm"),
      sel("age", "Age group", [[0, "6–59 months"], [1, "5–10 years"], [2, "> 10 years"]])],
    compute: (v) => {
      const m = v.muac ?? 0;
      if (m <= 0) return out("—", { severity: "info", note: "Enter MUAC in cm." });
      const label = m < 11.5 ? "Severe acute malnutrition (SAM) — red"
        : m < 12.5 ? "Moderate acute malnutrition (MAM) — yellow"
        : m < 13.5 ? "At risk of malnutrition" : "Normal nutrition — green";
      return out(`${m} cm`, {
        severity: m < 11.5 ? "crit" : m < 12.5 ? "warn" : "good",
        note: `${label}. ${m < 11.5 ? "Refer for therapeutic feeding (F75/F100) and full medical assessment."
          : m < 12.5 ? "Supplementary feeding (RUTF) and follow-up." : "Continue routine growth monitoring."}`,
      });
    },
  },

  scale("waterlow", "Waterlow Classification (malnutrition)", "growth",
    "Waterlow JC, Lancet 1973; WHO / NNF malnutrition guidance",
    [
      sel("wfh", "Weight-for-height (wasting)", [[0, "> 90% of expected"], [1, "80–90% — mild"], [2, "70–79% — moderate"], [3, "< 70% — severe"]]),
      sel("hfa", "Height-for-age (stunting)", [[0, "> 95% of expected"], [1, "90–95% — mild"], [2, "85–89% — moderate"], [3, "< 85% — severe"]]),
      sel("oedema", "Nutritional oedema", [[0, "Absent"], [1, "Present"]]),
    ],
    (t, v) => {
      const wasting = v.wfh ?? 0;
      const stunting = v.hfa ?? 0;
      const oedema = (v.oedema ?? 0) === 1;
      const label = oedema ? "Kwashiorkor (oedematous malnutrition)"
        : wasting === 3 ? "Marasmus (severe wasting)"
        : wasting === 2 ? "Moderate wasting"
        : stunting === 3 ? "Severe stunting"
        : stunting === 2 ? "Moderate stunting" : "Normal nutrition";
      return out(label, {
        severity: oedema || wasting === 3 ? "crit" : wasting === 2 || stunting === 3 ? "warn" : "good",
        note: oedema || wasting === 3
          ? `${label} — SAM. Admit for F-75, treat infection, correct electrolytes, then F-100 / RUTF. Check for re-feeding syndrome.`
          : stunting === 3 || wasting === 2
            ? `${label} — supplementary feeding, micronutrients, monitor weight weekly.`
            : `${label} — continue routine growth monitoring.`,
      });
    }),

  {
    id: "ponderal", name: "Ponderal Index", category: "growth",
    citation: "Neonatal ponderal index = 100 × birth weight (g) / length³ (cm); interpret with gestational-age/sex reference charts (PubMed 19041096, 9491856)",
    fields: [f("wt", "Birth weight", 300, 6000, "g"), f("ht", "Birth length", 25, 65, "cm")],
    compute: (v) => {
      const w = v.wt ?? 0, h = v.ht ?? 0;
      if (w <= 0 || h <= 0) return out("—", { severity: "info", note: "Enter birth weight and length." });
      // Neonatal Ponderal (Rohrer) Index = weight (g) / length³ (cm) × 100.
      // The previous implementation converted length to metres but retained a
      // g/cm³ label, producing values around 20,000–30,000 instead of 2.5–3.0.
      const pi = Math.round((w / Math.pow(h, 3)) * 100 * 100) / 100;
      return out(`PI ${pi.toFixed(2)} (×100 g/cm³)`, {
        severity: pi < 2.2 || pi > 3.0 ? "warn" : "good",
        interpretation: pi < 2.2
          ? "Low screening value — may indicate disproportionate fetal growth restriction; compare with gestational-age/sex-specific centiles and assess the infant clinically."
          : pi > 3.0
            ? "High screening value — suggests greater weight for length; correlate with gestation, maternal diabetes risk and growth references."
            : "Within a commonly used neonatal screening band (approximately 2.2–3.0), but no single cutoff is valid for every gestation or population. Use the appropriate reference chart.",
        note: "PI is a proportionality screen, not a diagnosis. Accurate crown–heel length is critical because length is cubed.",
      });
    },
  },

  /* ================= Neuro / Consciousness ================= */
  {
    id: "gcs", name: "Glasgow Coma Scale (paediatric-adapted)", category: "neuro",
    citation: "Teasdale G & Jennett B, Lancet 1974; Paediatric adaptation — Simpson D, Lancet 1982",
    fields: [
      sel("eye", "Eye opening", [[4, "Spontaneous"], [3, "To speech"], [2, "To pain"], [1, "None"]]),
      sel("verbal", "Verbal response (≥ 5 y)", [[5, "Orientated"], [4, "Confused"], [3, "Inappropriate words"], [2, "Incomprehensible sounds"], [1, "None"]]),
      sel("verbalInfant", "Verbal response (< 5 y)", [[5, "Cooing / babbling"], [4, "Irritable cry"], [3, "Cries to pain"], [2, "Moans to pain"], [1, "No response"]]),
      sel("motor", "Motor response", [[6, "Obeys commands"], [5, "Localises pain"], [4, "Withdraws from pain"], [3, "Abnormal flexion (decorticate)"], [2, "Abnormal extension (decerebrate)"], [1, "None"]]),
    ],
    compute: (v) => {
      const verbal = v.verbalInfant != null && v.verbal == null ? v.verbalInfant : v.verbal;
      const gcs = (v.eye ?? 0) + (verbal ?? 0) + (v.motor ?? 0);
      return out(`GCS ${gcs}/15 (E${v.eye ?? 0} V${verbal ?? 0} M${v.motor ?? 0})`, {
        severity: gcs <= 8 ? "crit" : gcs <= 12 ? "warn" : "good",
        note: gcs <= 8 ? "Severe — secure airway, consider intubation, CT brain, neurosurgery referral."
          : gcs <= 12 ? "Moderate — CT brain, repeat GCS frequently."
          : gcs === 15 ? "Fully conscious." : "Mild head injury — observe.",
      });
    },
  },

  scale("avpu", "AVPU Scale", "neuro",
    "Advanced Paediatric Life Support (APLS); WHO IMCI assessment",
    [
      { key: "avpu", label: "Response", options: [
        [4, "A — Alert"], [3, "V — Responds to Voice"],
        [2, "P — Responds to Pain"], [1, "U — Unresponsive"],
      ]},
    ],
    (t, v) => {
      const s = v.avpu ?? 0;
      const map: Record<number, { sev: Sev; note: string }> = {
        4: { sev: "good", note: "Alert — normal conscious level." },
        3: { sev: "warn", note: "Responds to voice only — assess airway, glucose, ABCDE." },
        2: { sev: "crit", note: "Responds to pain only — coma (GCS ≤ 8). Secure airway, check glucose, consider intubation." },
        1: { sev: "crit", note: "Unresponsive — coma. ABCDE, secure airway, check glucose, urgent CT / neurosurgery." },
      };
      const m = map[s] ?? { sev: "info" as Sev, note: "Select AVPU response." };
      return out(`${s}/4`, { severity: m.sev, note: m.note });
    }),

  scale("capd", "CAPD (Cornell Assessment of Paediatric Delirium)", "neuro",
    "Traube C et al. J Pediatr 2014 (CAPD, 0–32; PICU delirium)",
    [
      sel("relate", "Able to relate to parent / caregiver", [[0, "Yes"], [4, "No"]]),
      sel("attention", "Able to maintain attention", [[0, "Yes"], [4, "No"]]),
      sel("orient", "Oriented to surroundings", [[0, "Yes"], [4, "No"]]),
      sel("speech", "Speech appropriate", [[0, "Yes"], [4, "No"]]),
      sel("respond", "Responds to commands appropriately", [[0, "Yes"], [4, "No"]]),
      sel("digest", "Able to digest new information", [[0, "Yes"], [4, "No"]]),
      sel("focus", "Able to focus attention", [[0, "Yes"], [4, "No"]]),
      sel("sleep", "Sleep / wake cycle appropriate", [[0, "Yes"], [4, "No"]]),
      sel("mood", "Mood consistent with events", [[0, "Yes"], [4, "No"]]),
      sel("consistency", "Responses consistent", [[0, "Yes"], [4, "No"]]),
      sel("involuntary", "Involuntary movements noted", [[0, "No"], [4, "Yes"]]),
    ],
    (t) => band(t, [[9, "good", "No delirium (score < 9)."], [12, "warn", "Borderline — rescreen next shift."], [32, "crit", "Delirium present — treat underlying cause, minimise sedatives, reorientation."]]),
    32),

  scale("pcam", "pCAM-ICU (Paediatric Confusion Assessment Method for ICU)", "neuro",
    "Smith HAB et al. Pediatr Crit Care Med 2011 (pCAM-ICU, > 5 y)",
    [
      sel("acute", "Acute change / fluctuating course in mental status", [[0, "No"], [1, "Yes"]]),
      sel("inattention", "Inattention (letters test)", [[0, "No"], [1, "Yes"]]),
      sel("altered", "Altered level of consciousness (RASS)", [[0, "No (RASS 0)"], [1, "Yes (RASS ≠ 0)"]]),
      sel("disorganised", "Disorganised thinking", [[0, "No"], [1, "Yes"]]),
    ],
    (t, v) => {
      const positive = (v.acute ?? 0) === 1 && ((v.inattention ?? 0) === 1 || (v.altered ?? 0) === 1 || (v.disorganised ?? 0) === 1);
      return out(positive ? "CAM-ICU positive" : "CAM-ICU negative", {
        severity: positive ? "warn" : "good",
        note: positive
          ? "Delirium present — identify reversible causes (DELIRIUM mnemonic), reduce sedatives, reorient, involve family."
          : "No delirium detected on this assessment — rescreen daily.",
      });
    }),

  /* ================= GI / Feeding ================= */
  scale("rome", "Rome IV Functional GI Disorder checklist", "gi",
    "Rome IV Criteria, Hyams JS et al. Gastroenterology 2016 (functional abdominal pain disorders)",
    [
      sel("pain", "Recurrent abdominal pain ≥ 4 days / month", [[0, "No"], [1, "Yes"]]),
      sel("duration", "Symptom duration ≥ 2 months", [[0, "No"], [1, "Yes"]]),
      sel("insufficient", "Insufficient criteria for IBD / coeliac / structural disease", [[0, "No"], [1, "Yes"]]),
      sel("alarm", "Any alarm feature (weight loss, GI bleeding, fever, IBD family history)", [[0, "No"], [1, "Yes"]]),
      sel("subtyped", "Meets IBS / functional dyspepsia / abdominal migraine / FAP-NOS sub-criteria", [[0, "No"], [1, "Yes"]]),
    ],
    (t, v) => {
      const alarm = (v.alarm ?? 0) === 1;
      const positive = (v.pain ?? 0) === 1 && (v.duration ?? 0) === 1 && (v.insufficient ?? 0) === 1;
      return out(alarm ? "Alarm feature present" : positive ? "Functional abdominal pain disorder" : "Does not meet criteria", {
        severity: alarm ? "warn" : positive ? "info" : "info",
        note: alarm
          ? "Alarm feature — investigate for organic disease (FBC, ESR / CRP, coeliac serology, faecal calprotectin, imaging)."
          : positive ? `Rome IV functional abdominal pain disorder. Manage with reassurance, dietary review, psychological input — no further investigation needed.`
          : "Does not meet Rome IV criteria — consider other causes.",
      });
    }),

  {
    id: "igerq", name: "I-GERQ (Infant Gastroesophageal Reflux Questionnaire)", category: "gi",
    citation: "Kleinman L et al. J Pediatr Gastroenterol Nutr 2006 (I-GERQ-R)",
    fields: [
      sel("freq", "Frequency of spitting up", [[0, "None"], [1, "1–2 times / day"], [2, "3–5 times / day"], [3, "6 or more times / day"]]),
      sel("volume", "Volume of spitting up", [[0, "Small"], [1, "Moderate"], [2, "Large"]]),
      sel("refuse", "Refusing to feed", [[0, "Rarely / never"], [1, "Sometimes"], [2, "Most feeds"]]),
      sel("irritable", "Irritability / crying", [[0, "Rarely / never"], [1, "Sometimes"], [2, "Most of the day"]]),
      sel("back", "Arching back while feeding", [[0, "Rarely / never"], [1, "Sometimes"], [2, "Most feeds"]]),
      sel("choking", "Choking / gagging during feeds", [[0, "Rarely / never"], [1, "Sometimes"], [2, "Most feeds"]]),
    ],
    compute: (v) => {
      const t = sum(v);
      return out(`${t}`, {
        severity: t >= 7 ? "warn" : t >= 3 ? "info" : "good",
        note: t >= 7 ? "GERD symptoms likely — assess for complications, consider acid suppression / thickened feeds."
          : t >= 3 ? "Some reflux symptoms — conservative management (positioning, feeding changes)."
          : "Minimal reflux symptoms — physiological reflux, reassurance only.",
      });
    },
  },

  /* ================= Developmental / Behavioural ================= */
  scale("denver", "Denver II milestone checklist", "development",
    "Frankenburg WK et al. J Pediatr 1992 (Denver II, 0–6 y)",
    [
      sel("gross", "Gross motor milestone for age (rolls, sits, walks)", [[0, "Yes"], [1, "Refusal / no opportunity"], [2, "Failed"]]),
      sel("fine", "Fine motor–adaptive milestone for age (grasp, tower, copies)", [[0, "Yes"], [1, "Refusal / no opportunity"], [2, "Failed"]]),
      sel("lang", "Language milestone for age (babbles, words, phrases)", [[0, "Yes"], [1, "Refusal / no opportunity"], [2, "Failed"]]),
      sel("personal", "Personal–social milestone for age (smiles, feeds self, plays)", [[0, "Yes"], [1, "Refusal / no opportunity"], [2, "Failed"]]),
    ],
    (t, v) => {
      const failed = ["gross", "fine", "lang", "personal"].filter((k) => (v[k] ?? 0) === 2).length;
      const refusals = ["gross", "fine", "lang", "personal"].filter((k) => (v[k] ?? 0) === 1).length;
      return out(`${failed} item(s) failed / ${refusals} refused`, {
        severity: failed >= 2 ? "warn" : failed === 1 ? "info" : "good",
        note: failed >= 2 ? "Two or more items failed — refer for developmental assessment (ASQ-3 / full evaluation)."
          : failed === 1 ? "One item failed — repeat screen in 4–6 weeks, monitor closely."
          : refusals > 0 ? "Some items refused — rescreen when the child is cooperative."
          : "Age-appropriate development — continue routine surveillance.",
      });
    }),

  scale("asq3", "ASQ-3 quick score", "development",
    "Squires J & Bricker D, Ages & Stages Questionnaires, 3rd ed 2009",
    [
      sel("comm", "Communication items passed", [[0, "0–1 of 6"], [1, "2–3 of 6"], [2, "4–5 of 6"], [3, "6 of 6"]]),
      sel("gross", "Gross motor items passed", [[0, "0–1 of 6"], [1, "2–3 of 6"], [2, "4–5 of 6"], [3, "6 of 6"]]),
      sel("fine", "Fine motor items passed", [[0, "0–1 of 6"], [1, "2–3 of 6"], [2, "4–5 of 6"], [3, "6 of 6"]]),
      sel("solve", "Problem solving items passed", [[0, "0–1 of 6"], [1, "2–3 of 6"], [2, "4–5 of 6"], [3, "6 of 6"]]),
      sel("social", "Personal–social items passed", [[0, "0–1 of 6"], [1, "2–3 of 6"], [2, "4–5 of 6"], [3, "6 of 6"]]),
    ],
    (t) => band(t, [[7, "crit", "Below cut-off — refer for further assessment."], [14, "warn", "Near cut-off — monitor and provide activities."], [30, "good", "Above cut-off — on track."]]),
    30),

  scale("mchat", "M-CHAT-R (Modified Checklist for Autism in Toddlers – Revised)", "development",
    "Robins DL et al. Pediatrics 2014 (M-CHAT-R / F, 16–30 mo)",
    [
      sel("interest", "Does your child take an interest in other children?", [[0, "Yes"], [1, "No"]]),
      sel("point", "Does your child point to indicate interest?", [[0, "Yes"], [1, "No"]]),
      sel("pretend", "Does your child do pretend play?", [[0, "Yes"], [1, "No"]]),
      sel("eye", "Does your child look you in the eye?", [[0, "Yes"], [1, "No"]]),
      sel("respond", "If you point, does your child look?", [[0, "Yes"], [1, "No"]]),
      sel("smile", "Does your child smile in response to your face?", [[0, "Yes"], [1, "No"]]),
      sel("follow", "Does your child follow your gaze?", [[0, "Yes"], [1, "No"]]),
    ],
    (t) => band(t, [[0, "good", "Low risk — no further action."], [2, "warn", "Low risk — monitor; rescreen at 24 mo."], [20, "crit", "Medium to high risk — follow-up interview (M-CHAT-R / F) and referral for diagnostic evaluation."]]),
    20),

  /* ================= Skin / Wound ================= */
  scale("bradenq", "Braden Q Scale (paediatric pressure ulcer risk)", "skin",
    "Quigley SM & Curley MAQ, J Soc Pediatr Nurs 1996 (Braden Q, < 18 y)",
    [
      sel("sensory", "Mobility / sensory perception", [[1, "Completely limited"], [2, "Very limited"], [3, "Slightly limited"], [4, "No impairment"]]),
      sel("moisture", "Moisture", [[1, "Constantly moist"], [2, "Often moist"], [3, "Occasionally moist"], [4, "Rarely moist"]]),
      sel("activity", "Activity", [[1, "Bedfast"], [2, "Chairfast"], [3, "Walks occasionally"], [4, "Walks frequently"]]),
      sel("mobility2", "Mobility", [[1, "Completely immobile"], [2, "Very limited"], [3, "Slightly limited"], [4, "No limitation"]]),
      sel("nutrition", "Nutrition", [[1, "Very poor"], [2, "Probably inadequate"], [3, "Adequate"], [4, "Excellent"]]),
      sel("friction", "Friction and shear", [[1, "Problem"], [2, "Potential problem"], [3, "No apparent problem"], [4, "No apparent problem"]]),
      sel("tissue", "Tissue perfusion & oxygenation", [[1, "Extremely compromised"], [2, "Very compromised"], [3, "Adequate"], [4, "Compromised"]]),
    ],
    (t) => band(t, [[16, "crit", "High risk of pressure ulcer (score ≤ 16)."], [22, "warn", "Moderate risk (17–25)."], [28, "good", "Low risk (> 25)."]]),
    28),

  scale("nscs", "Neonatal Skin Condition Score (NSCS)", "skin",
    "Lund CH et al. J Obstet Gynecol Neonatal Nurs 2001 (NSCS)",
    [
      sel("dryness", "Dryness", [[1, "Normal — no signs"], [2, "Dry / scaling, visible"], [3, "Very dry / cracking"]]),
      sel("erythema", "Erythema", [[1, "None"], [2, "Localized, mild"], [3, "Intense / widespread"]]),
      sel("breakdown", "Skin breakdown", [[1, "None"], [2, "Small localized areas"], [3, "Large / multiple areas"]]),
    ],
    (t) => band(t, [[3, "good", "Normal skin condition."], [5, "warn", "Mild skin compromise — emollient, minimise adhesive."], [9, "crit", "Severe skin compromise — barrier care, review tapes / dressings / fixation."]]),
    9),

  /* ================= Endocrine / Pubertal ================= */
  scale("tanner", "Tanner Staging reference", "endocrine",
    "Marshall WA & Tanner JM, Arch Dis Child 1969 / 1970 (Tanner stages 1–5)",
    [
      sel("breast", "Breast development (female)", [[1, "B1 — prepubertal"], [2, "B2 — breast bud"], [3, "B3 — further enlargement"], [4, "B4 — areola mound"], [5, "B5 — mature adult"]]),
      sel("pubicF", "Pubic hair (female)", [[1, "PH1 — none"], [2, "PH2 — sparse labia"], [3, "PH3 — darker, curlier"], [4, "PH4 — adult type, smaller area"], [5, "PH5 — adult, spread to thighs"]]),
      sel("genital", "Genital development (male)", [[1, "G1 — prepubertal"], [2, "G2 — testes enlarge, scrotum thins"], [3, "G3 — penis lengthens"], [4, "G4 — penis broadens, glans develops"], [5, "G5 — adult size"]]),
      sel("pubicM", "Pubic hair (male)", [[1, "PH1 — none"], [2, "PH2 — sparse base of penis"], [3, "PH3 — darker, curlier"], [4, "PH4 — adult type, smaller area"], [5, "PH5 — adult, spread to thighs"]]),
    ],
    (t, v) => {
      const values = [v.breast, v.pubicF, v.genital, v.pubicM].filter((x) => x != null) as number[];
      const mx = values.length ? Math.max(...values) : 0;
      const mn = values.length ? Math.min(...values) : 0;
      return out(values.length ? `Tanner ${mn}–${mx}` : "—", {
        severity: mx >= 2 ? "info" : "good",
        note: mx === 1 ? "Prepubertal (Tanner 1) — no signs of pubertal development."
          : mx === 2 ? "Tanner 2 — breast bud / genital enlargement / sparse pubic hair = onset of puberty. If < 8 y (F) or < 9 y (M), consider precocious puberty."
          : mx >= 4 ? "Late puberty (Tanner 4–5) — nearing adult sexual maturity."
          : "Mid-puberty (Tanner 3) — assess growth velocity and bone age if concern about delayed puberty.",
      });
    }),

];

const REPUTABLE_CALCULATOR_SOURCES: Record<string, NonNullable<Calculator["external"]>> = {
  downes: { label: "Peer-reviewed Downes evidence", url: "https://www.nature.com/articles/s41372-024-02086-z" },
  rop: { label: "AAP ROP screening/treatment statement", url: "https://publications.aap.org/pediatrics/article/142/6/e20183061/37478/Screening-Examination-of-Premature-Infants-for" },
  ballard: { label: "Official New Ballard conversion guidance", url: "https://www.ballardscore.com/CatalogView/FAQ" },
  parkland: { label: "University pediatric Lund–Browder chart", url: "https://www.southalabama.edu/colleges/com/departments/surgery/resources/burn-initial/lund-and-browder-pediatric.pdf" },
  ponderal: { label: "PubMed ponderal-index evidence", url: "https://pubmed.ncbi.nlm.nih.gov/9491856/" },
};
for (const calculator of CALCULATORS) {
  if (REPUTABLE_CALCULATOR_SOURCES[calculator.id]) calculator.external = REPUTABLE_CALCULATOR_SOURCES[calculator.id];
}

export const CALC_BY_ID = Object.fromEntries(CALCULATORS.map((c) => [c.id, c]));

