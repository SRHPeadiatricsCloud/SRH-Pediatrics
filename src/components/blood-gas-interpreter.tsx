"use client";

import { Activity, Droplets, Info, TestTube2, Wind } from "lucide-react";
import { useMemo, useState } from "react";
import { analyzeBloodGas, type BloodGasInput, type BloodGasSample } from "@/lib/blood-gas";

const BOX_STYLE: Record<string, string> = {
  good: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-400/35 bg-sky-400/10 text-sky-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
  neutral: "border-white/10 bg-white/[0.03] text-slate-200",
};

const SAMPLE_HELPERS: Record<BloodGasSample, string> = {
  ABG: "Use ABG when you want full acid-base interpretation plus oxygenation grading from PaO₂ / FiO₂.",
  VBG: "Use VBG for acid-base interpretation when venous values are available; oxygenation is not graded from venous pO₂.",
};

const FIELD_GROUPS: Array<{
  title: string;
  icon: React.ReactNode;
  fields: Array<{ key: keyof BloodGasInput; label: string; unit?: string; placeholder?: string; step?: string; min?: string; max?: string; abgOnly?: boolean }>;
}> = [
  {
    title: "Core blood gas",
    icon: <Wind size={14} className="text-cyan-300" />,
    fields: [
      { key: "ph", label: "pH", placeholder: "7.36", step: "0.01", min: "6.8", max: "7.8" },
      { key: "pco2", label: "pCO₂", unit: "mmHg", placeholder: "40", step: "0.1", min: "5", max: "150" },
      { key: "hco3", label: "HCO₃⁻", unit: "mmol/L", placeholder: "24", step: "0.1", min: "1", max: "60" },
      { key: "baseExcess", label: "Base excess", unit: "mmol/L", placeholder: "0", step: "0.1", min: "-40", max: "40" },
    ],
  },
  {
    title: "Electrolytes and metabolic context",
    icon: <TestTube2 size={14} className="text-cyan-300" />,
    fields: [
      { key: "sodium", label: "Na⁺", unit: "mmol/L", placeholder: "140", step: "0.1", min: "80", max: "200" },
      { key: "chloride", label: "Cl⁻", unit: "mmol/L", placeholder: "104", step: "0.1", min: "50", max: "170" },
      { key: "albumin", label: "Albumin", unit: "g/dL", placeholder: "4.0", step: "0.1", min: "0.5", max: "7" },
      { key: "lactate", label: "Lactate", unit: "mmol/L", placeholder: "1.2", step: "0.1", min: "0", max: "30" },
    ],
  },
  {
    title: "Oxygenation",
    icon: <Droplets size={14} className="text-cyan-300" />,
    fields: [
      { key: "po2", label: "pO₂ / PaO₂", unit: "mmHg", placeholder: "85", step: "0.1", min: "0", max: "500", abgOnly: true },
      { key: "fio2", label: "FiO₂", unit: "%", placeholder: "21", step: "1", min: "21", max: "100", abgOnly: true },
    ],
  },
];

const emptyState: Record<keyof BloodGasInput, string | BloodGasSample> = {
  sampleType: "ABG",
  ph: "",
  pco2: "",
  hco3: "",
  baseExcess: "",
  sodium: "",
  chloride: "",
  albumin: "",
  lactate: "",
  po2: "",
  fio2: "",
};

function parseNumber(value: string | BloodGasSample): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BloodGasInterpreter() {
  const [raw, setRaw] = useState(emptyState);
  const sampleType = raw.sampleType as BloodGasSample;

  const values = useMemo<BloodGasInput>(() => ({
    sampleType,
    ph: parseNumber(raw.ph),
    pco2: parseNumber(raw.pco2),
    hco3: parseNumber(raw.hco3),
    baseExcess: parseNumber(raw.baseExcess),
    sodium: parseNumber(raw.sodium),
    chloride: parseNumber(raw.chloride),
    albumin: parseNumber(raw.albumin),
    lactate: parseNumber(raw.lactate),
    po2: sampleType === "ABG" ? parseNumber(raw.po2) : null,
    fio2: sampleType === "ABG" ? parseNumber(raw.fio2) : null,
  }), [raw, sampleType]);

  const analysis = useMemo(() => analyzeBloodGas(values), [values]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200">
            <Activity size={12} /> Auto interpreter
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-slate-300">
            Roomier input mode
          </span>
          <div className="ml-auto flex gap-1.5">
            {(["ABG", "VBG"] as BloodGasSample[]).map((type) => {
              const active = sampleType === type;
              return (
                <button
                  key={type}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${active
                    ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"}`}
                  onClick={() => setRaw((prev) => ({ ...prev, sampleType: type }))}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{SAMPLE_HELPERS[sampleType]}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Tap any field below and enter values directly. Larger entry boxes are used here to make bedside typing easier.
        </p>
      </div>

      {FIELD_GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            {group.icon}
            {group.title}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {group.fields.filter((field) => !(field.abgOnly && sampleType !== "ABG")).map((field) => (
              <label key={String(field.key)} className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <span className="lbl">{field.label}</span>
                <input
                  className="inp !min-h-[52px] text-left text-base font-bold tabular-nums"
                  type="number"
                  inputMode="decimal"
                  placeholder={field.placeholder ?? "—"}
                  step={field.step ?? "0.1"}
                  min={field.min}
                  max={field.max}
                  value={String(raw[field.key])}
                  onChange={(e) => setRaw((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span>{field.unit || "value"}</span>
                  {field.placeholder && <span>e.g. {field.placeholder}</span>}
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className={`rounded-2xl border p-4 ${BOX_STYLE[analysis.severity]}`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-80">Standard acid-base interpretation</p>
            <h3 className="mt-1 text-lg font-black text-white">{analysis.headline}</h3>
            <p className="mt-2 text-sm leading-relaxed">{analysis.acidBaseState}</p>
            <p className="mt-2 text-sm leading-relaxed">{analysis.compensation}</p>
            {analysis.gapSummary && <p className="mt-2 text-sm leading-relaxed">{analysis.gapSummary}</p>}
            {analysis.oxygenationSummary && <p className="mt-2 text-sm leading-relaxed">{analysis.oxygenationSummary}</p>}
            {analysis.sampleNote && <p className="mt-2 text-[11px] leading-relaxed opacity-90">{analysis.sampleNote}</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {analysis.metrics.map((metric) => (
          <div key={metric.label} className={`rounded-xl border p-3 ${BOX_STYLE[metric.tone]}`}>
            <div className="text-[10px] uppercase tracking-[0.24em] opacity-75">{metric.label}</div>
            <div className="mt-1 text-base font-black tabular-nums text-white">{metric.value}</div>
          </div>
        ))}
      </div>

      {(analysis.additionalFindings.length > 0 || analysis.cautions.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {analysis.additionalFindings.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
                <TestTube2 size={13} /> Derived findings
              </div>
              <ul className="space-y-2 text-[12px] leading-relaxed text-slate-200">
                {analysis.additionalFindings.map((item) => (
                  <li key={item} className="rounded-lg border border-white/8 bg-slate-900/35 px-3 py-2">{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.cautions.length > 0 && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em]">
                <Info size={13} /> Important notes
              </div>
              <ul className="space-y-2 text-[12px] leading-relaxed">
                {analysis.cautions.map((item) => (
                  <li key={item} className="rounded-lg border border-amber-300/20 bg-black/10 px-3 py-2">{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          onClick={() => setRaw(emptyState)}
        >
          Clear all values
        </button>
      </div>
    </div>
  );
}
