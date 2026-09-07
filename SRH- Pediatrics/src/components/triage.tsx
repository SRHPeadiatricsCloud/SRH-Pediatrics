"use client";

import { Activity, AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PediatricEmergencyTriage } from "@/components/pediatric-emergency-triage";

/* ============================================================
   Neonatal triage — WHO 2015 "danger signs" + SNAPPE-II band
   ============================================================ */

const NEO_DANGERS: { key: string; label: string }[] = [
  { key: "notFeeding", label: "Not feeding / stopped feeding well" },
  { key: "convulsions", label: "Convulsions or fits" },
  { key: "fastBreath", label: "Fast breathing (RR ≥ 60)" },
  { key: "chestIndraw", label: "Severe chest in-drawing" },
  { key: "grunting", label: "Grunting" },
  { key: "cyanosis", label: "Central cyanosis" },
  { key: "lowTemp", label: "Temperature < 95.9 °F (hypothermia)" },
  { key: "highTemp", label: "Temperature ≥ 99.5 °F (fever)" },
  { key: "lethargy", label: "Lethargy / unconscious / reduced movements" },
  { key: "jaundice24h", label: "Jaundice in first 24 h or palms/soles" },
  { key: "bleeding", label: "Bleeding from any site" },
  { key: "umbRed", label: "Red / draining umbilicus, skin pustules" },
];

const SNAPPE_ITEMS = [
  {
    key: "map",
    label: "Mean BP (mmHg)",
    options: [
      { v: 0, text: "≥ 30" },
      { v: 9, text: "20–29" },
      { v: 19, text: "< 20" },
    ],
  },
  {
    key: "temp",
    label: "Lowest temperature (°F)",
    options: [
      { v: 0, text: "> 96.1" },
      { v: 8, text: "95.0–96.1" },
      { v: 15, text: "< 95.0" },
    ],
  },
  {
    key: "po2fio2",
    label: "pO₂ / FiO₂",
    options: [
      { v: 0, text: "> 2.49" },
      { v: 5, text: "1.0–2.49" },
      { v: 16, text: "0.3–0.99" },
      { v: 28, text: "< 0.3" },
    ],
  },
  {
    key: "ph",
    label: "Serum pH",
    options: [
      { v: 0, text: "≥ 7.20" },
      { v: 7, text: "7.10–7.19" },
      { v: 16, text: "< 7.10" },
    ],
  },
  {
    key: "seizures",
    label: "Multiple seizures",
    options: [
      { v: 0, text: "None" },
      { v: 19, text: "Present" },
    ],
  },
  {
    key: "urine",
    label: "Urine output ml/kg/hr",
    options: [
      { v: 0, text: "≥ 1.0" },
      { v: 5, text: "0.1–0.9" },
      { v: 18, text: "< 0.1" },
    ],
  },
  {
    key: "birthWeight",
    label: "Birth weight (g)",
    options: [
      { v: 0, text: "≥ 1000" },
      { v: 10, text: "750–999" },
      { v: 17, text: "< 750" },
    ],
  },
  {
    key: "sga",
    label: "Small for gestational age (< 3rd centile)",
    options: [
      { v: 0, text: "No" },
      { v: 12, text: "Yes" },
    ],
  },
  {
    key: "apgar5",
    label: "Apgar at 5 min",
    options: [
      { v: 0, text: "≥ 7" },
      { v: 18, text: "< 7" },
    ],
  },
];

/* ============================================================
   Paediatric triage — PEWS (0–13) + IMCI + PALS shock flags
   ============================================================ */

const PEWS_ITEMS = [
  {
    key: "behaviour",
    label: "Behaviour",
    options: [
      { v: 0, text: "Playing / appropriate" },
      { v: 1, text: "Sleeping" },
      { v: 2, text: "Irritable" },
      { v: 3, text: "Lethargic / confused / reduced response to pain" },
    ],
  },
  {
    key: "cvs",
    label: "Cardiovascular",
    options: [
      { v: 0, text: "Pink or CRT 1–2 s" },
      { v: 1, text: "Pale or CRT 3 s" },
      { v: 2, text: "Grey or CRT 4 s / HR ↑ 20 above normal" },
      { v: 3, text: "Grey & mottled or CRT ≥ 5 s / HR ↑ 30 above normal or bradycardia" },
    ],
  },
  {
    key: "resp",
    label: "Respiratory",
    options: [
      { v: 0, text: "Within normal, no recession" },
      { v: 1, text: "RR > 10 above normal, use of accessory muscles, 30%+ FiO₂ or 3 L/min" },
      { v: 2, text: "RR > 20 above normal, recession, 40%+ FiO₂ or 6 L/min" },
      { v: 3, text: "RR ≥ 5 below normal + sternal recession, grunting, 50%+ FiO₂ or 8 L/min" },
    ],
  },
];

