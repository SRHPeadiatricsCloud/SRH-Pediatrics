import { NextResponse } from "next/server";
import { buildDischargeRecord } from "@/lib/discharge";
import { db } from "@/db";
import { babies, events, handovers, problems, tasks, vitals } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const H = 3600000;

export async function POST() {
  await db.execute(sql`TRUNCATE TABLE handovers RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE TABLE tasks RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE TABLE events RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE TABLE vitals RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE TABLE problems RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE TABLE babies RESTART IDENTITY`);

  /** Local calendar helpers — the archive groups by local day, never UTC. */
  const daysAgoAt = (days: number, hour = 10): Date => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  /** A date in the previous calendar month, so the monthly archive has 2 groups. */
  const lastMonthDay = (dayOfMonth: number): Date => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    d.setDate(dayOfMonth);
    d.setHours(11, 0, 0, 0);
    return d;
  };

  const seedBabies = [
    {
      uhid: "NIC-24-0912",
      babyName: "Baby of Anjali Sharma",
      motherName: "Anjali Sharma",
      bed: "R1 · Warmer 1",
      sex: "Male",
      dob: new Date(Date.now() - 6 * 24 * H),
      gestWeeks: 27,
      gestDays: 4,
      birthWeight: 890,
      currentWeight: 845,
      deliveryMode: "Emergency LSCS",
      apgar1: 4,
      apgar5: 7,
      bloodGroup: "O+",
      acuity: "critical",
      consultant: "Dr. Siddhartha",
      clinical: {
        resp: {
          mode: "SIMV + PS",
          settings: { fio2: 35, peep: 6, pip: 18, rate: 45, ti: 0.35, map: 9 },
          surfactant: "LISA / MIST",
          ettSize: "2.5",
          ettDepth: "7 cm",
          silverman: 3,
          spo2Target: "90–95%",
        },
        fluids: {
          totalMlKgDay: 150,
          enteralMlKgDay: 40,
          ivMlKgDay: 110,
          gir: 7,
          aminoAcid: 3.5,
          lipid: 3,
          kcal: 95,
          feedType: "Expressed breast milk (EBM)",
          feedRoute: "OG tube",
          feedFreq: "2 hourly",
          feedVol: 2.8,
          tpn: true,
          plan: {
            mode: "daily",
            startDate: new Date().toISOString().slice(0, 10),
            day: 2,
            enteral: { startMlKgDay: 20, changePer24h: 20, minimumMlKgDay: 0, maximumMlKgDay: 160 },
            iv: { startMlKgDay: 120, changePer24h: -10, minimumMlKgDay: 40, maximumMlKgDay: 200 },
          },
        },
        lines: [
          { name: "PICC line", day: 4, site: "Right saphenous" },
          { name: "Endotracheal tube", day: 6 },
          { name: "OG tube", day: 6 },
        ],
        drugs: [
          { name: "Piperacillin-tazobactam", day: 4, ofDays: 7 },
          { name: "Amikacin", day: 4, ofDays: 7 },
          { name: "Caffeine citrate", dose: "5 mg/kg OD" },
          { name: "Fluconazole", dose: "prophylaxis" },
          { name: "Dopamine", dose: "7 µg/kg/min" },
        ],
        labs: { Hb: "12.8", Platelets: "94", CRP: "38", pH: "7.28", pCO2: "52", "Blood culture": "Klebsiella" },
        care: ["Kangaroo mother care given", "Oral care with colostrum", "Ventilator bundle (head end up 30°) checked"],
        plan: "Continue ventilation, wean PIP as tolerated, escalate feeds by 20 ml/kg/day, repeat CUS on day 7.",
      },
      problems: [
        ["Respiratory", "RDS Gr III"],
        ["Respiratory", "Apnoea of prematurity"],
        ["Infection", "Culture positive LOS"],
        ["Infection", "Blood culture: Klebsiella"],
        ["Cardiovascular", "Haemodynamically significant PDA"],
        ["Haematology / Bilirubin", "Thrombocytopenia – mild (100–150k)"],
        ["Growth / Prematurity", "Extremely low birth weight (<1000 g)"],
        ["Growth / Prematurity", "Extreme preterm (<28 weeks)"],
      ],
      vitals: { hr: 168, rr: 52, spo2: 91, temp: 36.9, sbp: 48, dbp: 26, map: 33, crt: 3, rbs: 78, fio2: 35, painScore: 3, urineMlKgHr: 1.8 },
      tasks: ["Send ABG at 6 am", "Chase blood culture sensitivity", "Echo for PDA today", "Weigh baby and recalculate fluids"],
    },
    {
      uhid: "NIC-24-0918",
      babyName: "Baby of Fatima Khan",
      motherName: "Fatima Khan",
      bed: "R1 · Warmer 4",
      sex: "Female",
      dob: new Date(Date.now() - 2 * 24 * H),
      gestWeeks: 39,
      gestDays: 2,
      birthWeight: 3150,
      currentWeight: 3020,
      deliveryMode: "Vaginal (instrumental)",
      apgar1: 2,
      apgar5: 4,
      bloodGroup: "B+",
      acuity: "critical",
      consultant: "Dr. Sujamariam",
      clinical: {
        resp: {
          mode: "AC / PRVC",
          settings: { fio2: 45, peep: 5, pip: 20, rate: 40, ti: 0.4, map: 10, ino: 10 },
          surfactant: "Not given",
          ettSize: "3.5",
          ettDepth: "9 cm",
          spo2Target: "92–97%",
        },
        fluids: { totalMlKgDay: 60, ivMlKgDay: 60, gir: 5, feedType: "NPO / Nil per oral", tpn: false },
        lines: [
          { name: "Umbilical venous catheter", day: 2 },
          { name: "Arterial line", day: 2 },
          { name: "Cooling mattress", day: 2 },
          { name: "aEEG leads", day: 2 },
        ],
        drugs: [
          { name: "Cefotaxime", day: 2, ofDays: 5 },
          { name: "Amikacin", day: 2, ofDays: 5 },
          { name: "Phenobarbitone", dose: "5 mg/kg BD" },
          { name: "Fentanyl", dose: "1 µg/kg/hr" },
          { name: "Adrenaline", dose: "0.05 µg/kg/min" },
        ],
        labs: { pH: "7.11", BE: "-16", Lactate: "8.2", Creatinine: "1.4", "PT/INR": "1.9", "aEEG / EEG": "moderately abnormal" },
        care: ["Pain assessment (NIPS/PIPP) done", "Cluster care / minimal handling", "Parents counselled today"],
        plan: "Therapeutic hypothermia hour 44/72. Maintain core temp 33.5 °C. Rewarm 0.5 °C/hr from hour 72. MRI brain day 5.",
      },
      problems: [
        ["Neurology", "Perinatal asphyxia"],
        ["Neurology", "HIE Stage II (Sarnat)"],
        ["Neurology", "Therapeutic hypothermia – ongoing"],
        ["Neurology", "Neonatal seizures – clinical"],
        ["Respiratory", "PPHN"],
        ["Renal / GU", "Acute kidney injury"],
        ["Haematology / Bilirubin", "Disseminated intravascular coagulation"],
      ],
      vitals: { hr: 98, rr: 40, spo2: 94, spo2Post: 89, temp: 33.5, sbp: 58, dbp: 34, map: 42, crt: 3, rbs: 88, fio2: 45, painScore: 2, urineMlKgHr: 0.7 },
      tasks: ["Rewarming to start 04:00", "Repeat coagulation profile", "MRI brain booking", "Counsel parents with consultant"],
    },
    {
      uhid: "NIC-24-0905",
      babyName: "Baby of Priya Nair",
      motherName: "Priya Nair",
      bed: "R2 · Incubator 3",
      sex: "Female",
      dob: new Date(Date.now() - 14 * 24 * H),
      gestWeeks: 31,
      gestDays: 0,
      birthWeight: 1320,
      currentWeight: 1415,
      deliveryMode: "LSCS",
      apgar1: 7,
      apgar5: 9,
      bloodGroup: "A+",
      acuity: "guarded",
      consultant: "Dr. Siddhartha",
      clinical: {
        resp: { mode: "Bubble CPAP", settings: { fio2: 25, peep: 5, flow: 6 }, surfactant: "INSURE", spo2Target: "90–95%", silverman: 1 },
        fluids: {
          totalMlKgDay: 160,
          enteralMlKgDay: 140,
          ivMlKgDay: 20,
          gir: 6,
          kcal: 110,
          feedType: "EBM + HMF",
          feedRoute: "Gavage bolus",
          feedFreq: "2 hourly",
          feedVol: 16,
          residual: "minimal, non-bilious",
        },
        lines: [{ name: "Peripheral IV cannula", day: 2, site: "Left hand" }, { name: "OG tube", day: 3 }],
        drugs: [
          { name: "Caffeine citrate", dose: "5 mg/kg OD" },
          { name: "Iron 2–4 mg/kg/day" },
          { name: "Multivitamin drops" },
          { name: "Vitamin D3 400 IU" },
          { name: "Probiotics" },
        ],
        labs: { Hb: "10.1", Platelets: "245", CRP: "<6", TSB: "8.2", "ROP screening": "immature zone II" },
        care: ["Kangaroo mother care given", "Developmentally supportive positioning (nesting)", "Lactation counselling done"],
        plan: "Wean CPAP to room air trial, fortify feeds, ROP re-screen in 2 weeks, target weight gain 15 g/kg/day.",
      },
      problems: [
        ["Growth / Prematurity", "Very low birth weight (1000–1499 g)"],
        ["Respiratory", "Apnoea of prematurity"],
        ["Eye / ENT", "ROP screening – immature retina"],
        ["Haematology / Bilirubin", "Anaemia of prematurity"],
        ["Metabolic / Endocrine", "Metabolic bone disease of prematurity"],
        ["Gastro / Nutrition", "Slow weight gain (<15 g/kg/day)"],
      ],
      vitals: { hr: 148, rr: 46, spo2: 96, temp: 36.8, sbp: 64, dbp: 40, map: 48, crt: 2, rbs: 82, fio2: 25, painScore: 1, urineMlKgHr: 2.6 },
      tasks: ["Trial off CPAP after 2 h", "Increase feeds by 20 ml/kg/day if tolerating", "Repeat ALP & phosphate"],
    },
    {
      uhid: "NIC-24-0921",
      babyName: "Baby of Reena Das",
      motherName: "Reena Das",
      bed: "R2 · Cot 7",
      sex: "Male",
      dob: new Date(Date.now() - 3 * 24 * H),
      gestWeeks: 36,
      gestDays: 3,
      birthWeight: 2280,
      currentWeight: 2190,
      deliveryMode: "Vaginal",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "B+",
      acuity: "guarded",
      consultant: "Dr. Shobi Anandhi",
      clinical: {
        resp: { mode: "Room air", settings: { fio2: 21 }, spo2Target: "90–95%", silverman: 0 },
        fluids: {
          totalMlKgDay: 150,
          enteralMlKgDay: 150,
          feedType: "Direct breastfeeding",
          feedRoute: "Paladai",
          feedFreq: "3 hourly",
          feedVol: 28,
        },
        lines: [],
        drugs: [{ name: "Vitamin K" }, { name: "Multivitamin drops" }],
        labs: { TSB: "17.8", Direct: "0.6", DCT: "positive", "Blood group": "A+ (mother O+)", Hb: "13.4", Retic: "6%" },
        care: ["Phototherapy hours / irradiance", "Parents counselled today", "Mother's own milk expression supported"],
        plan: "Intensive phototherapy, repeat TSB 6 hourly, exchange transfusion blood arranged & cross-matched.",
      },
      problems: [
        ["Haematology / Bilirubin", "ABO incompatibility"],
        ["Haematology / Bilirubin", "Non-haemolytic hyperbilirubinaemia – phototherapy"],
        ["Haematology / Bilirubin", "Exchange transfusion threshold – prepared"],
        ["Growth / Prematurity", "Late preterm (34–36+6 weeks)"],
        ["Gastro / Nutrition", "Oral feeding immaturity / poor suck"],
      ],
      vitals: { hr: 138, rr: 44, spo2: 98, temp: 37.1, sbp: 72, dbp: 45, map: 54, crt: 2, rbs: 76, fio2: 21, urineMlKgHr: 3.1 },
      tasks: ["Serum bilirubin at 8 am", "Keep exchange set ready", "Discharge teaching if TSB falls"],
    },
    {
      uhid: "NIC-24-0899",
      babyName: "Baby of Sunita Yadav",
      motherName: "Sunita Yadav",
      bed: "R3 · Cot 11",
      sex: "Female",
      dob: new Date(Date.now() - 26 * 24 * H),
      gestWeeks: 33,
      gestDays: 5,
      birthWeight: 1680,
      currentWeight: 2085,
      deliveryMode: "LSCS",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "O+",
      acuity: "ready",
      consultant: "Dr. Shobi Anandhi",
      clinical: {
        resp: { mode: "Room air", settings: { fio2: 21 }, spo2Target: "90–95%", silverman: 0 },
        fluids: {
          totalMlKgDay: 180,
          enteralMlKgDay: 180,
          feedType: "Direct breastfeeding",
          feedRoute: "Breast",
          feedFreq: "2–3 hourly on demand",
          feedVol: 45,
        },
        lines: [],
        drugs: [{ name: "Iron 2–4 mg/kg/day" }, { name: "Vitamin D3 400 IU" }, { name: "Multivitamin drops" }],
        labs: { Hb: "11.2", "Hearing OAE": "pass", "ROP screening": "mature retina", "TSH (newborn screen)": "normal" },
        care: ["Kangaroo mother care given", "Family participatory care session", "Immunisation given (BCG / OPV / HepB)"],
        discharge: [
          "Maintaining temperature in open cot 24 h",
          "Weight gain ≥15 g/kg/day for 3 days",
          "Full oral / breast feeds, no tube",
          "Hearing screen done",
          "ROP screening complete / follow up fixed",
          "Immunisation up to date",
        ],
        plan: "Plan discharge tomorrow after consultant round. High-risk follow up in 1 week.",
      },
      problems: [
        ["Growth / Prematurity", "Low birth weight (1500–2499 g)"],
        ["Growth / Prematurity", "Moderate preterm (32–33+6 weeks)"],
        ["Haematology / Bilirubin", "Anaemia of prematurity"],
      ],
      vitals: { hr: 132, rr: 42, spo2: 99, temp: 36.9, sbp: 78, dbp: 48, map: 58, crt: 2, rbs: 84, fio2: 21, urineMlKgHr: 3.4 },
      tasks: ["Book discharge teaching session", "High-risk follow-up appointment", "Final weight & HC"],
    },

    /* ------------------------------------------------------------------
       SAMPLE CASES for the enteral feed plan. IV fluids are entered by hand
       in every case. Each one mirrors a case in scripts/test-feed-plan.ts, all
       at 1.5 kg so the per-feed volumes match. Open the Fluids tab to see the
       plan resolve live.
       ------------------------------------------------------------------ */
    {
      uhid: "SAMPLE-A",
      babyName: "Sample A - increasing, increase given IV today",
      motherName: "Sample A",
      bed: "S1 · Sample bay",
      sex: "Female",
      dob: new Date(Date.now() - 5 * 24 * H),
      gestWeeks: 30,
      gestDays: 2,
      birthWeight: 1380,
      currentWeight: 1500,
      deliveryMode: "NVD",
      apgar1: 7,
      apgar5: 9,
      bloodGroup: "O+",
      acuity: "guarded",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "increasing",
          increaseAppliesTo: "iv-today",
          ivMlKgDay: 20,
          tfiMlKgDay: 150,
          feedIncrementMlKgDay: 20,
          dextrosePct: 10,
          feedType: "Preterm formula",
          feedRoute: "OG tube",
          feedFreq: "3 hourly",
        },
        plan: "Expect enteral 130 + IV 20 ml/kg/d, 24.38 ml x 8 feeds, IV energy 6.8 kcal, total 110.8 kcal/kg/d. Enteral + IV reconciles to the TFI target 150.",
      },
      problems: [["Growth / Prematurity", "Moderate preterm (32–33+6 weeks)"]],
      vitals: { hr: 138, rr: 44, spo2: 96, temp: 36.8, sbp: 62, dbp: 36, map: 45, crt: 2, rbs: 92, fio2: 21, urineMlKgHr: 3 },
      tasks: ["Recheck feed tolerance", "Advance feeds by 20 ml/kg/d tomorrow"],
    },
    {
      uhid: "SAMPLE-B",
      babyName: "Sample B - static feeds with IV fluids entered",
      motherName: "Sample B",
      bed: "S2 · Sample bay",
      sex: "Male",
      dob: new Date(Date.now() - 8 * 24 * H),
      gestWeeks: 32,
      gestDays: 0,
      birthWeight: 1620,
      currentWeight: 1500,
      deliveryMode: "LSCS",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "A+",
      acuity: "guarded",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "static",
          tfiMlKgDay: 150,
          ivMlKgDay: 30,
          dextrosePct: 10,
          feedType: "Preterm formula",
          feedRoute: "OG tube",
          feedFreq: "3 hourly",
        },
        plan: "Expect enteral 150 + IV 30 ml/kg/d, total 180 ml/kg/d, IV energy 10.2 kcal, total 130.2 kcal/kg/d. The plan flags that total fluids exceed the TFI target 150.",
      },
      problems: [["Metabolic / Endocrine", "Neonatal hypoglycaemia"]],
      vitals: { hr: 136, rr: 42, spo2: 97, temp: 36.7, sbp: 66, dbp: 38, map: 47, crt: 2, rbs: 78, fio2: 21, urineMlKgHr: 3.2 },
      tasks: ["Monitor RBS 4 hourly", "Wean IV as feeds tolerated"],
    },
    {
      uhid: "SAMPLE-C",
      babyName: "Sample C - increase is tomorrow's feed target",
      motherName: "Sample C",
      bed: "S3 · Sample bay",
      sex: "Female",
      dob: new Date(Date.now() - 10 * 24 * H),
      gestWeeks: 31,
      gestDays: 4,
      birthWeight: 1450,
      currentWeight: 1500,
      deliveryMode: "NVD",
      apgar1: 7,
      apgar5: 8,
      bloodGroup: "B+",
      acuity: "stable",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "increasing",
          increaseAppliesTo: "tomorrow-target",
          tfiMlKgDay: 150,
          feedIncrementMlKgDay: 20,
          ivMlKgDay: 25,
          dextrosePct: 10,
          feedType: "Preterm formula",
          feedRoute: "OG tube",
          feedFreq: "3 hourly",
        },
        plan: "Expect today enteral 150 + IV 25 ml/kg/d (total 175), next 24 h enteral 170, IV energy 8.5 kcal, total 128.5 kcal/kg/d.",
      },
      problems: [["Growth / Prematurity", "Low birth weight (1500–2499 g)"]],
      vitals: { hr: 134, rr: 40, spo2: 98, temp: 36.9, sbp: 68, dbp: 40, map: 49, crt: 2, rbs: 96, fio2: 21, urineMlKgHr: 3.5 },
      tasks: ["Advance feeds to 170 ml/kg/d tomorrow"],
    },
    {
      uhid: "SAMPLE-D",
      babyName: "Sample D - static feeds, no IV",
      motherName: "Sample D",
      bed: "S4 · Sample bay",
      sex: "Male",
      dob: new Date(Date.now() - 14 * 24 * H),
      gestWeeks: 34,
      gestDays: 1,
      birthWeight: 1900,
      currentWeight: 1500,
      deliveryMode: "NVD",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "O+",
      acuity: "stable",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "static",
          tfiMlKgDay: 160,
          feedType: "Preterm formula",
          feedRoute: "Oral",
          feedFreq: "2 hourly",
        },
        plan: "Expect enteral 160 ml/kg/d, IV 0, 20 ml x 12 feeds, reconciles to TFI 160.",
      },
      problems: [["Growth / Prematurity", "Low birth weight (1500–2499 g)"]],
      vitals: { hr: 130, rr: 38, spo2: 99, temp: 36.8, sbp: 72, dbp: 42, map: 52, crt: 2, rbs: 88, fio2: 21, urineMlKgHr: 3.6 },
      tasks: ["Weight check", "Establish direct breastfeeding"],
    },
    {
      uhid: "SAMPLE-E",
      babyName: "Sample E - guard: total fluids exceed the TFI target",
      motherName: "Sample E",
      bed: "S5 · Sample bay",
      sex: "Female",
      dob: new Date(Date.now() - 6 * 24 * H),
      gestWeeks: 29,
      gestDays: 5,
      birthWeight: 1250,
      currentWeight: 1500,
      deliveryMode: "Emergency LSCS",
      apgar1: 6,
      apgar5: 8,
      bloodGroup: "AB+",
      acuity: "guarded",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "increasing",
          increaseAppliesTo: "iv-today",
          tfiMlKgDay: 150,
          feedIncrementMlKgDay: 20,
          ivMlKgDay: 40,
          dextrosePct: 10,
          feedType: "Preterm formula",
          feedRoute: "OG tube",
          feedFreq: "3 hourly",
        },
        plan: "IV entered is 40 ml/kg/d but the TFI remainder is 20, so total fluids 170 exceed the TFI target 150. The plan flags it and nothing is overwritten.",
      },
      problems: [["Respiratory", "Apnoea of prematurity"]],
      vitals: { hr: 140, rr: 46, spo2: 95, temp: 36.6, sbp: 60, dbp: 34, map: 43, crt: 3, rbs: 82, fio2: 25, urineMlKgHr: 2.8 },
      tasks: ["Clarify IV prescription", "Recheck total fluids against TFI"],
    },
    {
      uhid: "SAMPLE-F",
      babyName: "Sample F - fortified feeds counted in the totals",
      motherName: "Sample F",
      bed: "S6 · Sample bay",
      sex: "Male",
      dob: new Date(Date.now() - 12 * 24 * H),
      gestWeeks: 28,
      gestDays: 3,
      birthWeight: 1050,
      currentWeight: 1500,
      deliveryMode: "Emergency LSCS",
      apgar1: 5,
      apgar5: 8,
      bloodGroup: "O+",
      acuity: "guarded",
      consultant: "Dr. Sample",
      clinical: {
        fluids: {
          feedPlan: "static",
          tfiMlKgDay: 150,
          ivMlKgDay: 30,
          dextrosePct: 10,
          aminoAcid: 3,
          lipid: 2,
          feedType: "Expressed breast milk (EBM)",
          feedRoute: "OG tube",
          feedFreq: "3 hourly",
          fortificationName: "Human milk fortifier",
          fortificationAmount: 4,
          fortificationAmountUnit: "sachet",
          fortificationFeedVolumeMl: 100,
        },
        plan: "4 sachets per 100 ml lift EBM from 0.67 to 0.83 kcal/ml and protein to 2.42 g/dl. Expect milk 100.5 + fortifier 24 = 124.5 enteral kcal, IV 40.2, total 164.7 kcal/kg/d; protein milk 1.65 + fortifier 1.98 + amino acids 3 = 6.63 g/kg/d.",
      },
      problems: [["Growth / Prematurity", "Extremely low birth weight (<1000 g)"]],
      vitals: { hr: 142, rr: 48, spo2: 94, temp: 36.7, sbp: 58, dbp: 32, map: 41, crt: 3, rbs: 90, fio2: 28, urineMlKgHr: 2.9 },
      tasks: ["Check feed tolerance after fortification", "Review calcium and phosphate"],
    },
    /* ------------------------------------------------------------------
       Discharged samples, so the discharge register and the MRD archive are
       demonstrable: two babies left on the same day (day batch export), one
       transfer, and one from the previous month (monthly archive).
       ------------------------------------------------------------------ */
    {
      uhid: "SAMPLE-G",
      babyName: "Sample G - discharged home",
      motherName: "Sample G",
      bed: "",
      sex: "Male",
      dob: new Date(Date.now() - 32 * 24 * H),
      gestWeeks: 31,
      gestDays: 2,
      birthWeight: 1480,
      currentWeight: 2150,
      deliveryMode: "LSCS",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "O+",
      acuity: "ready",
      consultant: "Dr. Sample",
      status: "discharged",
      clinical: {
        fluids: { feedPlan: "static", tfiMlKgDay: 160, ivMlKgDay: 0, feedType: "Direct breast feed", feedRoute: "Direct breastfeeding", feedFreq: "2 hourly" },
        discharge: ["Maintaining temperature in open cot 24 h", "Weight gain \u226515 g/kg/day for 3 days", "Full oral / breast feeds, no tube"],
        dischargeRecord: buildDischargeRecord({
          outcome: "discharged",
          summary: "Stable in open cot, exclusive direct breast feeds, gaining 22 g/kg/day. Review in OPD in 5 days; ROP screening due at 4 weeks.",
          signedBy: "Dr. Sample",
          at: daysAgoAt(2, 10),
          weightAtDischarge: 2150,
          bedAtDischarge: "S7",
          unitAtDischarge: "nicu",
        }),
        plan: "Discharged home after 32 days. Two babies left on this day, so the day batch export covers both.",
      },
      problems: [["Growth / Prematurity", "Prematurity 31 weeks"]],
      vitals: { hr: 138, rr: 42, spo2: 98, temp: 36.8, sbp: 68, dbp: 40, map: 49, crt: 2, rbs: 88, fio2: 21, urineMlKgHr: 3.2 },
      tasks: [],
    },
    {
      uhid: "SAMPLE-H",
      babyName: "Sample H - discharged the same day",
      motherName: "Sample H",
      bed: "",
      sex: "Female",
      dob: new Date(Date.now() - 18 * 24 * H),
      gestWeeks: 34,
      gestDays: 4,
      birthWeight: 1900,
      currentWeight: 2400,
      deliveryMode: "NVD",
      apgar1: 9,
      apgar5: 9,
      bloodGroup: "A+",
      acuity: "ready",
      consultant: "Dr. Sample",
      status: "discharged",
      clinical: {
        fluids: { feedPlan: "static", tfiMlKgDay: 150, ivMlKgDay: 0, feedType: "Expressed breast milk (EBM)", feedRoute: "Direct breastfeeding", feedFreq: "2 hourly" },
        discharge: ["Maintaining temperature in open cot 24 h", "Full oral / breast feeds, no tube", "Newborn screening completed"],
        dischargeRecord: buildDischargeRecord({
          outcome: "discharged",
          summary: "Feeding well orally, afebrile for 72 h, jaundice resolved. Newborn screening sent. Follow up in 1 week.",
          signedBy: "Dr. Sample",
          at: daysAgoAt(2, 15),
          weightAtDischarge: 2400,
          bedAtDischarge: "S8",
          unitAtDischarge: "nicu",
        }),
        plan: "Discharged on the same day as Sample G, so both appear in one day batch and one monthly archive.",
      },
      problems: [["Jaundice", "Neonatal jaundice - resolved"]],
      vitals: { hr: 136, rr: 40, spo2: 99, temp: 36.9, sbp: 72, dbp: 44, map: 53, crt: 2, rbs: 92, fio2: 21, urineMlKgHr: 3.4 },
      tasks: [],
    },
    {
      uhid: "SAMPLE-I",
      babyName: "Sample I - transferred out",
      motherName: "Sample I",
      bed: "",
      sex: "Male",
      dob: new Date(Date.now() - 9 * 24 * H),
      gestWeeks: 27,
      gestDays: 1,
      birthWeight: 950,
      currentWeight: 1080,
      deliveryMode: "Emergency LSCS",
      apgar1: 4,
      apgar5: 6,
      bloodGroup: "B+",
      acuity: "critical",
      consultant: "Dr. Sample",
      status: "transferred",
      clinical: {
        fluids: { feedPlan: "increasing", increaseAppliesTo: "iv-today", tfiMlKgDay: 140, feedIncrementMlKgDay: 15, ivMlKgDay: 120, dextrosePct: 10, aminoAcid: 2.5, lipid: 1, feedType: "Trophic feeds", feedRoute: "OG tube", feedFreq: "2 hourly" },
        dischargeRecord: buildDischargeRecord({
          outcome: "transferred",
          summary: "Transferred to a tertiary centre with paediatric surgery for necrotising enterocolitis. Ventilated, on inotropes. Accepted by Dr. Raman; ambulance with neonatal transport team.",
          signedBy: "Dr. Sethi (SR)",
          at: daysAgoAt(5, 21),
          weightAtDischarge: 1080,
          bedAtDischarge: "S9",
          unitAtDischarge: "nicu",
        }),
        plan: "Transferred, not discharged home. The archive keeps it with the same retention rules and flags the outcome.",
      },
      problems: [["Gastrointestinal", "Necrotising enterocolitis"]],
      vitals: { hr: 155, rr: 62, spo2: 91, temp: 36.4, sbp: 42, dbp: 24, map: 30, crt: 4, rbs: 74, fio2: 60, urineMlKgHr: 1.6 },
      tasks: [],
    },
    {
      uhid: "SAMPLE-J",
      babyName: "Sample J - discharged last month",
      motherName: "Sample J",
      bed: "",
      sex: "Female",
      dob: new Date(lastMonthDay(5).getTime() - 41 * 24 * H),
      gestWeeks: 32,
      gestDays: 0,
      birthWeight: 1620,
      currentWeight: 2600,
      deliveryMode: "LSCS",
      apgar1: 8,
      apgar5: 9,
      bloodGroup: "O-",
      acuity: "ready",
      consultant: "Dr. Sample",
      status: "discharged",
      clinical: {
        fluids: { feedPlan: "static", tfiMlKgDay: 160, ivMlKgDay: 0, feedType: "Direct breast feed", feedRoute: "Direct breastfeeding", feedFreq: "2 hourly" },
        dischargeRecord: buildDischargeRecord({
          outcome: "discharged",
          summary: "Discharged in the previous calendar month, so this record lands in a separate monthly archive from the others.",
          signedBy: "Dr. Sample",
          at: lastMonthDay(5),
          weightAtDischarge: 2600,
          bedAtDischarge: "S10",
          unitAtDischarge: "nicu",
        }),
        plan: "Filed under the previous month to prove the monthly consolidation groups correctly.",
      },
      problems: [["Respiratory", "RDS - resolved"]],
      vitals: { hr: 134, rr: 40, spo2: 98, temp: 36.8, sbp: 74, dbp: 46, map: 55, crt: 2, rbs: 90, fio2: 21, urineMlKgHr: 3.5 },
      tasks: [],
    },
  ];

  const growthSeries = (birth: number, current: number, points: number, dob: Date) => {
    const out: { at: string; weight: number; hc?: number; length?: number; note?: string }[] = [];
    const ageDays = Math.max(1, (Date.now() - dob.getTime()) / 86400000);
    for (let i = 1; i <= points; i++) {
      const t = i / points;
      // physiological dip around day 3–5 then climb back
      const dip = i === 1 ? -0.06 : i === 2 ? -0.09 : i === 3 ? -0.05 : 0;
      const base = birth + (current - birth) * t;
      const w = Math.round(base * (1 + dip));
      out.push({
        at: new Date(dob.getTime() + (ageDays * t * 86400000)).toISOString(),
        weight: w,
        hc: i === points ? undefined : Math.round((24 + t * 4) * 2) / 2,
        length: i === points ? undefined : Math.round((44 + t * 5) * 2) / 2,
        note: i === 2 ? "nadir, oedema resolved" : i === points ? "latest daily weight" : "",
      });
    }
    return out;
  };

  type SeedClinical = Record<string, unknown>;
  for (const b of seedBabies as (Omit<(typeof seedBabies)[number], "clinical"> & {
    clinical: SeedClinical;
  })[]) {
    const { problems: probs, vitals: v, tasks: tk, ...rest } = b;
    const growth = growthSeries(
      rest.birthWeight,
      rest.currentWeight,
      Math.max(3, Math.min(10, Math.round((Date.now() - rest.dob.getTime()) / (2 * 24 * H)))),
      rest.dob,
    );
    rest.clinical = { ...rest.clinical, growth };
    const [row] = await db.insert(babies).values(rest).returning();
    if (probs.length) {
      await db
        .insert(problems)
        .values(probs.map(([system, label]) => ({ babyId: row.id, system, label })));
    }
    for (let i = 0; i < 5; i++) {
      await db.insert(vitals).values({
        babyId: row.id,
        recordedAt: new Date(Date.now() - i * 2 * H),
        recordedBy: i % 2 ? "SN Kavita" : "SN Rekha",
        ...v,
        hr: (v.hr ?? 140) + (i % 3) * 4 - 4,
        spo2: Math.min(100, (v.spo2 ?? 95) + (i % 2)),
      });
    }
    // A discharged baby has no open tasks, and drizzle rejects values([]).
    if (tk.length) {
      await db.insert(tasks).values(tk.map((t) => ({ babyId: row.id, text: t, priority: "today" })));
    }
    await db.insert(events).values([
      { babyId: row.id, kind: "admission", text: `Admitted · ${row.gestWeeks}+${row.gestDays} wk · ${row.birthWeight} g`, author: "Admitting team", at: row.dob },
      { babyId: row.id, kind: "round", text: "Consultant round completed, plan updated", author: rest.consultant },
    ]);
    await db.insert(handovers).values({
      babyId: row.id,
      shift: "Night (8–8)",
      fromStaff: "Dr. Sethi (SR)",
      toStaff: "Dr. Kapoor (SR)",
      illness: rest.acuity,
      summary: String(rest.clinical.plan ?? ""),
      actions: tk,
      contingency: ["If desaturation → check ETT position, suction, increase FiO₂ 10%, inform SR"],
      synthesis: "Handover completed at bedside with nurse in charge.",
      snapshot: { resp: rest.clinical.resp, fluids: rest.clinical.fluids },
    });
  }

  // One representative patient per remaining unit so every board is populated.
  type ExtraSeed = {
    unit: string;
    subspecialty?: string;
    motherName: string;
    bed: string;
    sex: string;
    gestWeeks: number;
    birthWeight: number;
    currentWeight: number;
    acuity: string;
    consultant: string;
    insurance?: string;
    insuranceName?: string;
    deliveryMode?: string;
    bloodGroup?: string;
    motherBloodGroup?: string;
    clinical?: Record<string, unknown>;
  };
  const extra: ExtraSeed[] = [
    {
      unit: "picu",
      subspecialty: "cvicu",
      motherName: "Karthik R",
      bed: "PICU 1",
      sex: "Male",
      gestWeeks: 6,
      birthWeight: 19000,
      currentWeight: 18500,
      acuity: "critical",
      consultant: "Dr. Sujamariam",
      insurance: "Insurance",
      insuranceName: "Star Health",
      clinical: { resp: { mode: "SIMV + PS", settings: { fio2: 45, peep: 6, pip: 22, rate: 24 } } },
    },
    {
      unit: "stepdown",
      subspecialty: "licu",
      motherName: "Meena S",
      bed: "SD 2",
      sex: "Female",
      gestWeeks: 10,
      birthWeight: 28000,
      currentWeight: 27200,
      acuity: "guarded",
      consultant: "Dr. Shobi Anandhi",
      insurance: "Scheme (Govt / CMCHIS)",
    },
    {
      unit: "postnatal",
      motherName: "Deepa Rani",
      bed: "DELUXE B",
      sex: "Female",
      gestWeeks: 39,
      birthWeight: 2950,
      currentWeight: 2880,
      acuity: "stable",
      consultant: "Dr. Devaprasath",
      insurance: "Self-pay / cash",
      deliveryMode: "LSCS",
      motherBloodGroup: "O−",
      bloodGroup: "B+",
    },
    {
      unit: "paeds",
      motherName: "Arjun K",
      bed: "SPECIAL A",
      sex: "Male",
      gestWeeks: 8,
      birthWeight: 24000,
      currentWeight: 23400,
      acuity: "guarded",
      consultant: "Dr. Indira Devi",
      insurance: "Corporate / TPA",
    },
  ];
  for (const e of extra) {
    const [row] = await db
      .insert(babies)
      .values({
        uhid: `NIC-${Date.now().toString().slice(-6)}-${e.unit}`,
        babyName: `Baby of ${e.motherName}`,
        motherName: e.motherName ?? "",
        bed: e.bed ?? "",
        unit: e.unit,
        subspecialty: e.subspecialty ?? "",
        sex: e.sex ?? "Male",
        gestWeeks: e.gestWeeks ?? 37,
        gestDays: 0,
        birthWeight: e.birthWeight ?? 2500,
        currentWeight: e.currentWeight ?? e.birthWeight ?? 2500,
        deliveryMode: e.deliveryMode ?? "LSCS",
        apgar1: 8,
        apgar5: 9,
        bloodGroup: e.bloodGroup ?? "Unknown",
        motherBloodGroup: e.motherBloodGroup ?? "Unknown",
        inborn: true,
        acuity: e.acuity ?? "stable",
        consultant: e.consultant ?? "",
        insurance: e.insurance ?? "",
        insuranceName: e.insuranceName ?? "",
        clinical: (e.clinical as Record<string, unknown>) ?? {},
      })
      .returning();
    await db.insert(events).values({
      babyId: row.id,
      kind: "admission",
      text: `Admitted to ${e.unit.toUpperCase()}`,
      author: "Admitting team",
    });
    // Initial observation set with a complete BP so every tile shows sbp/dbp (map).
    const vitByUnit: Record<
      string,
      { hr: number; rr: number; spo2: number; temp: number; sbp: number; dbp: number; map: number; crt: number; rbs: number }
    > = {
      picu: { hr: 128, rr: 26, spo2: 95, temp: 37.4, sbp: 86, dbp: 52, map: 63, crt: 2, rbs: 112 },
      stepdown: { hr: 110, rr: 22, spo2: 97, temp: 37.8, sbp: 96, dbp: 58, map: 71, crt: 2, rbs: 98 },
      postnatal: { hr: 136, rr: 42, spo2: 98, temp: 37.0, sbp: 74, dbp: 46, map: 55, crt: 2, rbs: 88 },
      paeds: { hr: 118, rr: 30, spo2: 96, temp: 38.4, sbp: 92, dbp: 55, map: 67, crt: 2, rbs: 104 },
    };
    const vv = vitByUnit[e.unit];
    if (vv) {
      await db.insert(vitals).values({ babyId: row.id, recordedBy: "Admitting nurse", ...vv });
    }
  }

  return NextResponse.json({ ok: true, count: seedBabies.length + extra.length });
}
