"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Chip,
  ChipGroup,
  DialWithOther,
  NumField,
  Section,
  Stepper,
  TopBar,
  api,
  useLocked,
  useUser,
} from "@/components/ui";
import { UnitBedDial, SubSpecialtyPicker, UnitSwitcher } from "@/components/unit-ui";
import { WeightInput } from "@/components/weight-input";
import { AdmissionTriage } from "@/components/triage";
type TriageState = {
  scale: string;
  band: string;
  score: number;
  label: string;
  advice: string;
  appliedAt: string;
};
import { PROBLEM_CATALOG, RESP_MODES, SYSTEMS, type SystemKey } from "@/lib/catalog";
import { UNITS, UNIT_LIST, defaultBed, unitOf, type UnitKey } from "@/lib/units";
import { systemOfDiagnosis, systemsForUnit, UNIT_CATALOGS } from "@/lib/units-catalog";
import { fentonBand } from "@/lib/interpret";

const ANTENATAL = [
  "Antenatal steroids complete",
  "Antenatal steroids incomplete",
  "PROM > 18 h",
  "Maternal fever / chorioamnionitis",
  "Foul smelling liquor",
  "Meconium stained liquor",
  "Gestational diabetes",
  "Pre-eclampsia / PIH",
  "Oligohydramnios",
  "Polyhydramnios",
  "Abnormal Dopplers / IUGR",
  "Multiple gestation",
  "Rh negative mother",
  "Maternal hypothyroidism",
  "Maternal anaemia",
  "GBS positive",
  "HBsAg / HIV / VDRL reactive",
  "MgSO₄ for neuroprotection",
  "Delayed cord clamping",
  "No antenatal risk factor",
];

const DELIVERY = ["Vaginal", "Vaginal (instrumental)", "LSCS", "Emergency LSCS", "Breech", "Home / transit delivery"];
const RESUS = [
  "No resuscitation needed",
  "Initial steps only",
  "CPAP in delivery room",
  "PPV given",
  "Intubation",
  "Chest compressions",
  "Adrenaline given",
  "Delayed cord clamping",
];

const CONSULTANTS = [
  "Dr. Siddhartha",
  "Dr. Sujamariam",
  "Dr. Shobi Anandhi",
  "Dr. Devaprasath",
  "Dr. Indira Devi",
  "Dr. Krishna Sameera",
];

const INSURANCE_TYPES = ["Self-pay / cash", "Insurance", "Scheme (Govt / CMCHIS)", "Corporate / TPA"];

/** Postnatal ward — immediate maternal/baby care options (no NRP terms). */
const POSTNATAL_CARE = [
  "Skin-to-skin contact started",
  "Breastfeeding initiated within 1 h",
  "Vitamin K given to baby",
  "Baby observed in warmer",
  "Mother on IV antibiotics",
  "Mother on analgesia",
  "Catheter in situ",
  "Anti-D given (Rh negative)",
  "MgSO₄ continued",
  "Blood transfusion given",
  "Lactation support provided",
  "No intervention needed",
];

/** Postnatal baby oxygen options (not ventilator modes). */
const BABY_O2 = [
  "Room air",
  "Nasal prongs O₂",
  "Oxygen by hood",
  "Phototherapy",
  "Under warmer",
];

/** Paediatric ward — admission sources. */
const PAEDS_SOURCE = [
  "OPD referral",
  "Emergency room",
  "Transferred from PICU",
  "Transferred from other hospital",
  "Post-operative ward transfer",
  "Direct admission",
];

/** ICU (PICU / step-down) admission sources. */
const ICU_SOURCE = [
  "Emergency room",
  "Transferred from ward",
  "Post-operative from OT",
  "Transferred from other hospital",
  "Transferred from PICU (step-down)",
  "Cardiac cath lab",
];

/** ICU immediate care at arrival. */
const ICU_IMMEDIATE = [
  "Intubated & ventilated on arrival",
  "NIV / CPAP started",
  "High flow oxygen started",
  "Inotropes started",
  "Central line secured",
  "Arterial line secured",
  "Chest drain inserted",
  "Blood transfusion given",
  "Dialysis / CRRT started",
  "Sedation & analgesia infusion",
  "No immediate intervention",
];

