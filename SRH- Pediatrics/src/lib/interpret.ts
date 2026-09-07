import { dayOfLife, hoursOfLife } from "@/lib/clinical";

/** A single provisional interpretation flag shown across the app. */
export type Flag = {
  key: string;
  label: string;
  sev: "info" | "warn" | "crit";
  note?: string;
};

export type BabyLite = {
  unit: string;
  dob: string;
  gestWeeks: number;
  gestDays: number;
  birthWeight: number;
  currentWeight: number;
};

export type AgeBand = "neonate" | "infant" | "toddler" | "child" | "adol";

export function ageBand(b: BabyLite): { band: AgeBand; pmaWeeks: number; years: number } {
  const dol = dayOfLife(b.dob);
  const isNeo = b.unit === "nicu" || b.unit === "postnatal";
  if (isNeo) {
    const pma = b.gestWeeks + b.gestDays / 7 + dol / 7;
    return { band: pma < 44 ? "neonate" : "infant", pmaWeeks: pma, years: dol / 365 };
  }
  const years = b.gestWeeks;
  const band: AgeBand = years < 1 ? "infant" : years < 3 ? "toddler" : years < 10 ? "child" : "adol";
  return { band, pmaWeeks: 0, years };
}

/* ------------------------------ vital signs ------------------------------ */

const HR_RANGE: Record<AgeBand, [number, number]> = {
  neonate: [100, 160], infant: [100, 180], toddler: [90, 150], child: [70, 120], adol: [60, 100],
};
const RR_RANGE: Record<AgeBand, [number, number]> = {
  neonate: [30, 60], infant: [25, 50], toddler: [20, 40], child: [18, 30], adol: [12, 20],
};

export function hypotensionSbp(b: BabyLite): number {
  const { band, pmaWeeks, years } = ageBand(b);
  if (band === "neonate") {
    if (b.gestWeeks < 37) return Math.min(55, Math.max(35, Math.round(pmaWeeks) + 10));
    return 60;
  }
  if (band === "infant") return 60;
  if (band === "adol") return 90;
  return 70 + 2 * Math.max(1, Math.floor(years));
}

export function mapFromBP(sbp: number | null, dbp: number | null): number | null {
  if (sbp == null || dbp == null) return null;
  return Math.round((sbp + 2 * dbp) / 3);
}

export type VitalsInput = {
  hr?: number | null; rr?: number | null; spo2?: number | null; spo2Post?: number | null;
  temp?: number | null; sbp?: number | null; dbp?: number | null; map?: number | null;
  crt?: number | null; rbs?: number | null; fio2?: number | null;
  painScore?: number | null; urineMlKgHr?: number | null;
};