const IMCI_DANGERS = [
  { key: "notDrink", label: "Not able to drink or breastfeed" },
  { key: "vomitsAll", label: "Vomits everything" },
  { key: "convulsion", label: "Convulsions" },
  { key: "lethargic", label: "Lethargic or unconscious" },
  { key: "cyanosis", label: "Central cyanosis" },
  { key: "severeMalnut", label: "Severe wasting / oedema of both feet" },
  { key: "stridor", label: "Stridor in a calm child" },
  { key: "severeAnaemia", label: "Severe pallor" },
];

const PALS_SHOCK = [
  { key: "coldShock", label: "Cold shock (cold peripheries, weak pulses, ↓ BP)" },
  { key: "warmShock", label: "Warm shock (bounding pulses, wide pulse pressure)" },
  { key: "fluidRefractory", label: "Fluid-refractory shock (needs vasoactive)" },
  { key: "arrest", label: "Cardiac / respiratory arrest en route" },
];

/* ============================================================
   Public component
   ============================================================ */

export type TriageResult = {
  scale: string;
  band: "green" | "yellow" | "orange" | "red";
  score: number;
  label: string;
  advice: string;
  suggestedAcuity: "stable" | "guarded" | "critical";
};

const BAND_TONE: Record<TriageResult["band"], string> = {
  green: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  yellow: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  orange: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  red: "border-rose-400/50 bg-rose-500/15 text-rose-200",
};

const BAND_ICON: Record<TriageResult["band"], React.ReactElement> = {
  green: <ShieldCheck size={14} />,
  yellow: <AlertTriangle size={14} />,
  orange: <AlertTriangle size={14} />,
  red: <AlertOctagon size={14} />,
};

export function AdmissionTriage({
  unit,
  onApply,
}: {
  unit: string;
  onApply?: (r: TriageResult) => void;
}) {
  const isNeo = unit === "nicu" || unit === "postnatal";
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
          <Activity size={13} />
        </span>
        <span className="lbl">
          {isNeo ? "Neonatal / postnatal triage" : "Paediatric triage (PEWS · IMCI · PALS)"}
        </span>
        <span className="text-[10px] text-slate-400">Optional · guides illness severity</span>
        <button
          type="button"
          className="btn-ghost ml-auto !py-1 text-[11px]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Open triage"}
        </button>
      </div>
      {open &&
        (isNeo ? (
          <NeonatalTriage onApply={onApply} />
        ) : (
          <PediatricEmergencyTriage onApply={onApply} />
        ))}
    </div>
  );
}

/* ---------- Neonatal ------------------------------------------------- */