function AdmitForm() {
  const r = useRouter();
  const search = useSearchParams();
  const { name } = useUser();

  const [unit, setUnit] = useState<UnitKey>(() => {
    const u = (search?.get("unit") ?? "nicu") as UnitKey;
    return u in UNITS ? u : "nicu";
  });
  const [f, setF] = useState({
    motherName: "",
    uhid: "",
    bed: defaultBed("nicu"),
    sex: "Male",
    gestWeeks: 34,
    gestDays: 0,
    birthWeight: 0,
    deliveryMode: "LSCS",
    apgar1: 8,
    apgar5: 9,
    birthLength: 0,
    birthHc: 0,
    bloodGroup: "Unknown",
    motherBloodGroup: "Unknown",
    triage: null as TriageState | null,
    inborn: true,
    acuity: "stable",
    consultant: "",
    isolation: "none",
    careLevel: "Level III B",
    subspecialty: "picu",
    insurance: "",
    insuranceName: "",
  });
  const [antenatal, setAntenatal] = useState<string[]>([]);
  const [resus, setResus] = useState<string[]>([]);
  const [dx, setDx] = useState<string[]>([]);
  const [sys, setSys] = useState<string>("Respiratory");
  const [mode, setMode] = useState("Room air");
  const [busy, setBusy] = useState(false);
  const locked = useLocked();

  const u = unitOf(unit);
  const systems = useMemo(() => systemsForUnit(unit), [unit]);
  useEffect(() => {
    if (!systems.includes(sys)) setSys(systems[0]);
  }, [systems, sys]);
  useEffect(() => {
    if (!unitOf(unit).bedZones.some((z) => z.beds.includes(f.bed))) {
      setF((p) => ({ ...p, bed: defaultBed(unit) }));
    }
  }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const isNeo = unit === "nicu" || unit === "postnatal";
  /** NICU enters grams; every other unit enters kilograms and stores grams. */
  const useKg = unit !== "nicu";
  const toGrams = (v: number) => (useKg ? Math.max(0, Math.round(v * 1000)) : Math.max(0, Math.round(v)));
  const catalog = UNIT_CATALOGS[unit] ?? {};

  const submit = async () => {
    const grams = toGrams(f.birthWeight);
    if (unit === "nicu" && (grams < 300 || grams > 6000)) return;
    if (useKg && grams <= 0) return;
    setBusy(true);
    const problems = dx.map((label) => ({
      system: systemOfDiagnosis(unit, label),
      label,
    }));
    const payload: Record<string, unknown> = {
      motherName: f.motherName,
      uhid: f.uhid,
      bed: f.bed,
      unit,
      subspecialty: unit === "picu" || unit === "stepdown" ? f.subspecialty : "",
      sex: f.sex,
      gestWeeks: f.gestWeeks,
      gestDays: f.gestDays,
      birthWeight: grams,
      currentWeight: grams,
      birthLength: unit === "nicu" || unit === "postnatal" ? Number(f.birthLength) || 0 : 0,
      birthHc: unit === "nicu" || unit === "postnatal" ? Number(f.birthHc) || 0 : 0,
      deliveryMode: f.deliveryMode,
      apgar1: f.apgar1,
      apgar5: f.apgar5,
      bloodGroup: f.bloodGroup,
      motherBloodGroup:
        unit === "nicu" || unit === "postnatal" ? f.motherBloodGroup : "Unknown",
      inborn: f.inborn,
      acuity: f.acuity,
      consultant: f.consultant,
      isolation: f.isolation,
      insurance: f.insurance,
      insuranceName: f.insuranceName,
      author: name,
      problems,
      babyName:
        unit === "postnatal"
          ? `${f.motherName || "Mother"} & baby`
          : unit === "paeds"
            ? `Master/Baby ${f.motherName || "Unknown"}`
            : `Baby of ${f.motherName || "Unknown"}`,
      clinical: {
        careLevel: f.careLevel,
        antenatal: [...antenatal, ...resus],
        resp: { mode, settings: { fio2: mode === "Room air" ? 21 : 30, peep: 5 }, spo2Target: "90–95%" },
        fluids: unit === "nicu"
          ? { totalMlKgDay: f.gestWeeks < 32 ? 90 : 60, gir: 6, feedType: "Trophic feeds" }
          : { totalMlKgDay: 0, gir: 0, feedType: "—" },
        lines: [],
        drugs: unit === "nicu" ? [{ name: "Vitamin K" }] : [],
        care: [],
        triage: f.triage ?? undefined,
      },
    };
    const res = (await api("/api/babies", "POST", payload)) as { baby?: { id?: number } } | undefined;
    if (res?.baby?.id) r.push(`/baby/${res.baby.id}`);
    else setBusy(false);
  };

  const weightInvalid = unit === "nicu" ? f.birthWeight < 300 || f.birthWeight > 6000 : toGrams(f.birthWeight) <= 0;

  return (
    <main className="min-h-screen pb-24">
      <TopBar />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <h1 className="mb-1 text-xl font-black text-white">New admission — {u.short}</h1>
        <p className="mb-3 text-xs text-slate-400">
          {u.emoji} {u.name} · pick the ward, bed and diagnoses. Everything else is tap-first.
        </p>

        <div className="card mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="lbl">Admitting to</span>
            <UnitSwitcher
              active={unit}
              onChange={(x) => {
                setUnit(x as UnitKey);
                setDx([]);
                setF((p) => ({ ...p, bed: defaultBed(x as UnitKey) }));
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Identification">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="lbl mb-1">{unit === "postnatal" ? "Mother's name" : "Patient / mother's name"}</div>
                <input className="inp" value={f.motherName} onChange={(e) => set("motherName")(e.target.value)} placeholder="e.g. Anjali Sharma" />
              </div>
              <div>
                <div className="lbl mb-1">UHID (blank = auto)</div>
                <input className="inp" value={f.uhid} onChange={(e) => set("uhid")(e.target.value)} placeholder="auto" />
              </div>
            </div>
            <div className="lbl mt-3 mb-1">Sex</div>
            <ChipGroup options={["Male", "Female", "Ambiguous"]} value={f.sex} onChange={(v: string) => v && set("sex")(v)} />
            <div className="lbl mt-3 mb-1">Bed selection — {u.short}</div>
            <UnitBedDial unit={unit} value={f.bed} onChange={(v) => set("bed")(v)} />

            {(unit === "picu" || unit === "stepdown") && (
              <>
                <div className="lbl mt-3 mb-1">Sub-specialty ICU (occasional admissions)</div>
                <SubSpecialtyPicker unit={unit} value={f.subspecialty} onChange={(v) => set("subspecialty")(v)} />
                <p className="mt-1 text-[10px] text-slate-400">
                  CCU · CVICU · LICU cases are tagged so the PICU team and the specialist team both see the handover.
                </p>
              </>
            )}

            <div className="lbl mt-3 mb-1">Care level</div>
            <ChipGroup options={u.levels} value={f.careLevel} onChange={(v: string) => v && set("careLevel")(v)} />
            {unit === "nicu" && (
              <>
                <div className="lbl mt-3 mb-1">Inborn / outborn</div>
                <ChipGroup options={["Inborn", "Outborn"]} value={f.inborn ? "Inborn" : "Outborn"} onChange={(v: string) => set("inborn")(v === "Inborn")} />
              </>
            )}
            <div className="lbl mt-3 mb-1">
              {unit === "postnatal" ? "Baby blood group" : "Blood group"}
            </div>
            <DialWithOther
              options={["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−", "Unknown"]}
              value={f.bloodGroup}
              onChange={(v: string) => v && set("bloodGroup")(v)}
              otherPlaceholder="Other blood group…"
            />

            {(unit === "nicu" || unit === "postnatal") && (
              <>
                <div className="lbl mt-3 mb-1">Mother&apos;s blood group</div>
                <DialWithOther
                  options={["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−", "Unknown"]}
                  value={f.motherBloodGroup}
                  onChange={(v: string) => v && set("motherBloodGroup")(v)}
                  otherPlaceholder="Mother's blood group…"
                />
                {f.bloodGroup !== "Unknown" &&
                  f.motherBloodGroup !== "Unknown" &&
                  (() => {
                    const mother = f.motherBloodGroup;
                    const baby = f.bloodGroup;
                    const rhRisk = mother.endsWith("−") && baby.endsWith("+");
                    const aboRisk =
                      mother.startsWith("O") &&
                      (baby.startsWith("A") || baby.startsWith("B") || baby.startsWith("AB"));
                    if (!rhRisk && !aboRisk) return null;
                    return (
                      <p className="mt-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                        ⚠ {rhRisk ? "Rh iso-immunisation risk" : ""}
                        {rhRisk && aboRisk ? " · " : ""}
                        {aboRisk ? "ABO incompatibility risk" : ""} — send DCT / TSB, plan phototherapy readiness.
                      </p>
                    );
                  })()}
              </>
            )}
            <div className="lbl mt-3 mb-1">Isolation</div>
            <DialWithOther options={["none", "contact", "droplet", "protective", "airborne"]} value={f.isolation} onChange={(v: string) => v && set("isolation")(v)} tone="rose" otherPlaceholder="Other precaution…" />

            <div className="lbl mt-3 mb-1">Insurance / billing</div>
            <DialWithOther
              options={INSURANCE_TYPES}
              value={f.insurance}
              onChange={(v: string) => set("insurance")(v)}
              otherPlaceholder="Other payer…"
            />
            {f.insurance === "Insurance" || f.insurance === "Scheme" || (f.insuranceName && f.insurance !== "Self-pay / cash") ? (
              <div className="mt-2">
                <div className="lbl mb-1">Insurer / scheme name</div>
                <input
                  className="inp"
                  value={f.insuranceName}
                  onChange={(e) => set("insuranceName")(e.target.value)}
                  placeholder="e.g. Star Health, Star Kids, CMCHIS…"
                />
              </div>
            ) : null}

            <div className="lbl mt-3 mb-1">Primary Consultant</div>
            <DialWithOther options={CONSULTANTS} value={f.consultant} onChange={(v: string) => set("consultant")(v)} otherPlaceholder="Type a consultant name…" />
          </Section>

          <Section
            title={
              unit === "postnatal"
                ? "Obstetric details"
                : unit === "nicu"
                  ? "Birth details"
                  : "Age & admission vitals"
            }
          >
            {/* ---------- NICU: true newborn fields ---------- */}
            {unit === "nicu" && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <Stepper label="Gestation weeks" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={22} max={43} />
                  <Stepper label="Gestation days" value={f.gestDays} onChange={(n) => set("gestDays")(n)} min={0} max={6} />
                  <WeightInput
                    label="Birth weight"
                    valueGrams={f.birthWeight}
                    onChangeGrams={(g) => set("birthWeight")(g)}
                    neonatal
                  />
                  <Stepper label="Apgar 1 min" value={f.apgar1} onChange={(n) => set("apgar1")(n)} min={0} max={10} />
                  <Stepper label="Apgar 5 min" value={f.apgar5} onChange={(n) => set("apgar5")(n)} min={0} max={10} />
                  <NumField label="Birth length (cm)" value={f.birthLength} onChange={(n) => set("birthLength")(n)} min={20} max={70} step={0.5} decimals={1} placeholder="—" />
                  <NumField label="Head circ. (cm)" value={f.birthHc} onChange={(n) => set("birthHc")(n)} min={18} max={50} step={0.5} decimals={1} placeholder="—" />
                </div>
                {(() => {
                  const band = fentonBand(f.gestWeeks, f.birthWeight);
                  if (!band || !f.birthWeight) return null;
                  const tone =
                    band === "SGA"
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                      : band === "LGA"
                        ? "border-violet-400/40 bg-violet-400/10 text-violet-200"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
                  return (
                    <p className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold ${tone}`}>
                      Fenton (approx): {band} for {f.gestWeeks} wk · monitor {band === "SGA" ? "glucose & growth" : band === "LGA" ? "glucose (IDM)" : "routine growth"}
                    </p>
                  );
                })()}
                <div className="lbl mt-3 mb-1">Mode of delivery</div>
                <DialWithOther options={DELIVERY} value={f.deliveryMode} onChange={(v: string) => v && set("deliveryMode")(v)} otherPlaceholder="Other delivery mode…" />
                <div className="lbl mt-3 mb-1">Delivery room resuscitation (NRP)</div>
                <DialWithOther options={RESUS} value={resus} onChange={(v: string[]) => setResus(v)} multi tone="amber" otherPlaceholder="Add other resuscitation step…" />
                <div className="lbl mt-3 mb-1">Initial respiratory support</div>
                <DialWithOther options={RESP_MODES.slice(0, 9)} value={mode} onChange={(v: string) => v && setMode(v)} otherPlaceholder="Other support mode…" />
              </>
            )}

            {/* ---------- POSTNATAL: obstetric fields, no gestation/apgar ---------- */}
            {unit === "postnatal" && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <Stepper label="Baby gestation (wk)" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={28} max={43} />
                  <WeightInput
                    label="Baby birth weight"
                    valueGrams={f.birthWeight}
                    onChangeGrams={(g) => set("birthWeight")(g)}
                    neonatal
                  />
                  <Stepper label="Postnatal day" value={f.apgar1} onChange={(n) => set("apgar1")(n)} min={0} max={10} />
                  <NumField label="Birth length (cm)" value={f.birthLength} onChange={(n) => set("birthLength")(n)} min={20} max={70} step={0.5} decimals={1} placeholder="—" />
                  <NumField label="Head circ. (cm)" value={f.birthHc} onChange={(n) => set("birthHc")(n)} min={18} max={50} step={0.5} decimals={1} placeholder="—" />
                </div>
                <div className="lbl mt-3 mb-1">Delivery / procedure</div>
                <DialWithOther options={DELIVERY} value={f.deliveryMode} onChange={(v: string) => v && set("deliveryMode")(v)} otherPlaceholder="Other procedure…" />
                <div className="lbl mt-3 mb-1">Immediate care / intervention</div>
                <DialWithOther options={POSTNATAL_CARE} value={resus} onChange={(v: string[]) => setResus(v)} multi tone="amber" otherPlaceholder="Add other intervention…" />
                <div className="lbl mt-3 mb-1">Baby oxygen requirement</div>
                <DialWithOther options={BABY_O2} value={mode} onChange={(v: string) => v && setMode(v)} otherPlaceholder="Other requirement…" />
              </>
            )}

            {/* ---------- PICU / STEPDOWN / PAEDS: paediatric fields ---------- */}
            {(unit === "picu" || unit === "stepdown" || unit === "paeds") && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <Stepper label="Age (years)" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={0} max={18} />
                  <WeightInput
                    label="Weight (kg)"
                    valueGrams={f.birthWeight}
                    onChangeGrams={(g) => set("birthWeight")(g)}
                    neonatal={false}
                  />
                  <NumField
                    label={unit === "paeds" ? "Height / length (cm)" : "Height (cm)"}
                    value={f.birthLength}
                    onChange={(n) => set("birthLength")(n)}
                    min={40}
                    max={200}
                    step={0.5}
                    decimals={1}
                    placeholder="cm"
                  />
                  <NumField
                    label="Head circumference (cm)"
                    value={f.birthHc}
                    onChange={(n) => set("birthHc")(n)}
                    min={25}
                    max={60}
                    step={0.5}
                    decimals={1}
                    placeholder="cm"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  Measure length/height supine (under 2 y) or standing. HC to nearest 0.5 cm — recheck if crossing 2 centile lines between visits.
                </p>
                <div className="lbl mt-3 mb-1">Source / reason for admission</div>
                <DialWithOther
                  options={unit === "paeds" ? PAEDS_SOURCE : ICU_SOURCE}
                  value={f.deliveryMode}
                  onChange={(v: string) => v && set("deliveryMode")(v)}
                  otherPlaceholder="Other source…"
                />
                <div className="lbl mt-3 mb-1">Immediate care at arrival</div>
                <DialWithOther options={ICU_IMMEDIATE} value={resus} onChange={(v: string[]) => setResus(v)} multi tone="amber" otherPlaceholder="Add other intervention…" />
                <div className="lbl mt-3 mb-1">Respiratory support at admission</div>
                <DialWithOther options={RESP_MODES} value={mode} onChange={(v: string) => v && setMode(v)} otherPlaceholder="Other mode…" />
              </>
            )}

            <div className="lbl mt-3 mb-1">Illness severity at admission</div>
            <ChipGroup options={["stable", "guarded", "critical"]} value={f.acuity} onChange={(v: string) => v && set("acuity")(v)} tone="rose" />

            <div className="mt-3">
              <AdmissionTriage
                unit={unit}
                onApply={(r) => {
                  setF((p) => ({
                    ...p,
                    acuity: r.suggestedAcuity,
                    triage: {
                      scale: r.scale,
                      band: r.band,
                      score: r.score,
                      label: r.label,
                      advice: r.advice,
                      appliedAt: new Date().toISOString(),
                    },
                  }));
                }}
              />
              {f.triage?.label && (
                <p className="mt-1 text-[10px] text-slate-400">
                  ✓ Triage applied: <b className="text-white">{f.triage.label}</b> ({f.triage.scale}) —{" "}
                  {f.triage.advice}
                </p>
              )}
            </div>
          </Section>

          {isNeo && (
            <Section title="Antenatal & perinatal risk factors">
              <DialWithOther options={ANTENATAL} value={antenatal} onChange={(v: string[]) => setAntenatal(v)} multi tone="amber" otherPlaceholder="Add other risk factor…" />
            </Section>
          )}

          <Section
            title={`Admission diagnoses — ${u.short}`}
            sub="Core multi-select · pick many systems · selections aggregate and are saved on admit"
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {systems.map((s) => {
                const count = (catalog[s] ?? []).filter((label) => dx.includes(label)).length;
                return (
                  <Chip
                    key={s}
                    label={count ? `${s} (${count})` : s}
                    on={sys === s}
                    onClick={() => setSys(s)}
                  />
                );
              })}
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-white/10 p-2">
              <DialWithOther
                options={(catalog[sys] ?? []) as unknown as string[]}
                value={dx}
                onChange={(v: string[]) => setDx(v)}
                multi
                tone="rose"
                otherPlaceholder="Add custom diagnosis / multi-system co-morbidity…"
                showSelected={false}
              />
            </div>
            {dx.length > 0 && (
              <div className="mt-3 rounded-xl border border-violet-400/30 bg-violet-400/10 p-2">
                <div className="lbl mb-1">Aggregated for admit ({dx.length})</div>
                <div className="flex flex-wrap gap-1">
                  {dx.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] text-rose-200"
                      onClick={() => setDx((prev) => prev.filter((x) => x !== d))}
                      title="Remove"
                    >
                      ✓ {d} · {systemOfDiagnosis(unit, d)} ✕
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={submit} disabled={busy || weightInvalid || locked}>
            {locked ? "🔒 Sign in to admit" : busy ? "Admitting…" : `Admit to ${u.short}`}
          </button>
          <span className="text-xs text-slate-400">
            {locked
              ? "View-only — type your name in “Signed as” (top bar) to enable admitting."
              : weightInvalid
                ? "Enter measured birth weight to continue"
                : `${dx.length} diagnoses · ${antenatal.length + resus.length} risk factors`}
          </span>
        </div>
      </div>
    </main>
  );
}

export default function AdmitPage() {
  return (
    <>
      <Suspense fallback={<main className="min-h-screen"><TopBar /><div className="p-10 text-center text-slate-400">Loading admission form…</div></main>}>
        <AdmitForm />
      </Suspense>
    </>
  );
}