export function interpretVitals(b: BabyLite, v: VitalsInput): Flag[] {
  const { band } = ageBand(b);
  const dol = dayOfLife(b.dob);
  const f: Flag[] = [];
  if (v.hr != null) {
    const [lo, hi] = HR_RANGE[band];
    if (v.hr < (band === "neonate" ? 80 : lo - 30)) f.push({ key: "brady", label: "Bradycardia", sev: "crit", note: `HR ${v.hr}` });
    else if (v.hr < lo) f.push({ key: "brady", label: "Low HR for age", sev: "warn", note: `HR ${v.hr} < ${lo}` });
    else if (v.hr > hi + 20) f.push({ key: "tachy", label: "Tachycardia", sev: "warn", note: `HR ${v.hr} > ${hi + 20}` });
  }
  if (v.rr != null) {
    const [lo, hi] = RR_RANGE[band];
    if (v.rr < (band === "neonate" ? 20 : lo - 8)) f.push({ key: "bradyp", label: "Low RR / hypoventilation", sev: "crit", note: `RR ${v.rr}` });
    else if (v.rr > hi) f.push({ key: "tachyp", label: "Tachypnoea", sev: "warn", note: `RR ${v.rr} > ${hi}` });
  }
  if (v.spo2 != null) {
    const preterm = band === "neonate" && b.gestWeeks < 37;
    if (preterm) {
      if (v.spo2 < 88) f.push({ key: "hypox", label: "Hypoxaemia", sev: "crit", note: `SpO₂ ${v.spo2}% < 88%` });
      else if (v.spo2 < 90) f.push({ key: "spo2", label: "SpO₂ below preterm target", sev: "warn", note: `${v.spo2}% < 90%` });
      else if (v.spo2 > 95) f.push({ key: "spo2", label: "SpO₂ above preterm target — hyperoxia risk", sev: "warn", note: `${v.spo2}% > 95%` });
    } else {
      if (v.spo2 < 90) f.push({ key: "hypox", label: "Hypoxaemia", sev: "crit", note: `SpO₂ ${v.spo2}% < 90%` });
      else if (v.spo2 < 94) f.push({ key: "spo2", label: "SpO₂ below target", sev: "warn", note: `${v.spo2}% < 94%` });
    }
  }
  if (v.temp != null) {
    if (v.temp < 32) f.push({ key: "hypotherm", label: "Severe hypothermia", sev: "crit", note: `${v.temp} °C` });
    else if (v.temp < 36) f.push({ key: "hypotherm", label: "Moderate hypothermia", sev: "crit", note: `${v.temp} °C` });
    else if (v.temp < 36.5) f.push({ key: "hypotherm", label: "Mild hypothermia / cold stress", sev: "warn", note: `${v.temp} °C` });
    else if (v.temp >= 39) f.push({ key: "fever", label: "High fever", sev: "crit", note: `${v.temp} °C` });
    else if (v.temp >= 37.5) f.push({ key: "fever", label: "Fever", sev: "warn", note: `${v.temp} °C` });
  }
  const thr = hypotensionSbp(b);
  if (v.sbp != null && v.sbp < thr) f.push({ key: "hypot", label: "Hypotension", sev: "crit", note: `SBP ${v.sbp} < ${thr} (PALS)` });
  const mapThr = band === "neonate" ? 30 : 55;
  if (v.map != null && v.map < mapThr) f.push({ key: "lowmap", label: "Low MAP", sev: "warn", note: `MAP ${v.map} < ${mapThr}` });
  if (v.crt != null && v.crt > 4) f.push({ key: "crt", label: "Prolonged CRT", sev: "crit", note: `${v.crt} s` });
  else if (v.crt != null && v.crt > 3) f.push({ key: "crt", label: "Borderline CRT", sev: "warn", note: `${v.crt} s` });
  if (v.rbs != null) {
    if (v.rbs < 45) f.push({ key: "hypo", label: "Hypoglycaemia", sev: "crit", note: `${v.rbs} mg/dL < 45` });
    else if (v.rbs < 60) f.push({ key: "hypo", label: "Borderline glucose", sev: "warn", note: `${v.rbs} mg/dL` });
    else if (v.rbs > 250) f.push({ key: "hyper", label: "Marked hyperglycaemia", sev: "crit", note: `${v.rbs} mg/dL` });
    else if (v.rbs > 180) f.push({ key: "hyper", label: "Hyperglycaemia", sev: "warn", note: `${v.rbs} mg/dL` });
  }
  if (v.urineMlKgHr != null && dol >= 1) {
    if (v.urineMlKgHr < 0.5) f.push({ key: "oliguria", label: "Severe oliguria", sev: "crit", note: `${v.urineMlKgHr} ml/kg/h` });
    else if (v.urineMlKgHr < 1) f.push({ key: "oliguria", label: "Oliguria", sev: "warn", note: `${v.urineMlKgHr} ml/kg/h` });
    else if (v.urineMlKgHr > 5) f.push({ key: "polyuria", label: "Polyuria", sev: "warn", note: `${v.urineMlKgHr} ml/kg/h` });
  }
  return f;
}

export function interpretPain(scale: string, raw: number | null): Flag[] {
  if (raw == null) return [];
  const sev: Flag["sev"] = scale === "NIPS" ? (raw >= 4 ? "crit" : raw >= 2 ? "warn" : "info")
    : scale === "PIPP-R" ? (raw >= 13 ? "crit" : raw >= 7 ? "warn" : "info")
    : scale === "N-PASS" ? (raw > 3 ? "crit" : raw > 1 ? "warn" : "info")
    : scale === "CRIES" ? (raw >= 4 ? "crit" : raw >= 2 ? "warn" : "info")
    : (raw >= 4 ? "crit" : "info");
  return [{ key: "pain", label: `Pain score ${scale} = ${raw}`, sev, note: raw >= 4 || raw < 0 ? "Intervention indicated" : "Within acceptable range" }];
}

export function maintenanceFluidsMlPerDay(weightKg: number): number {
  if (weightKg <= 0) return 0;
  if (weightKg <= 10) return Math.round(weightKg * 100);
  if (weightKg <= 20) return Math.round(1000 + (weightKg - 10) * 50);
  return Math.round(1500 + (weightKg - 20) * 20);
}