function NeonatalTriage({ onApply }: { onApply?: (r: TriageResult) => void }) {
  const [dangers, setDangers] = useState<Record<string, boolean>>({});
  const [snappe, setSnappe] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<number | "">("");

  const dangerCount = Object.values(dangers).filter(Boolean).length;
  const snappeTotal =
    manual === ""
      ? SNAPPE_ITEMS.reduce((n, it) => n + (snappe[it.key] ?? 0), 0)
      : Number(manual);

  const result: TriageResult = useMemo(() => {
    // WHO danger signs override — any one → red (critical)
    if (dangerCount > 0) {
      return {
        scale: "WHO danger signs + SNAPPE-II",
        band: "red",
        score: snappeTotal,
        label: `${dangerCount} WHO danger sign${dangerCount === 1 ? "" : "s"} · SNAPPE-II ${snappeTotal}`,
        advice:
          "IMMEDIATE — resuscitate, warm, secure airway, IV access, start empirical antibiotics per unit protocol.",
        suggestedAcuity: "critical",
      };
    }
    // SNAPPE-II mortality bands
    if (snappeTotal >= 40) {
      return {
        scale: "SNAPPE-II",
        band: "red",
        score: snappeTotal,
        label: "Severe illness (≥ 40)",
        advice: "Level IIIB NICU · intensive monitoring · likely ventilation & inotropes.",
        suggestedAcuity: "critical",
      };
    }
    if (snappeTotal >= 20) {
      return {
        scale: "SNAPPE-II",
        band: "orange",
        score: snappeTotal,
        label: "Moderate illness (20–39)",
        advice: "Level III NICU · close observation, escalate early.",
        suggestedAcuity: "guarded",
      };
    }
    if (snappeTotal >= 10) {
      return {
        scale: "SNAPPE-II",
        band: "yellow",
        score: snappeTotal,
        label: "Mild illness (10–19)",
        advice: "Special / step-down care, routine NICU monitoring.",
        suggestedAcuity: "guarded",
      };
    }
    return {
      scale: "SNAPPE-II",
      band: "green",
      score: snappeTotal,
      label: "Stable (< 10)",
      advice: "Rooming-in / postnatal care with routine observation.",
      suggestedAcuity: "stable",
    };
  }, [dangerCount, snappeTotal]);

  return (
    <div className="space-y-3">
      <div>
        <div className="lbl mb-1">WHO danger signs (any = red flag)</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {NEO_DANGERS.map((d) => (
            <label
              key={d.key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                dangers[d.key]
                  ? "border-rose-400/60 bg-rose-500/15 text-rose-100"
                  : "border-white/10 bg-slate-900/40 text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                className="accent-rose-400"
                checked={!!dangers[d.key]}
                onChange={(e) => setDangers((p) => ({ ...p, [d.key]: e.target.checked }))}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl mb-1">SNAPPE-II items (fill what you have)</div>
        <div className="grid gap-2 md:grid-cols-2">
          {SNAPPE_ITEMS.map((it) => (
            <label key={it.key} className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
              <span className="lbl mb-1 block">{it.label}</span>
              <select
                className="inp !py-1 text-xs"
                value={snappe[it.key] ?? ""}
                onChange={(e) => {
                  setManual("");
                  setSnappe((p) => ({ ...p, [it.key]: Number(e.target.value) }));
                }}
              >
                <option value="">— select —</option>
                {it.options.map((o) => (
                  <option key={o.text} value={o.v}>
                    ({o.v}) {o.text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <span>Manual override total</span>
          <input
            type="number"
            className="inp !w-24 !py-1 text-center text-sm font-bold"
            value={manual}
            min={0}
            max={162}
            placeholder="—"
            onChange={(e) => setManual(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <div
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-black ${BAND_TONE[result.band]}`}
        >
          {BAND_ICON[result.band]}
          {result.label}
        </div>
        {onApply && (
          <button
            type="button"
            className="btn-primary ml-auto !py-1.5 text-[11px]"
            onClick={() => onApply(result)}
          >
            Apply → {result.suggestedAcuity}
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400">
        {result.advice}{" "}
        <span className="text-slate-500">
          · Reference: WHO 2015 sick young infant algorithm · Richardson SNAPPE-II.
        </span>
      </p>
    </div>
  );
}

/* ---------- Paediatric ------------------------------------------------- */

function PaediatricTriage({ onApply }: { onApply?: (r: TriageResult) => void }) {
  const [pews, setPews] = useState<Record<string, number>>({});
  const [imci, setImci] = useState<Record<string, boolean>>({});
  const [shock, setShock] = useState<Record<string, boolean>>({});
  const [nebulizer, setNebulizer] = useState<0 | 1 | 2>(0);
  const [manual, setManual] = useState<number | "">("");

  const dangerCount = Object.values(imci).filter(Boolean).length;
  const shockFlags = Object.values(shock).filter(Boolean).length;

  const total =
    manual === ""
      ? PEWS_ITEMS.reduce((n, it) => n + (pews[it.key] ?? 0), 0) + Number(nebulizer)
      : Number(manual);

  const result: TriageResult = useMemo(() => {
    // Any PALS shock / arrest flag → immediate red
    if (shockFlags > 0 || dangerCount > 0) {
      return {
        scale: "PEWS + IMCI + PALS",
        band: "red",
        score: total,
        label:
          shockFlags > 0
            ? `PALS shock flag · PEWS ${total}`
            : `${dangerCount} IMCI danger sign${dangerCount === 1 ? "" : "s"} · PEWS ${total}`,
        advice:
          "IMMEDIATE — resuscitation bay, high-flow O₂, IV access, 20 ml/kg NS bolus, ABCDE per PALS.",
        suggestedAcuity: "critical",
      };
    }
    if (total >= 7) {
      return {
        scale: "PEWS",
        band: "red",
        score: total,
        label: "Critical (PEWS ≥ 7)",
        advice: "PICU review NOW · continuous monitoring · escalate to senior on call.",
        suggestedAcuity: "critical",
      };
    }
    if (total >= 5) {
      return {
        scale: "PEWS",
        band: "orange",
        score: total,
        label: "Deteriorating (PEWS 5–6)",
        advice: "Step-down / HDU care · notify SR · reassess every 30 minutes.",
        suggestedAcuity: "guarded",
      };
    }
    if (total >= 3) {
      return {
        scale: "PEWS",
        band: "yellow",
        score: total,
        label: "At risk (PEWS 3–4)",
        advice: "Frequent nursing observation · reassess every 1 hour.",
        suggestedAcuity: "guarded",
      };
    }
    return {
      scale: "PEWS",
      band: "green",
      score: total,
      label: "Stable (PEWS 0–2)",
      advice: "Routine ward care, standard observation.",
      suggestedAcuity: "stable",
    };
  }, [total, dangerCount, shockFlags]);

  return (
    <div className="space-y-3">
      <div>
        <div className="lbl mb-1">PEWS score</div>
        <div className="grid gap-2 md:grid-cols-3">
          {PEWS_ITEMS.map((it) => (
            <label key={it.key} className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
              <span className="lbl mb-1 block">{it.label}</span>
              <select
                className="inp !py-1 text-xs"
                value={pews[it.key] ?? ""}
                onChange={(e) => {
                  setManual("");
                  setPews((p) => ({ ...p, [it.key]: Number(e.target.value) }));
                }}
              >
                <option value="">— select —</option>
                {it.options.map((o) => (
                  <option key={o.text} value={o.v}>
                    ({o.v}) {o.text}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
            <span className="lbl mb-1 block">Add-on: bronchodilator</span>
            <select
              className="inp !py-1 text-xs"
              value={nebulizer}
              onChange={(e) => {
                setManual("");
                setNebulizer(Number(e.target.value) as 0 | 1 | 2);
              }}
            >
              <option value={0}>(0) None</option>
              <option value={1}>(+1) Nebs q1h</option>
              <option value={2}>(+2) Persistent vomiting after surgery</option>
            </select>
          </label>
        </div>
      </div>

      <div>
        <div className="lbl mb-1">IMCI general danger signs</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {IMCI_DANGERS.map((d) => (
            <label
              key={d.key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                imci[d.key]
                  ? "border-rose-400/60 bg-rose-500/15 text-rose-100"
                  : "border-white/10 bg-slate-900/40 text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                className="accent-rose-400"
                checked={!!imci[d.key]}
                onChange={(e) => setImci((p) => ({ ...p, [d.key]: e.target.checked }))}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl mb-1">PALS shock recognition</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {PALS_SHOCK.map((d) => (
            <label
              key={d.key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                shock[d.key]
                  ? "border-rose-400/60 bg-rose-500/15 text-rose-100"
                  : "border-white/10 bg-slate-900/40 text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                className="accent-rose-400"
                checked={!!shock[d.key]}
                onChange={(e) => setShock((p) => ({ ...p, [d.key]: e.target.checked }))}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <span>Manual override total</span>
          <input
            type="number"
            className="inp !w-24 !py-1 text-center text-sm font-bold"
            value={manual}
            min={0}
            max={13}
            placeholder="—"
            onChange={(e) => setManual(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <div
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-black ${BAND_TONE[result.band]}`}
        >
          {BAND_ICON[result.band]}
          {result.label}
        </div>
        {onApply && (
          <button
            type="button"
            className="btn-primary ml-auto !py-1.5 text-[11px]"
            onClick={() => onApply(result)}
          >
            Apply → {result.suggestedAcuity}
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400">
        {result.advice}{" "}
        <span className="text-slate-500">
          · Reference: PEWS (Monaghan) · WHO IMCI · PALS 2020 shock algorithm.
        </span>
      </p>
    </div>
  );
}
