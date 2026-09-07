"use client";

import {
  Activity,
  AlertOctagon,
  Brain,
  HeartPulse,
  ShieldCheck,
  Thermometer,
  Wind,
} from "lucide-react";
import { useMemo, useState } from "react";

export type PediatricTriageResult = {
  scale: string;
  band: "green" | "yellow" | "orange" | "red";
  score: number;
  label: string;
  advice: string;
  suggestedAcuity: "stable" | "guarded" | "critical";
};

const INITIAL = ["Stable", "Unstable — not life-threatening", "Unstable — life-threatening"];
const AIRWAY = ["Open & stable", "Open but unstable", "Obstructed"];
const WORK = ["Normal", "Increased", "Decreased", "Gasping", "Apnoea"];
const EFFORTS = ["Normal", "Poor", "Increased", "Acidotic"];
const AIR_ENTRY = ["Normal", "Poor", "Differential"];
const AUSCULTATION = ["None", "Stridor", "Wheeze", "Crackles"];
const QUALITY = ["Good", "Poor"];
const SKIN_TEMP = ["Warm", "Cool"];
const PUPILS = ["Normal", "Unequal", "Dilated", "Constricted"];
const REACTION = ["Reactive", "Sluggish", "Non-reactive"];
const MOTOR = ["Normal", "Symmetrical", "Asymmetrical"];
const NEURO_SIGNS = ["None", "Seizures", "Posturing", "Flaccidity", "Extrapyramidal movements"];
const COLOUR = ["Normal", "Pallor", "Cyanosis", "Ashen grey"];
const SURFACE = [
  "Rash",
  "Abscess",
  "Pustules",
  "Cellulitis",
  "Purpura",
  "Petechiae",
  "Ecchymosis",
  "Haemorrhagic nodules",
  "Mucosal ulcers",
  "Dermatosis",
  "Desquamation",
  "Oedema",
  "Trauma",
];
const FINAL = [
  "Stable",
  "Respiratory distress",
  "Respiratory failure",
  "Compensated shock",
  "Hypotensive shock",
  "Primary brain / systemic dysfunction",
  "Cardiorespiratory failure",
  "Cardiorespiratory arrest",
];
const LEVELS = [
  "Level 1 — Resuscitation",
  "Level 2 — Emergent",
  "Level 3 — Urgent",
  "Level 4 — Less urgent",
  "Level 5 — Non-urgent",
];