export function neonatalDayFluidRange(b: BabyLite): [number, number] {
  const dol = Math.max(1, dayOfLife(b.dob));
  const lo = Math.min(180, 60 + (dol - 1) * 20);
  const hi = Math.min(200, 90 + (dol - 1) * 25);
  return [lo, hi];
}

export function girFromDextrose(concPct: number, mlPerKgDay: number): number {
  if (mlPerKgDay <= 0) return 0;
  return Math.round(((concPct * 10 * mlPerKgDay) / 1440) * 100) / 100;
}

export function dextroseConcForGir(gir: number, mlPerKgDay: number): number {
  if (mlPerKgDay <= 0) return 0;
  return Math.round(((gir * 1440) / (mlPerKgDay * 10)) * 100) / 100;
}

const FENTON: Record<number, [number, number]> = {
  24: [400, 800], 25: [500, 1000], 26: [600, 1200], 27: [700, 1300],
  28: [900, 1500], 29: [1000, 1700], 30: [1100, 1900], 31: [1300, 2100],
  32: [1500, 2300], 33: [1700, 2500], 34: [1900, 2700], 35: [2100, 2900],
  36: [2300, 3100], 37: [2500, 3300], 38: [2600, 3500], 39: [2700, 3700],
  40: [2800, 3800], 41: [2900, 3900], 42: [3000, 4000],
};

export function fentonBand(gaWeeks: number, birthWeight: number): "SGA" | "AGA" | "LGA" | null {
  const ga = Math.round(gaWeeks);
  const row = FENTON[ga];
  if (!row || birthWeight <= 0) return null;
  if (birthWeight < row[0]) return "SGA";
  if (birthWeight > row[1]) return "LGA";
  return "AGA";
}

export function growthFlags(velocity: number | null, lossPct: number, regained: boolean): Flag[] {
  const f: Flag[] = [];
  const loss = lossPct < 0 ? -lossPct : lossPct;
  if (loss > 15) f.push({ key: "loss", label: "Excessive weight loss > 15%", sev: "crit", note: `${loss}% below BW` });
  else if (loss > 10) f.push({ key: "loss", label: "Weight loss > 10%", sev: "warn", note: `${loss}% below BW` });
  if (!regained && loss > 0) f.push({ key: "regain", label: "Birth weight not yet regained", sev: "info" });
  if (velocity != null) {
    if (velocity < 0) f.push({ key: "vel", label: "Weight falling", sev: "warn", note: `${velocity} g/kg/d` });
    else if (velocity < 10) f.push({ key: "vel", label: "Suboptimal growth < 10 g/kg/d", sev: "warn", note: `${velocity} g/kg/d` });
    else if (velocity >= 15) f.push({ key: "vel", label: "Target growth 15–20 g/kg/d", sev: "info", note: `${velocity} g/kg/d` });
  }
  return f;
}

/* ------------------------------ labs ------------------------------ */

const num = (s: unknown): number | null => {
  if (s == null || s === "") return null;
  const m = String(s).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

export function interpretLabs(labs: Record<string, string>, b: BabyLite): Flag[] {
  const { band } = ageBand(b);
  const f: Flag[] = [];
  const hb = num(labs["Hb"]);
  if (hb != null) {
    const thr = band === "neonate" ? 13 : 11;
    if (hb < thr - 3) f.push({ key: "hb", label: "Severe anaemia", sev: "crit", note: `Hb ${hb}` });
    else if (hb < thr) f.push({ key: "hb", label: "Anaemia", sev: "warn", note: `Hb ${hb} < ${thr}` });
  }
  const plt = num(labs["Platelets"]);
  if (plt != null) {
    if (plt < 25) f.push({ key: "plt", label: "Severe thrombocytopenia", sev: "crit", note: `${plt}k` });
    else if (plt < 50) f.push({ key: "plt", label: "Thrombocytopenia", sev: "warn", note: `${plt}k` });
    else if (plt < 100) f.push({ key: "plt", label: "Mild thrombocytopenia", sev: "warn", note: `${plt}k` });
  }
  const crp = num(labs["CRP"]);
  if (crp != null && crp > 100) f.push({ key: "crp", label: "Markedly raised CRP — high sepsis suspicion", sev: "crit", note: `${crp} mg/L` });
  else if (crp != null && crp > 10) f.push({ key: "crp", label: "Raised CRP", sev: "warn", note: `${crp} mg/L` });
  const na = num(labs["Na"]);
  if (na != null) {
    if (na < 125 || na > 155) f.push({ key: "na", label: "Marked Na derangement", sev: "crit", note: `Na ${na}` });
    else if (na < 135 || na > 148) f.push({ key: "na", label: "Na derangement", sev: "warn", note: `Na ${na}` });
  }
  const k = num(labs["K"]);
  if (k != null) {
    if (k < 3 || k > 6.5) f.push({ key: "k", label: "Marked K derangement", sev: "crit", note: `K ${k}` });
    else if (k < 3.5 || k > 5.5) f.push({ key: "k", label: "K derangement", sev: "warn", note: `K ${k}` });
  }
  const creat = num(labs["Creatinine"]);
  if (creat != null && creat > 1.5) f.push({ key: "cr", label: "Raised creatinine", sev: "warn", note: `${creat}` });
  const ca = num(labs["Ca (ionised)"]);
  if (ca != null && ca < 0.9) f.push({ key: "ca", label: "Severe hypocalcaemia — treat now", sev: "crit", note: `${ca} mmol/L` });
  else if (ca != null && ca < 1.0) f.push({ key: "ca", label: "Hypocalcaemia", sev: "warn", note: `${ca} mmol/L` });
  return f;
}

export function interpretABG(labs: Record<string, string>): Flag[] {
  const ph = num(labs["pH"]);
  const pco2 = num(labs["pCO2"]);
  const hco3 = num(labs["HCO3"]);
  const be = num(labs["BE"]);
  const f: Flag[] = [];
  if (ph == null) return f;
  const acid = ph < 7.35, alk = ph > 7.45;
  const respAcid = pco2 != null && pco2 > 50, respAlk = pco2 != null && pco2 < 35;
  const metAcid = (hco3 != null && hco3 < 18) || (be != null && be < -5);
  const metAlk = (hco3 != null && hco3 > 26) || (be != null && be > 3);
  const severe = ph < 7.15;
  if (acid && respAcid && metAcid) f.push({ key: "abg", label: "Mixed respiratory + metabolic acidosis", sev: "crit", note: `pH ${ph}` });
  else if (acid && respAcid) f.push({ key: "abg", label: severe ? "Severe respiratory acidosis" : "Respiratory acidosis", sev: severe ? "crit" : "warn", note: `pH ${ph}, pCO₂ ${pco2}` });
  else if (acid && metAcid) f.push({ key: "abg", label: severe ? "Severe metabolic acidosis" : "Metabolic acidosis", sev: severe ? "crit" : "warn", note: `pH ${ph}, HCO₃ ${hco3 ?? be}` });
  else if (alk && respAlk) f.push({ key: "abg", label: "Respiratory alkalosis", sev: "warn", note: `pH ${ph}, pCO₂ ${pco2}` });
  else if (alk && metAlk) f.push({ key: "abg", label: "Metabolic alkalosis", sev: "warn", note: `pH ${ph}` });
  else if (!acid && !alk && (respAcid || metAcid)) f.push({ key: "abg", label: "Compensated acidosis", sev: "info", note: `pH ${ph}` });
  else if (!acid && !alk) f.push({ key: "abg", label: "Normal pH", sev: "info", note: `pH ${ph}` });
  const lac = num(labs["Lactate"]);
  if (lac != null && lac > 4) f.push({ key: "lac", label: "Raised lactate (hypoperfusion)", sev: "crit", note: `${lac}` });
  else if (lac != null && lac > 2) f.push({ key: "lac", label: "Borderline lactate", sev: "warn", note: `${lac}` });
  return f;
}

export function interpretBilirubin(tsb: number, hours: number, gaWeeks: number): Flag[] {
  let photo: number;
  if (gaWeeks >= 38) photo = hours < 24 ? 10 : hours < 48 ? 15 : hours < 72 ? 18 : 20;
  else if (gaWeeks >= 35) photo = hours < 24 ? 8 : hours < 48 ? 13 : hours < 72 ? 16 : 18;
  else photo = hours < 24 ? 6 : hours < 48 ? 10 : hours < 72 ? 12 : 13;
  const exchange = photo + 5;
  if (tsb >= exchange) return [{ key: "bili", label: "Above exchange threshold", sev: "crit", note: `TSB ${tsb} ≥ ${exchange}` }];
  if (tsb >= photo) return [{ key: "bili", label: "Above phototherapy line", sev: "warn", note: `TSB ${tsb} ≥ ${photo}` }];
  return [{ key: "bili", label: "Below phototherapy line", sev: "info", note: `TSB ${tsb} < ${photo}` }];
}

export function allLabFlags(labs: Record<string, string>, b: BabyLite): Flag[] {
  const f = [...interpretLabs(labs, b), ...interpretABG(labs)];
  const tsb = num(labs["TSB"]);
  if (tsb != null) f.push(...interpretBilirubin(tsb, hoursOfLife(b.dob), b.gestWeeks));
  return f;
}

/* ------------------------------ respiratory ------------------------------ */

export function oiFrom(map: number | null, fio2Pct: number | null, pao2: number | null): number | null {
  if (map == null || fio2Pct == null || pao2 == null || pao2 <= 0) return null;
  return Math.round(((map * fio2Pct) / pao2) * 10) / 10;
}

export function respFlags(opts: { map?: number | null; fio2?: number | null; pao2?: number | null; silverman?: number | null; mode?: string }): Flag[] {
  const out: Flag[] = [];
  const oi = oiFrom(opts.map ?? null, opts.fio2 ?? null, opts.pao2 ?? null);
  if (oi != null) {
    out.push(oi >= 16 ? { key: "oi", label: `OI ${oi}`, sev: "crit", note: "severe — escalate" }
      : oi >= 10 ? { key: "oi", label: `OI ${oi}`, sev: "warn", note: "moderate" }
      : oi >= 5 ? { key: "oi", label: `OI ${oi}`, sev: "warn", note: "mild" }
      : { key: "oi", label: `OI ${oi}`, sev: "info", note: "acceptable" });
  }
  if (opts.silverman != null) {
    const s = opts.silverman;
    out.push(s >= 7 ? { key: "silv", label: `Silverman ${s}`, sev: "crit", note: "severe distress" }
      : s >= 4 ? { key: "silv", label: `Silverman ${s}`, sev: "warn", note: "moderate distress" }
      : s >= 1 ? { key: "silv", label: `Silverman ${s}`, sev: "warn", note: "mild distress" }
      : { key: "silv", label: "Silverman 0", sev: "info", note: "no distress" });
  }
  if (opts.fio2 != null) {
    const fi = opts.fio2;
    out.push(fi <= 30 && (opts.map == null || opts.map <= 8)
      ? { key: "wean", label: `FiO₂ ${fi}%`, sev: "info", note: "in wean window" }
      : fi <= 40 ? { key: "wean", label: `FiO₂ ${fi}%`, sev: "info", note: "near wean range" }
      : { key: "wean", label: `FiO₂ ${fi}%`, sev: "warn", note: "not yet wean range" });
  }
  return out;
}

/* ------------------------------ admission ------------------------------ */

export function apgarBand(score: number): { sev: Flag["sev"]; note: string } {
  if (score <= 3) return { sev: "crit", note: "severely depressed" };
  if (score <= 6) return { sev: "warn", note: "moderately depressed" };
  return { sev: "info", note: "good condition" };
}

export function gestCategory(weeks: number): string {
  if (weeks < 28) return "extreme preterm";
  if (weeks < 32) return "very preterm";
  if (weeks < 34) return "moderate preterm";
  if (weeks < 37) return "late preterm";
  if (weeks < 39) return "early term";
  if (weeks < 41) return "term";
  return "post-term";
}

export function weightCategory(grams: number): string {
  if (grams < 1000) return "ELBW";
  if (grams < 1500) return "VLBW";
  if (grams < 2500) return "LBW";
  if (grams <= 4000) return "appropriate";
  return "macrosomia";
}

export function admissionFlags(b: { unit: string; gestWeeks: number; gestDays: number; birthWeight: number; apgar1?: number | null; apgar5?: number | null }): Flag[] {
  const out: Flag[] = [];
  const neo = b.unit === "nicu" || b.unit === "postnatal";
  if (neo && b.gestWeeks) {
    const sev: Flag["sev"] = b.gestWeeks < 32 ? "crit" : b.gestWeeks < 37 ? "warn" : "info";
    out.push({ key: "gest", label: `Gestation ${b.gestWeeks}+${b.gestDays}w`, sev, note: gestCategory(b.gestWeeks) });
  }
  if (neo && b.birthWeight) {
    const sev: Flag["sev"] = b.birthWeight < 1500 ? "crit" : b.birthWeight < 2500 ? "warn" : "info";
    out.push({ key: "bw", label: `BW ${b.birthWeight} g`, sev, note: weightCategory(b.birthWeight) });
  }
  if (neo && b.apgar1 != null) {
    const a = apgarBand(b.apgar1);
    out.push({ key: "a1", label: `Apgar 1′ ${b.apgar1}`, sev: a.sev, note: a.note });
  }
  if (neo && b.apgar5 != null) {
    const a = apgarBand(b.apgar5);
    out.push({ key: "a5", label: `Apgar 5′ ${b.apgar5}`, sev: a.sev, note: a.note });
  }
  return out;
}

/* ------------------------------ anthropometry (WHO 0–5 y / IAP 5–18 y) ------------------------------ */

const WFA: Array<{ m: number; med: number; sd2: number; sd3: number }> = [
  { m: 0, med: 3.3, sd2: 2.5, sd3: 2.1 }, { m: 1, med: 4.5, sd2: 3.4, sd3: 2.9 },
  { m: 2, med: 5.6, sd2: 4.3, sd3: 3.8 }, { m: 3, med: 6.4, sd2: 5.0, sd3: 4.4 },
  { m: 4, med: 7.0, sd2: 5.6, sd3: 5.0 }, { m: 6, med: 7.9, sd2: 6.4, sd3: 5.7 },
  { m: 9, med: 8.9, sd2: 7.1, sd3: 6.4 }, { m: 12, med: 9.6, sd2: 7.7, sd3: 7.0 },
  { m: 18, med: 10.9, sd2: 8.8, sd3: 8.0 }, { m: 24, med: 12.2, sd2: 9.7, sd3: 8.8 },
  { m: 36, med: 14.3, sd2: 11.3, sd3: 10.3 }, { m: 48, med: 16.3, sd2: 12.7, sd3: 11.5 },
  { m: 60, med: 18.3, sd2: 14.1, sd3: 12.7 },
  { m: 72, med: 20.9, sd2: 16.0, sd3: 14.4 },
  { m: 84, med: 23.5, sd2: 17.9, sd3: 16.2 },
  { m: 96, med: 26.1, sd2: 19.8, sd3: 18.0 },
  { m: 108, med: 28.8, sd2: 21.8, sd3: 19.8 },
  { m: 120, med: 31.5, sd2: 23.8, sd3: 21.6 },
];
const HFA_0_5: Array<{ m: number; med: number; sd2: number }> = [
  { m: 0, med: 49.9, sd2: 46.1 }, { m: 6, med: 67.6, sd2: 62.7 },
  { m: 12, med: 75.7, sd2: 71.0 }, { m: 24, med: 87.1, sd2: 81.7 },
  { m: 36, med: 96.1, sd2: 90.0 }, { m: 48, med: 103.3, sd2: 96.8 },
  { m: 60, med: 110.0, sd2: 103.2 },
];
const HFA_5_18: Array<{ m: number; med: number; sd2: number }> = [
  { m: 60, med: 110, sd2: 100 }, { m: 72, med: 119, sd2: 108 },
  { m: 84, med: 127, sd2: 116 }, { m: 96, med: 133, sd2: 122 },
  { m: 108, med: 140, sd2: 128 }, { m: 120, med: 147, sd2: 134 },
  { m: 132, med: 153, sd2: 140 }, { m: 144, med: 160, sd2: 146 },
  { m: 156, med: 160, sd2: 146 }, { m: 168, med: 163, sd2: 149 },
  { m: 180, med: 164, sd2: 150 }, { m: 204, med: 164, sd2: 150 },
];

function lerpTable(pts: Array<{ m: number; [k: string]: number }>, m: number, key: string): number {
  if (m <= pts[0].m) return pts[0][key];
  if (m >= pts[pts.length - 1].m) return pts[pts.length - 1][key];
  for (let i = 1; i < pts.length; i++) {
    if (m <= pts[i].m) {
      const a = pts[i - 1], b = pts[i];
      const t = (m - a.m) / (b.m - a.m);
      return a[key] + t * (b[key] - a[key]);
    }
  }
  return pts[0][key];
}

export type AnthropometryResult = {
  wfa?: Flag; hfa?: Flag; bmi?: Flag;
  summary: Flag;
};

/** WHO (0–5 y) and IAP (5–18 y) weight, height and BMI interpretation. */
export function interpretAnthropometry(ageMonths: number, weightKg: number, heightCm?: number | null): AnthropometryResult {
  const out: AnthropometryResult = {
    summary: { key: "anthro", label: "Anthropometry", sev: "info", note: "Enter age, weight and height." },
  };

  if (ageMonths <= 120 && weightKg > 0) {
    const med = lerpTable(WFA, ageMonths, "med");
    const sd2 = lerpTable(WFA, ageMonths, "sd2");
    const sd3 = lerpTable(WFA, ageMonths, "sd3");
    let sev: Flag["sev"]; let label: string;
    if (weightKg < sd3) { sev = "crit"; label = "Severe underweight (< −3 SD)"; }
    else if (weightKg < sd2) { sev = "crit"; label = "Underweight (−3 to −2 SD)"; }
    else if (weightKg < med * 0.85) { sev = "warn"; label = "Mild underweight (−1 to −2 SD)"; }
    else if (weightKg > med * 1.35) { sev = "warn"; label = "Overweight risk"; }
    else { sev = "info"; label = "Normal weight-for-age"; }
    out.wfa = { key: "wfa", label, sev, note: `${weightKg} kg (median ~${med.toFixed(1)}, −2SD ~${sd2.toFixed(1)})` };
  }

  if (heightCm != null && heightCm > 0) {
    const med = ageMonths <= 60 ? lerpTable(HFA_0_5, ageMonths, "med") : lerpTable(HFA_5_18, ageMonths, "med");
    const sd2v = ageMonths <= 60 ? lerpTable(HFA_0_5, ageMonths, "sd2") : lerpTable(HFA_5_18, ageMonths, "sd2");
    let sev: Flag["sev"]; let label: string;
    if (heightCm < sd2v - 3) { sev = "crit"; label = "Severe stunting (< −3 SD)"; }
    else if (heightCm < sd2v) { sev = "crit"; label = "Stunting (−3 to −2 SD)"; }
    else if (heightCm < sd2v + 3) { sev = "warn"; label = "Mild stunting (−2 to −1 SD)"; }
    else if (heightCm > med * 1.08) { sev = "warn"; label = "Tall-for-age — endocrine review"; }
    else { sev = "info"; label = "Normal height-for-age"; }
    out.hfa = { key: "hfa", label, sev, note: `${heightCm} cm (median ~${med.toFixed(1)}, −2SD ~${sd2v.toFixed(1)})` };
  }

  if (heightCm != null && heightCm > 0 && ageMonths >= 24 && weightKg > 0) {
    const hM = heightCm / 100;
    const bmi = weightKg / (hM * hM);
    let sev: Flag["sev"]; let label: string;
    if (bmi < 13) { sev = "crit"; label = `Severe wasting (BMI ${bmi.toFixed(1)})`; }
    else if (bmi < 14) { sev = "crit"; label = `Acute malnutrition (BMI ${bmi.toFixed(1)})`; }
    else if (bmi < 15) { sev = "warn"; label = `Underweight (BMI ${bmi.toFixed(1)})`; }
    else if (bmi > 24) { sev = "crit"; label = `Obesity risk (BMI ${bmi.toFixed(1)})`; }
    else if (bmi > 21) { sev = "warn"; label = `Overweight risk (BMI ${bmi.toFixed(1)})`; }
    else { sev = "info"; label = `Normal BMI ${bmi.toFixed(1)}`; }
    out.bmi = { key: "bmi", label, sev, note: `${weightKg} kg / ${heightCm} cm` };
  }

  const sevs = [out.wfa, out.hfa, out.bmi].filter(Boolean).map(x => x!.sev);
  const sev: Flag["sev"] = sevs.includes("crit") ? "crit" : sevs.includes("warn") ? "warn" : "info";
  out.summary = { key: "anthro", label: "Anthropometry", sev, note: sevs.length ? `${sevs.filter(s => s !== "info").length} parameter(s) outside normal` : "within normal" };
  return out;
}

export function overallImpression(flags: Flag[]): { sev: Flag["sev"]; text: string } {
  const crit = flags.filter((f) => f.sev === "crit");
  const warn = flags.filter((f) => f.sev === "warn");
  if (crit.length) return { sev: "crit", text: `${crit.length} critical finding${crit.length > 1 ? "s" : ""}: ${crit.map((c) => c.label).join(", ")}.` };
  if (warn.length) return { sev: "warn", text: `${warn.length} borderline value${warn.length > 1 ? "s" : ""}: ${warn.map((w) => w.label).join(", ")}.` };
  if (!flags.length) return { sev: "info", text: "No data entered yet." };
  return { sev: "info", text: "All entered parameters within provisional reference ranges." };
}

/* ------------------------------ anthro on BabyLite ------------------------------ */

const HC_REF: Record<number, [number, number, number]> = {
  28: [25.5, 27.5, 29.5], 30: [26.5, 28.5, 30.5], 32: [28, 30, 32], 34: [29.5, 31.5, 33.5],
  36: [31, 33, 35], 38: [32.5, 34.5, 36.5], 40: [33.5, 35.5, 37.5], 42: [34.5, 36.5, 38.5], 44: [35.5, 37.5, 39.5],
};
const LEN_REF: Record<number, [number, number, number]> = {
  28: [37, 40, 43], 30: [38.5, 41.5, 44.5], 32: [40, 43, 46], 34: [42, 45, 48],
  36: [43.5, 46.5, 49.5], 38: [45, 48, 51], 40: [46.5, 50, 53.5], 42: [48, 51, 54], 44: [49, 52, 55],
};

function hcRef(pmaW: number): [number, number, number] { return HC_REF[Math.min(44, Math.max(28, Math.round(pmaW / 2) * 2))] ?? [33, 35, 37]; }
function lenRef(pmaW: number): [number, number, number] { return LEN_REF[Math.min(44, Math.max(28, Math.round(pmaW / 2) * 2))] ?? [48, 51, 54]; }

export function anthropometryFlags(b: BabyLite, hc?: number | null, length?: number | null): Flag[] {
  const { pmaWeeks, band } = ageBand(b);
  const f: Flag[] = [];
  if (hc != null && pmaWeeks >= 28 && pmaWeeks <= 46) {
    const [p3, , p97] = hcRef(pmaWeeks);
    if (hc < p3 - 1) f.push({ key: "hc", label: `Head circumference ${hc} cm`, sev: "crit", note: `Microcephaly risk — < ${p3 - 1} cm (3rd ${p3}) @ PMA ${pmaWeeks.toFixed(0)}w` });
    else if (hc < p3) f.push({ key: "hc", label: `Head circumference ${hc} cm`, sev: "warn", note: `At/below 3rd centile (${p3} cm) @ PMA ${pmaWeeks.toFixed(0)}w` });
    else if (hc > p97 + 1) f.push({ key: "hc", label: `Head circumference ${hc} cm`, sev: "warn", note: `Macrocephaly risk — > ${p97 + 1} cm @ PMA ${pmaWeeks.toFixed(0)}w` });
    else f.push({ key: "hc", label: `HC ${hc} cm`, sev: "info", note: `Normal range ${p3}–${p97} cm @ PMA ${pmaWeeks.toFixed(0)}w` });
  }
  if (length != null && pmaWeeks >= 28 && pmaWeeks <= 46) {
    const [p3, , p97] = lenRef(pmaWeeks);
    if (length < p3 - 1) f.push({ key: "len", label: `Length ${length} cm`, sev: "crit", note: `Short stature — < ${p3 - 1} cm (3rd ${p3}) @ PMA ${pmaWeeks.toFixed(0)}w` });
    else if (length < p3) f.push({ key: "len", label: `Length ${length} cm`, sev: "warn", note: `At/below 3rd centile (${p3} cm) @ PMA ${pmaWeeks.toFixed(0)}w` });
    else f.push({ key: "len", label: `Length ${length} cm`, sev: "info", note: `Normal range ${p3}–${p97} cm @ PMA ${pmaWeeks.toFixed(0)}w` });
  }
  if (band === "neonate" && b.gestWeeks < 37) {
    f.push({ key: "hcg", label: "Target HC growth 0.5–1 cm/wk", sev: "info" });
  }
  return f;
}

export function consolidatedFlags(args: {
  baby: BabyLite;
  vitals?: (VitalsInput & Record<string, unknown>) | null;
  labs?: Record<string, string> | null;
  growth?: { velocity: number | null; lossPct: number; regained: boolean } | null;
  resp?: { map?: number | null; fio2?: number | null; pao2?: number | null; silverman?: number | null } | null;
}): Flag[] {
  const out: Flag[] = [];
  if (args.vitals) out.push(...interpretVitals(args.baby, args.vitals));
  if (args.labs && Object.values(args.labs).some((x) => x && String(x).trim())) out.push(...allLabFlags(args.labs, args.baby));
  if (args.growth) out.push(...growthFlags(args.growth.velocity, args.growth.lossPct, args.growth.regained));
  if (args.resp) out.push(...respFlags(args.resp));
  return out;
}