function Choice({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${value === o ? "chip-on" : "chip-off"}`}
          onClick={() => onChange(value === o ? "" : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
      <span className="lbl mb-1 block">{label}</span>
      <div className="flex items-center gap-1">
        <input
          inputMode="decimal"
          className="inp !py-1 text-center text-sm font-bold"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="—"
        />
        {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
      </div>
    </label>
  );
}

function SelectBox({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
      <span className="lbl mb-1 block">{label}</span>
      <select className="inp !py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PediatricEmergencyTriage({
  onApply,
}: {
  onApply?: (r: PediatricTriageResult) => void;
}) {
  // Demographics & chief complaints
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [weight, setWeight] = useState("");
  const [complaints, setComplaints] = useState("");
  const [chronic, setChronic] = useState("");

  // Pediatric Assessment Triangle
  const [appearance, setAppearance] = useState("");
  const [work, setWork] = useState("");
  const [skinCirculation, setSkinCirculation] = useState("");
  const [initial, setInitial] = useState("");

  // ABCDE
  const [airway, setAirway] = useState("");
  const [rr, setRr] = useState("");
  const [effort, setEffort] = useState("");
  const [airEntry, setAirEntry] = useState("");
  const [auscultation, setAuscultation] = useState("");
  const [spo2Room, setSpo2Room] = useState("");
  const [spo240, setSpo240] = useState("");
  const [etco2, setEtco2] = useState("");

  const [hr, setHr] = useState("");
  const [crt, setCrt] = useState("");
  const [sbp, setSbp] = useState("");
  const [dbp, setDbp] = useState("");
  const [centralPulse, setCentralPulse] = useState("");
  const [peripheralPulse, setPeripheralPulse] = useState("");
  const [skinTemp, setSkinTemp] = useState("");
  const [ecg, setEcg] = useState("");
  const [circulationOther, setCirculationOther] = useState("");

  const [gcs, setGcs] = useState("");
  const [pupils, setPupils] = useState("");
  const [reaction, setReaction] = useState("");
  const [motor, setMotor] = useState("");
  const [neuroSign, setNeuroSign] = useState("");
  const [sugar, setSugar] = useState("");

  const [tempF, setTempF] = useState("");
  const [colour, setColour] = useState("");
  const [surface, setSurface] = useState<string[]>([]);
  const [exposureOther, setExposureOther] = useState("");

  // Manual overrides from the attached form
  const [manualFinal, setManualFinal] = useState("");
  const [manualLevel, setManualLevel] = useState("");

  const analysis = useMemo(() => {
    const age = Number(ageYears || 0);
    const months = Number(ageMonths || 0);
    const nSbp = Number(sbp);
    const nSpo2 = Number(spo2Room || spo240);
    const nEtco2 = Number(etco2);
    const nGcs = Number(gcs);
    const nSugar = Number(sugar);
    const nCrt = Number(crt);
    const nRr = Number(rr);
    const nHr = Number(hr);

    const hypotensionLimit =
      age === 0 && months < 1
        ? 60
        : age < 1
          ? 70
          : age <= 10
            ? 70 + 2 * age
            : 90;
    const hypotensive = !!sbp && nSbp < hypotensionLimit;
    const severeHypoxia = !!(spo2Room || spo240) && nSpo2 < 85;
    const hypoxia = !!(spo2Room || spo240) && nSpo2 < 92;
    const badEtco2 = !!etco2 && (nEtco2 < 20 || nEtco2 > 60);
    const poorPerfusion =
      (crt !== "" && nCrt >= 3) ||
      centralPulse === "Poor" ||
      peripheralPulse === "Poor" ||
      skinTemp === "Cool" ||
      skinCirculation === "Abnormal" ||
      skinCirculation === "Bleeding";
    const coma = !!gcs && nGcs <= 8;
    const neuroDysfunction =
      (!!gcs && nGcs < 13) ||
      pupils === "Unequal" ||
      reaction === "Non-reactive" ||
      neuroSign === "Seizures" ||
      neuroSign === "Posturing" ||
      neuroSign === "Flaccidity" ||
      (!!sugar && nSugar < 45);
    const respiratoryFailure =
      work === "Decreased" ||
      work === "Gasping" ||
      work === "Apnoea" ||
      severeHypoxia ||
      badEtco2 ||
      (airEntry === "Poor" && effort !== "Normal");
    const respiratoryDistress =
      work === "Increased" ||
      effort === "Increased" ||
      effort === "Acidotic" ||
      auscultation === "Stridor" ||
      auscultation === "Wheeze" ||
      auscultation === "Crackles" ||
      airEntry === "Differential" ||
      hypoxia ||
      (!!rr && (nRr < 8 || nRr > 60));
    const arrest =
      manualFinal === "Cardiorespiratory arrest" ||
      (work === "Apnoea" && centralPulse === "Poor" && nHr === 0);
    const cardiorespiratoryFailure =
      manualFinal === "Cardiorespiratory failure" ||
      (respiratoryFailure && hypotensive && poorPerfusion);
    const lifeThreatening =
      initial === "Unstable — life-threatening" ||
      airway === "Obstructed" ||
      arrest ||
      cardiorespiratoryFailure ||
      coma;

    let final = "Stable";
    if (arrest) final = "Cardiorespiratory arrest";
    else if (cardiorespiratoryFailure) final = "Cardiorespiratory failure";
    else if (respiratoryFailure) final = "Respiratory failure";
    else if (hypotensive) final = "Hypotensive shock";
    else if (neuroDysfunction) final = "Primary brain / systemic dysfunction";
    else if (poorPerfusion) final = "Compensated shock";
    else if (respiratoryDistress) final = "Respiratory distress";
    if (manualFinal) final = manualFinal;

    let level = 5;
    if (
      lifeThreatening ||
      final === "Cardiorespiratory arrest" ||
      final === "Cardiorespiratory failure"
    )
      level = 1;
    else if (
      final === "Respiratory failure" ||
      final === "Hypotensive shock" ||
      final === "Primary brain / systemic dysfunction" ||
      airway === "Open but unstable" ||
      initial === "Unstable — life-threatening"
    )
      level = 2;
    else if (
      final === "Respiratory distress" ||
      final === "Compensated shock" ||
      initial === "Unstable — not life-threatening" ||
      appearance === "Abnormal" ||
      skinCirculation === "Abnormal"
    )
      level = 3;
    else if (surface.length || colour === "Pallor" || !!complaints) level = 4;
    if (manualLevel) level = Math.max(1, Math.min(5, Number(manualLevel)));

    const band: PediatricTriageResult["band"] =
      level === 1 ? "red" : level === 2 ? "orange" : level === 3 ? "yellow" : "green";
    const suggestedAcuity = level <= 2 ? "critical" : level === 3 ? "guarded" : "stable";
    const levelName = LEVELS[level - 1];
    const advice =
      level === 1
        ? "Immediate resuscitation: ABCDE, airway/ventilation, vascular access, monitor, call PICU consultant."
        : level === 2
          ? "Emergent: physician assessment within 10 minutes, continuous monitoring, initiate stabilisation."
          : level === 3
            ? "Urgent: medical assessment within 30 minutes, repeat observations and PEWS."
            : level === 4
              ? "Less urgent: assessment within 60 minutes, symptomatic care and reassessment."
              : "Non-urgent: routine queue, reassess if symptoms change.";

    return {
      final,
      level,
      levelName,
      band,
      suggestedAcuity,
      advice,
      hypotensionLimit,
      hypotensive,
      respiratoryFailure,
      respiratoryDistress,
      poorPerfusion,
      neuroDysfunction,
    };
  }, [
    ageYears,
    ageMonths,
    sbp,
    spo2Room,
    spo240,
    etco2,
    gcs,
    sugar,
    crt,
    rr,
    hr,
    centralPulse,
    peripheralPulse,
    skinTemp,
    skinCirculation,
    work,
    effort,
    auscultation,
    airEntry,
    pupils,
    reaction,
    neuroSign,
    initial,
    airway,
    manualFinal,
    manualLevel,
    appearance,
    surface.length,
    colour,
    complaints,
  ]);

  const result: PediatricTriageResult = {
    scale: "Pediatric Emergency Triage Classification (PAT + ABCDE)",
    band: analysis.band,
    score: analysis.level,
    label: `${analysis.levelName} · ${analysis.final}`,
    advice: analysis.advice,
    suggestedAcuity: analysis.suggestedAcuity as "stable" | "guarded" | "critical",
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-3">
        <div className="lbl mb-2">Patient details & chief complaints</div>
        <div className="grid gap-2 md:grid-cols-4">
          <NumberInput label="Age (years)" value={ageYears} onChange={setAgeYears} />
          <NumberInput label="Age (months)" value={ageMonths} onChange={setAgeMonths} />
          <NumberInput label="Weight" value={weight} onChange={setWeight} unit="kg" />
          <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
            <span className="lbl mb-1 block">Chronic disease</span>
            <input className="inp !py-1 text-xs" value={chronic} onChange={(e) => setChronic(e.target.value)} placeholder="If any…" />
          </label>
          <label className="md:col-span-4 rounded-lg border border-white/10 bg-slate-900/40 p-2">
            <span className="lbl mb-1 block">Chief complaints (up to 4)</span>
            <input className="inp !py-1 text-xs" value={complaints} onChange={(e) => setComplaints(e.target.value)} placeholder="1… · 2… · 3… · 4…" />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Activity size={14} className="text-violet-300" />
          <span className="lbl">General assessment — Pediatric Assessment Triangle</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="lbl mb-1">Appearance</div>
            <Choice options={["Normal", "Abnormal"]} value={appearance} onChange={setAppearance} />
          </div>
          <div>
            <div className="lbl mb-1">Work of breathing</div>
            <Choice options={WORK} value={work} onChange={setWork} />
          </div>
          <div>
            <div className="lbl mb-1">Skin circulation</div>
            <Choice options={["Normal", "Abnormal", "Bleeding"]} value={skinCirculation} onChange={setSkinCirculation} />
          </div>
        </div>
        <div className="lbl mb-1 mt-3">Initial physiological categorisation</div>
        <Choice options={INITIAL} value={initial} onChange={setInitial} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="lbl mb-2">Primary assessment — ABCDE assessment pentagon</div>
        <div className="space-y-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-cyan-200">
              <Wind size={14} /> A — Airway
            </div>
            <Choice options={AIRWAY} value={airway} onChange={setAirway} />
          </div>

          <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-sky-200">
              <Activity size={14} /> B — Breathing
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <NumberInput label="RR" value={rr} onChange={setRr} unit="/min" />
              <SelectBox label="Efforts" options={EFFORTS} value={effort} onChange={setEffort} />
              <SelectBox label="Air entry" options={AIR_ENTRY} value={airEntry} onChange={setAirEntry} />
              <SelectBox label="Auscultation" options={AUSCULTATION} value={auscultation} onChange={setAuscultation} />
              <NumberInput label="SpO₂ room air" value={spo2Room} onChange={setSpo2Room} unit="%" />
              <NumberInput label="SpO₂ on 40% FiO₂" value={spo240} onChange={setSpo240} unit="%" />
              <NumberInput label="EtCO₂" value={etco2} onChange={setEtco2} unit="mmHg" />
            </div>
          </div>

          <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-rose-200">
              <HeartPulse size={14} /> C — Circulation
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <NumberInput label="HR" value={hr} onChange={setHr} unit="/min" />
              <NumberInput label="CRT" value={crt} onChange={setCrt} unit="sec" />
              <NumberInput label="SBP" value={sbp} onChange={setSbp} unit="mmHg" />
              <NumberInput label="DBP" value={dbp} onChange={setDbp} unit="mmHg" />
              <SelectBox label="Central pulse" options={QUALITY} value={centralPulse} onChange={setCentralPulse} />
              <SelectBox label="Peripheral pulse" options={QUALITY} value={peripheralPulse} onChange={setPeripheralPulse} />
              <SelectBox label="Skin temperature" options={SKIN_TEMP} value={skinTemp} onChange={setSkinTemp} />
              <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
                <span className="lbl mb-1 block">ECG rhythm / T wave</span>
                <input className="inp !py-1 text-xs" value={ecg} onChange={(e) => setEcg(e.target.value)} placeholder="Rhythm / T-wave…" />
              </label>
              <label className="md:col-span-4 rounded-lg border border-white/10 bg-slate-900/40 p-2">
                <span className="lbl mb-1 block">Other circulation findings</span>
                <input className="inp !py-1 text-xs" value={circulationOther} onChange={(e) => setCirculationOther(e.target.value)} placeholder="Other…" />
              </label>
            </div>
            {analysis.hypotensive && (
              <p className="mt-1 text-[10px] font-bold text-rose-200">
                ⚠ SBP below age-based PALS hypotension threshold ({analysis.hypotensionLimit} mmHg).
              </p>
            )}
          </div>

          <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-violet-200">
              <Brain size={14} /> D — Disability
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <NumberInput label="GCS" value={gcs} onChange={setGcs} unit="/15" />
              <SelectBox label="Pupil size" options={PUPILS} value={pupils} onChange={setPupils} />
              <SelectBox label="Reaction" options={REACTION} value={reaction} onChange={setReaction} />
              <SelectBox label="Motor activity" options={MOTOR} value={motor} onChange={setMotor} />
              <SelectBox label="Neuro sign" options={NEURO_SIGNS} value={neuroSign} onChange={setNeuroSign} />
              <NumberInput label="Blood sugar" value={sugar} onChange={setSugar} unit="mg/dL" />
            </div>
          </div>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-amber-200">
              <Thermometer size={14} /> E — Exposure
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <NumberInput label="Temperature" value={tempF} onChange={setTempF} unit="°F" />
              <SelectBox label="Colour" options={COLOUR} value={colour} onChange={setColour} />
              <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
                <span className="lbl mb-1 block">Other exposure finding</span>
                <input className="inp !py-1 text-xs" value={exposureOther} onChange={(e) => setExposureOther(e.target.value)} placeholder="Other…" />
              </label>
            </div>
            <div className="lbl mb-1 mt-2">Surface findings (multi-select)</div>
            <div className="flex flex-wrap gap-1">
              {SURFACE.map((s) => {
                const selected = surface.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${selected ? "chip-on tone-amber" : "chip-off"}`}
                    onClick={() => setSurface((p) => (selected ? p.filter((x) => x !== s) : [...p, s]))}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
          <div className="lbl mb-1">Final physiological categorisation</div>
          <Choice options={FINAL} value={manualFinal} onChange={setManualFinal} />
          <p className="mt-2 text-xs text-slate-300">
            Auto: <b className="text-white">{analysis.final}</b>
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
          <div className="lbl mb-1">Triage classification</div>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((l, i) => (
              <button
                key={l}
                type="button"
                className={`chip ${manualLevel === String(i + 1) ? "chip-on" : "chip-off"}`}
                onClick={() => setManualLevel(manualLevel === String(i + 1) ? "" : String(i + 1))}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-300">
            Auto: <b className="text-white">{analysis.levelName}</b>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black ${
            analysis.band === "red"
              ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
              : analysis.band === "orange"
                ? "border-orange-400/40 bg-orange-400/10 text-orange-200"
                : analysis.band === "yellow"
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {analysis.level === 1 ? <AlertOctagon size={15} /> : analysis.level <= 3 ? <Activity size={15} /> : <ShieldCheck size={15} />}
          {analysis.levelName} · {analysis.final}
        </div>
        <p className="flex-1 text-[10px] text-slate-400">{analysis.advice}</p>
        {onApply && (
          <button type="button" className="btn-primary !py-1.5 text-[11px]" onClick={() => onApply(result)}>
            Apply triage → {result.suggestedAcuity}
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        Based on the attached Pediatric Emergency Triage Classification form (PAT + ABCDE + final physiological
        category + Level 1–5). Auto-classification supports—not replaces—clinical judgement; manual category and
        level remain available.
      </p>
    </div>
  );
}
