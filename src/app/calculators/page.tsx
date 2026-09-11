"use client";

import { ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, ExternalLink, History, Keyboard, RotateCcw, Ruler, Search, ShieldCheck, Star, Stethoscope, Target, X } from "lucide-react";
import { Calculator as CalculatorIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BloodGasInterpreter } from "@/components/blood-gas-interpreter";
import { TopBar } from "@/components/ui";
import { PhototherapyNomogramCalculator } from "@/components/phototherapy-calculator";
import { AnthropometrySection } from "@/components/anthropometry-calculators";
import { CALCULATORS, CATEGORIES, newBallardCompletedWeeks } from "@/lib/calculators";
import type { Calculator as CalcDef, CalcResult } from "@/lib/calc-types";

const SEV_STYLE: Record<string, string> = {
  good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
};

const SPOTLIGHTS = [
  { id: "rop", label: "ROP", detail: "zone · stage · plus", accent: "violet" },
  { id: "downes", label: "Downes", detail: "respiratory distress", accent: "cyan" },
  { id: "ballard", label: "New Ballard", detail: "gestational maturity", accent: "orange" },
  { id: "parkland", label: "Paediatric burns", detail: "Lund–Browder + fluids", accent: "rose" },
  { id: "ponderal", label: "Ponderal", detail: "birth proportionality", accent: "indigo" },
] as const;

function categoryLabel(category: CalcDef["category"]): string {
  return CATEGORIES.find((item) => item.key === category)?.label ?? category;
}

function CalcCard({
  calc,
  open = false,
  saved = false,
  onToggleSaved,
  onOpen,
  onToggle,
}: {
  calc: CalcDef;
  open?: boolean;
  saved?: boolean;
  onToggleSaved?: (id: string) => void;
  onOpen?: (id: string) => void;
  onToggle?: (id: string) => void;
}) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CalcResult | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const enteredCount = calc.fields.filter((field) => Object.prototype.hasOwnProperty.call(values, field.key)).length;
  const invalidFields = calc.fields.filter((field) => {
    if (field.type !== "number" || values[field.key] == null) return false;
    const value = values[field.key];
    return !Number.isFinite(value) || (field.min != null && value < field.min) || (field.max != null && value > field.max);
  });
  const complete = calc.fields.length > 0 && enteredCount === calc.fields.length && invalidFields.length === 0;
  const progress = calc.fields.length ? Math.round((enteredCount / calc.fields.length) * 100) : 0;
  const liveResult = useMemo(() => complete ? calc.compute(values) : null, [calc, complete, values]);
  const shownResult = liveResult ?? result;

  const openCard = () => {
    if (!open) onOpen?.(calc.id);
    onToggle?.(calc.id);
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const setValue = (key: string, value: number | undefined) => {
    setValues((previous) => {
      const next = { ...previous };
      if (value == null || !Number.isFinite(value)) delete next[key];
      else next[key] = value;
      return next;
    });
    setResult(null);
  };
  const fieldError = (field: CalcDef["fields"][number]) => {
    if (field.type !== "number" || values[field.key] == null) return "";
    const value = values[field.key];
    if (!Number.isFinite(value)) return "Enter a valid number";
    if (field.min != null && value < field.min) return `Minimum ${field.min}${field.unit ? ` ${field.unit}` : ""}`;
    if (field.max != null && value > field.max) return `Maximum ${field.max}${field.unit ? ` ${field.unit}` : ""}`;
    return "";
  };
  const reset = () => {
    setValues({});
    setResult(null);
  };

  return (
    <div ref={ref} className={`card calc-card overflow-hidden ${open ? "calc-card-open" : ""}`}>
      <div className="calc-card-header">
        <button type="button" className="calc-card-toggle" onClick={openCard} aria-expanded={open}>
          <span className="calc-card-chevron">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
          <span className={`calc-card-mark calc-mark-${calc.category}`}><Stethoscope size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="calc-card-eyebrow">{categoryLabel(calc.category)} <i>·</i> {calc.fields.length ? "guided entry" : "interactive module"}</span>
            <span className="calc-card-name">{calc.name}</span>
            <span className="calc-card-citation">{calc.citation.split("(")[0].trim()}</span>
          </span>
        </button>
        <div className="calc-card-actions">
          {calc.fields.length > 0 && <span className={`calc-progress-pill ${complete ? "done" : ""}`} title={`${enteredCount} of ${calc.fields.length} fields complete`}><span>{complete ? <Check size={11} /> : `${enteredCount}/${calc.fields.length}`}</span>{complete ? "Ready" : "Fields"}</span>}
          {onToggleSaved && <button type="button" className={`calc-save-button ${saved ? "saved" : ""}`} onClick={() => onToggleSaved(calc.id)} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${calc.name}`} title={`${saved ? "Remove from" : "Save to"} favourites`}><Star size={15} fill={saved ? "currentColor" : "none"} /></button>}
          <button type="button" className="calc-card-open-label" onClick={openCard} aria-label={`${open ? "Collapse" : "Open"} ${calc.name}`}>{open ? "Close" : "Open"}</button>
        </div>
      </div>

      {open && (
        <div className="calc-card-body">
          <div className="calc-card-context">
            <div className="calc-card-context-main"><ShieldCheck size={14} /><span>{calc.external ? "Primary source linked" : "Citation included"}</span><i>·</i><span>Not a diagnosis</span></div>
            {calc.external && <a href={calc.external.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> {calc.external.label}</a>}
          </div>
          <p className="calc-citation-full">{calc.citation}</p>
          {calc.id === "phototherapy-nomograms" ? (
            <PhototherapyNomogramCalculator />
          ) : calc.id === "abg-vbg-auto-interpreter" ? (
            <BloodGasInterpreter />
          ) : (
            <>
              <div className="calc-workflow-head">
                <div><span className="calc-step-kicker">{calc.fields.length ? "Guided assessment" : "Clinical module"}</span><h3>{calc.fields.length ? "Enter each finding, then review the interpretation" : "Review the source and complete the module below"}</h3></div>
                {calc.fields.length > 0 && <span className="calc-workflow-count">{complete ? "All required fields complete" : `${enteredCount} of ${calc.fields.length} fields`}</span>}
              </div>
              {calc.fields.length > 0 && <div className="calc-progress-track" aria-label={`${progress}% complete`}><i style={{ width: `${progress}%` }} /></div>}
              <CalculatorVisual calc={calc} values={values} result={liveResult} onValueChange={setValue} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {calc.fields.map((field, index) => {
                  const fieldId = `calc-${calc.id}-${field.key}`;
                  const errorId = `${fieldId}-error`;
                  const filled = Object.prototype.hasOwnProperty.call(values, field.key);
                  const error = fieldError(field);
                  return (
                    <label key={field.key} htmlFor={fieldId} className={`calculator-field calc-input-card rounded-xl p-3 ${filled ? "calc-input-filled" : ""} ${error ? "calc-input-error" : ""}`}>
                      <span className="calc-input-label"><span><b>{String(index + 1).padStart(2, "0")}</b>{field.label}</span>{filled && !error && <Check size={12} />}</span>
                      {field.type === "select" ? (
                        <select id={fieldId} className="calculator-input inp text-sm" value={values[field.key] ?? ""} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(event) => setValue(field.key, event.target.value === "" ? undefined : Number(event.target.value))}>
                          <option value="">Choose an option…</option>
                          {field.options.map((option) => <option key={`${field.key}-${option.value}`} value={option.value}>({option.value}) {option.label}</option>)}
                        </select>
                      ) : (
                        <>
                          <input id={fieldId} type="number" className="calculator-input inp text-center text-base font-bold" inputMode="decimal" value={values[field.key] ?? ""} placeholder={field.placeholder ?? "Enter value"} min={field.min} max={field.max} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(event) => setValue(field.key, event.target.value === "" ? undefined : Number(event.target.value))} />
                          {field.unit && <span className="mt-1 block text-[10px] text-slate-500">{field.unit}{field.min != null && field.max != null ? ` · ${field.min}–${field.max}` : ""}</span>}
                        </>
                      )}
                      {error && <span id={errorId} className="calc-field-error">{error}</span>}
                    </label>
                  );
                })}
              </div>
              {calc.fields.length > 0 && !complete && enteredCount > 0 && <p className="calc-incomplete-note"><Target size={13} /> {invalidFields.length ? "Correct the highlighted values before interpreting this tool." : "Complete the remaining fields to unlock the interpretation."}</p>}
              {calc.fields.length > 0 && <div className="calc-action-row"><button type="button" className="btn-primary calc-run-button" disabled={!complete} onClick={() => setResult(calc.compute(values))}>{complete ? "Run interpretation" : invalidFields.length ? "Fix highlighted values" : "Complete fields first"}<ArrowUpRight size={14} /></button><button type="button" className="btn-ghost calc-reset-button" disabled={!enteredCount} onClick={reset}><RotateCcw size={13} /> Reset</button></div>}
              {shownResult && <div className={`calc-result-panel mt-3 rounded-xl border p-3 ${SEV_STYLE[shownResult.severity]}`} aria-live="polite"><div className="calc-result-topline"><span className="calc-result-kicker">Interpretation</span><span className="calc-result-state">{liveResult ? "Live" : "Saved"}</span></div><div className="text-base font-black tabular-nums">{shownResult.value}</div><p className="mt-1 text-[11px] leading-snug">{shownResult.interpretation ?? shownResult.note ?? ""}</p>{shownResult.interpretation && shownResult.note && <p className="mt-2 border-t border-current/15 pt-2 text-[10px] leading-snug opacity-80">{shownResult.note}</p>}{shownResult.outOfRange && <p className="mt-1 text-[10px] font-bold text-rose-300">⚠ {shownResult.outOfRange}</p>}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CalculatorVisual({ calc, values, result, onValueChange }: { calc: CalcDef; values: Record<string, number>; result: CalcResult | null; onValueChange: (key: string, value: number) => void }) {
  if (calc.id === "downes") return <DownesVisual values={values} result={result} />;
  if (calc.id === "ballard") return <BallardVisual values={values} result={result} />;
  if (calc.id === "rop") return <RopVisual values={values} result={result} />;
  if (calc.id === "parkland") return <ParklandVisual values={values} onBurnChange={(value) => onValueChange("burn", value)} />;
  if (calc.fields.length > 0 && calc.fields.every((field) => field.type === "select")) {
    return <ScaleSummaryVisual calc={calc} values={values} result={result} />;
  }
  return null;
}

function VisualFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="calculator-visual mb-3" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="calc-visual-kicker">Visual guide</div>
          <h3 className="mt-0.5 text-sm font-black">{title}</h3>
        </div>
        <span className="calc-visual-badge">Reference aid</span>
      </div>
      {children}
      <p className="calc-visual-subtitle">{subtitle}</p>
    </div>
  );
}

function ScaleSummaryVisual({ calc, values, result }: { calc: CalcDef; values: Record<string, number>; result: CalcResult | null }) {
  const rows = calc.fields.flatMap((field) => {
    if (field.type !== "select") return [];
    const maximum = Math.max(1, ...field.options.map((option) => Math.abs(option.value)));
    const value = values[field.key];
    return [{ label: field.label, value, maximum, percent: value == null ? 0 : Math.min(100, (Math.abs(value) / maximum) * 100) }];
  });
  const selected = rows.filter((row) => row.value != null).length;
  const score = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const maxScore = rows.reduce((sum, row) => sum + row.maximum, 0);
  return (
    <VisualFrame title={`${calc.name} domain map`} subtitle="Each bar mirrors the selected response in that calculator's own scoring domain. The bars improve pattern recognition; the validated result and clinical context remain authoritative.">
      <div className="grid items-center gap-3 md:grid-cols-[150px_1fr]">
        <div className="scale-summary-meter" style={{ "--meter": `${maxScore ? Math.min(100, Math.abs(score) / maxScore * 100) : 0}%` } as React.CSSProperties}>
          <div><b>{selected ? score : "—"}</b><span>{selected}/{rows.length} selected</span></div>
        </div>
        <div className="scale-summary-bars">
          {rows.slice(0, 8).map((row) => <div className="scale-summary-row" key={row.label}><span>{row.label}</span><i><b style={{ width: `${row.percent}%` }} /></i><em>{row.value ?? "—"}</em></div>)}
          {rows.length > 8 && <span className="text-[9px] font-bold text-slate-500">{rows.length - 8} more domains shown in the fields below.</span>}
          {result && <div className="visual-callout">{result.interpretation ?? result.note}</div>}
        </div>
      </div>
    </VisualFrame>
  );
}

function DownesVisual({ values, result }: { values: Record<string, number>; result: CalcResult | null }) {
  const factors = [
    ["rr", "Rate"], ["cyanosis", "Cyanosis"], ["retraction", "Retractions"], ["grunting", "Grunting"], ["airEntry", "Air entry"],
  ] as const;
  const score = factors.reduce((total, [key]) => total + (values[key] ?? 0), 0);
  const hasSelection = Object.keys(values).length > 0;
  return (
    <VisualFrame title="Downes respiratory distress map" subtitle="Each domain contributes 0–2 points. The schematic highlights the bedside features to identify; use the validated score and clinical examination to guide escalation.">
      <div className="grid items-center gap-3 md:grid-cols-[150px_1fr]">
        <svg viewBox="0 0 150 112" className="visual-svg h-28 w-full" role="img" aria-label="Schematic lungs and airway">
          <path className="visual-airway" d="M75 18v22M75 40L48 55M75 40l27 15" />
          <path className="visual-lung" d="M70 44C50 39 31 53 29 78c-1 16 10 23 24 20 11-3 17-15 22-32" />
          <path className="visual-lung" d="M80 44c20-5 39 9 41 34 1 16-10 23-24 20-11-3-17-15-22-32" />
          <path className="visual-rib" d="M37 62c10-9 18-12 31-10M113 62c-10-9-18-12-31-10M34 73c10-7 19-9 32-7M116 73c-10-7-19-9-32-7" />
          <circle className="visual-pulse" cx="75" cy="16" r="5" />
          <text x="75" y="108" textAnchor="middle" className="visual-svg-text">observe work of breathing</text>
        </svg>
        <div className="space-y-2">
          {factors.map(([key, label]) => {
            const value = values[key];
            return (
              <div key={key} className="visual-score-row">
                <span className="visual-score-label">{label}</span>
                <span className="visual-score-dots" aria-label={`${label}: ${value ?? "not selected"}`}>
                  {[0, 1, 2].map((dot) => <i key={dot} className={value != null && dot <= value ? "on" : ""} />)}
                </span>
                <span className="visual-score-number">{value ?? "—"}</span>
              </div>
            );
          })}
          <div className="visual-total"><span>{hasSelection ? "Current score" : "Select the five domains"}</span><b>{hasSelection ? `${score}/10` : "—"}</b></div>
          {result && <div className="visual-callout">{result.interpretation ?? result.note}</div>}
        </div>
      </div>
    </VisualFrame>
  );
}

function BallardVisual({ values, result }: { values: Record<string, number>; result: CalcResult | null }) {
  const neuroKeys = ["posture", "sw", "ar", "pa", "sc", "he"];
  const physicalKeys = ["skin", "lanugo", "plantar", "breast", "eyeear", "genitalia"];
  const allFindingKeys = [...neuroKeys, ...physicalKeys];
  const selected = allFindingKeys.filter((key) => values[key] != null).length;
  const total = allFindingKeys.reduce((sum, key) => sum + (values[key] ?? 0), 0);
  const ga = selected === allFindingKeys.length && values.sex != null ? newBallardCompletedWeeks(total) : null;
  return (
    <VisualFrame title="New Ballard maturity map" subtitle="Use the actual New Ballard physical and neuromuscular examination findings. This body schematic is an identification aid, not a substitute for examining the infant or for gestational dating when reliable dates are available.">
      <div className="grid items-center gap-3 md:grid-cols-[160px_1fr]">
        <svg viewBox="0 0 160 156" className="visual-svg h-36 w-full" role="img" aria-label="Schematic newborn body for Ballard assessment">
          <circle className="visual-baby" cx="80" cy="24" r="17" />
          <path className="visual-baby" d="M61 46c5-8 33-8 38 0l7 48H54zM61 55L36 78M99 55l25 23M63 92l-12 44M97 92l12 44" />
          <path className="visual-joint" d="M36 78l-7 19M124 78l7 19M51 136l-8 8M109 136l8 8" />
          <circle className="visual-mark mark-physical" cx="80" cy="24" r="4" />
          <text x="80" y="153" textAnchor="middle" className="visual-svg-text">physical + neuromuscular domains</text>
        </svg>
        <div className="space-y-2">
          <div className="ballard-domain"><div><span>Neuromuscular</span><b>{neuroKeys.filter((key) => values[key] != null).length}/6 recorded</b></div><div className="domain-track"><i style={{ width: `${(neuroKeys.filter((key) => values[key] != null).length / 6) * 100}%` }} /></div></div>
          <div className="ballard-domain"><div><span>Physical</span><b>{physicalKeys.filter((key) => values[key] != null).length}/6 recorded</b></div><div className="domain-track physical"><i style={{ width: `${(physicalKeys.filter((key) => values[key] != null).length / 6) * 100}%` }} /></div></div>
          <div className="visual-total"><span>{ga != null ? "Estimated gestational age" : `${selected}/12 findings${values.sex != null ? " · sex row selected" : ""}`}</span><b>{ga != null ? `${ga} completed wk` : "—"}</b></div>
          {result && <div className="visual-callout">{result.interpretation ?? result.note}</div>}
        </div>
      </div>
    </VisualFrame>
  );
}

function RopVisual({ values, result }: { values: Record<string, number>; result: CalcResult | null }) {
  const zone = values.zone;
  const stage = values.stage;
  const vascular = values.plus;
  const plus = vascular === 2;
  const preplus = vascular === 1;
  const aprop = values.aprop === 1;
  return (
    <VisualFrame title="ROP zone, stage and plus-disease guide" subtitle="Schematic only: ROP classification requires a dilated retinal examination by an appropriately trained ophthalmologist. Zone, stage, plus disease and AP-ROP determine urgency together.">
      <div className="grid items-center gap-3 md:grid-cols-[190px_1fr]">
        <svg viewBox="0 0 190 150" className="visual-svg h-36 w-full" role="img" aria-label="Concentric schematic of retinal zones">
          <circle className={`retina-zone zone-three ${zone === 3 ? "selected" : ""}`} cx="95" cy="72" r="54" />
          <circle className={`retina-zone zone-two ${zone === 2 ? "selected" : ""}`} cx="95" cy="72" r="35" />
          <circle className={`retina-zone zone-one ${zone === 1 ? "selected" : ""}`} cx="95" cy="72" r="17" />
          <circle className="retina-disc" cx="95" cy="72" r="4" />
          <text x="95" y="69" textAnchor="middle" className="retina-text">I</text>
          <text x="95" y="51" textAnchor="middle" className="retina-text">II</text>
          <text x="95" y="22" textAnchor="middle" className="retina-text">III</text>
          <text x="95" y="142" textAnchor="middle" className="visual-svg-text">posterior → anterior</text>
        </svg>
        <div className="space-y-2">
          <div className="rop-stage-strip" aria-label="ROP stage progression">
            {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className={stage === item ? "active" : ""}>{item}</span>)}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className={`visual-pill ${zone ? "active" : ""}`}>Zone {zone ?? "—"}</span>
            <span className={`visual-pill ${stage != null ? "active" : ""}`}>Stage {stage ?? "—"}</span>
            <span className={`visual-pill ${plus ? "alert" : preplus ? "active" : ""}`}>Vessels {plus ? "plus" : preplus ? "pre-plus" : vascular === 0 ? "no plus" : "—"}</span>
            <span className={`visual-pill ${aprop ? "alert" : ""}`}>AP-ROP {aprop ? "present" : aprop === false && values.aprop != null ? "absent" : "—"}</span>
          </div>
          {result && <div className="visual-callout">{result.interpretation ?? result.note}</div>}
        </div>
      </div>
    </VisualFrame>
  );
}

type LundAgeKey = "birth" | "one" | "five" | "ten" | "fifteen" | "adult";
type LundRegion = { key: string; label: string };

const LUND_BROWDER = {
  birth: { label: "Birth–1 y", head: 19, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 5.5, thighRight: 5.5, lowerLegLeft: 5, lowerLegRight: 5, footLeft: 3.5, footRight: 3.5 },
  one: { label: "1–4 y", head: 17, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 6.5, thighRight: 6.5, lowerLegLeft: 5, lowerLegRight: 5, footLeft: 3.5, footRight: 3.5 },
  five: { label: "5–9 y", head: 13, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 8, thighRight: 8, lowerLegLeft: 5.5, lowerLegRight: 5.5, footLeft: 3.5, footRight: 3.5 },
  ten: { label: "10–14 y", head: 11, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 8.5, thighRight: 8.5, lowerLegLeft: 6, lowerLegRight: 6, footLeft: 3.5, footRight: 3.5 },
  fifteen: { label: "15 y", head: 9, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 9, thighRight: 9, lowerLegLeft: 6.5, lowerLegRight: 6.5, footLeft: 3.5, footRight: 3.5 },
  adult: { label: "Adult 16+", head: 7, neck: 2, trunkFront: 13, trunkBack: 13, buttocks: 5, genitalia: 1, armLeft: 9.5, armRight: 9.5, thighLeft: 9.5, thighRight: 9.5, lowerLegLeft: 7, lowerLegRight: 7, footLeft: 3.5, footRight: 3.5 },
} as const;

const LUND_REGIONS: LundRegion[] = [
  { key: "head", label: "Head" },
  { key: "neck", label: "Neck" },
  { key: "trunkFront", label: "Anterior trunk" },
  { key: "trunkBack", label: "Posterior trunk" },
  { key: "buttocks", label: "Both buttocks" },
  { key: "genitalia", label: "Genitalia" },
  { key: "armLeft", label: "Left arm" },
  { key: "armRight", label: "Right arm" },
  { key: "thighLeft", label: "Left thigh" },
  { key: "thighRight", label: "Right thigh" },
  { key: "lowerLegLeft", label: "Left lower leg" },
  { key: "lowerLegRight", label: "Right lower leg" },
  { key: "footLeft", label: "Left foot" },
  { key: "footRight", label: "Right foot" },
];

function ParklandVisual({ values, onBurnChange }: { values: Record<string, number>; onBurnChange: (value: number) => void }) {
  const [ageKey, setAgeKey] = useState<LundAgeKey>("birth");
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const age = LUND_BROWDER[ageKey];
  const burn = Math.max(0, Math.min(100, values.burn ?? 0));
  const fullRegionTotal = [...selectedRegions].reduce((sum, key) => sum + Number(age[key as keyof typeof age] ?? 0), 0);
  const toggleRegion = (key: string) => {
    const next = new Set(selectedRegions);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedRegions(next);
    onBurnChange(Math.round([...next].reduce((sum, region) => sum + Number(age[region as keyof typeof age] ?? 0), 0) * 10) / 10);
  };
  const changeAge = (nextAge: LundAgeKey) => {
    setAgeKey(nextAge);
    const nextTotal = [...selectedRegions].reduce((sum, key) => sum + Number(LUND_BROWDER[nextAge][key as keyof typeof LUND_BROWDER[LundAgeKey]] ?? 0), 0);
    if (selectedRegions.size) onBurnChange(Math.round(nextTotal * 10) / 10);
  };
  return (
    <VisualFrame title="Age-adjusted Lund–Browder TBSA guide" subtitle="The American Burn Association recommends age-appropriate assessment for children. Tap complete regions to add their chart values; enter partial regions manually or use the patient's palm (approximately 1% TBSA). This aid does not replace a formal burn chart or burn-team assessment.">
      <div className="grid items-start gap-3 xl:grid-cols-[1fr_250px]">
        <div>
          <svg viewBox="0 0 430 150" className="visual-svg h-36 w-full" role="img" aria-label="Front and back body regions for age-adjusted total body surface area burn estimation">
            <text x="86" y="14" textAnchor="middle" className="visual-svg-text">FRONT</text>
            <text x="254" y="14" textAnchor="middle" className="visual-svg-text">BACK</text>
            <circle className={`burn-head ${selectedRegions.has("head") ? "selected" : ""}`} cx="86" cy="34" r="13" /><circle className={`burn-head ${selectedRegions.has("head") ? "selected" : ""}`} cx="254" cy="34" r="13" />
            <rect className={`burn-region head ${selectedRegions.has("neck") ? "selected" : ""}`} x="74" y="49" width="24" height="15" rx="6" /><rect className={`burn-region head ${selectedRegions.has("neck") ? "selected" : ""}`} x="242" y="49" width="24" height="15" rx="6" />
            <path className={`burn-region trunk ${selectedRegions.has("trunkFront") ? "selected" : ""}`} d="M65 50h42l8 54H57z" /><path className={`burn-region trunk ${selectedRegions.has("trunkBack") ? "selected" : ""}`} d="M233 50h42l8 54h-58z" />
            <path className={`burn-region limb ${selectedRegions.has("armLeft") || selectedRegions.has("armRight") ? "selected" : ""}`} d="M59 54L38 61 27 98l9 3 18-25 8-15zM113 54l21 7 11 37-9 3-18-25-8-15zM227 54l-21 7-11 37 9 3 18-25 8-15zM281 54l21 7 11 37-9 3-18-25-8-15z" />
            <path className={`burn-region leg ${selectedRegions.has("thighLeft") || selectedRegions.has("thighRight") || selectedRegions.has("lowerLegLeft") || selectedRegions.has("lowerLegRight") || selectedRegions.has("footLeft") || selectedRegions.has("footRight") ? "selected" : ""}`} d="M63 103l17 0-2 34-12 0zM92 103h17l2 34-12 0zM231 103h17l-2 34h-12zM260 103h17l2 34h-12z" />
            <text x="86" y="146" textAnchor="middle" className="visual-svg-text">age-adjusted body regions</text>
            <text x="254" y="146" textAnchor="middle" className="visual-svg-text">front + back</text>
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="burn-age-select"><span>Chart age</span><select value={ageKey} onChange={(event) => changeAge(event.target.value as LundAgeKey)}>{(Object.entries(LUND_BROWDER) as [LundAgeKey, typeof LUND_BROWDER[LundAgeKey]][]).map(([key, band]) => <option key={key} value={key}>{band.label}</option>)}</select></label>
            <span className="text-[10px] font-bold text-slate-500">Full region buttons use the selected age band.</span>
          </div>
          <div className="burn-region-grid mt-2" aria-label="Lund-Browder region selector">
            {LUND_REGIONS.map((region) => {
              const percentage = Number(age[region.key as keyof typeof age] ?? 0);
              const active = selectedRegions.has(region.key);
              return <button key={region.key} type="button" className={`burn-region-chip ${active ? "active" : ""}`} aria-pressed={active} onClick={() => toggleRegion(region.key)}><span>{region.label}</span><b>{percentage}%</b></button>;
            })}
          </div>
          {selectedRegions.size > 0 && <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-[10px] font-bold text-cyan-100"><span>{selectedRegions.size} full region{selectedRegions.size === 1 ? "" : "s"} selected</span><b>{Math.round(fullRegionTotal * 10) / 10}% TBSA written to the input</b></div>}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">TBSA input</div>
          <div className="tbsa-number">{burn}<small>%</small></div>
          <div className="tbsa-track"><i style={{ width: `${burn}%` }} /></div>
          <div className="flex justify-between text-[9px] font-bold text-slate-500"><span>0%</span><span>50%</span><span>100%</span></div>
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[10px] leading-relaxed text-amber-100">Count partial-thickness and full-thickness burns only. Do not count simple erythema. Reassess depth and TBSA with the burn team.</div>
        </div>
      </div>
    </VisualFrame>
  );
}

type LibraryItem = {
  id: string;
  name: string;
  detail: string;
  category: CalcDef["category"];
  kind: "calculator" | "anthropometry";
  calc?: CalcDef;
};

const ANTHROPOMETRY_ITEM: LibraryItem = {
  id: "anthropometry",
  name: "Anthropometry & growth charts",
  detail: "WHO · IAP · Fenton · BMI",
  category: "growth",
  kind: "anthropometry",
};

export default function CalculatorsPage() {
  const [focusCalc, setFocusCalc] = useState("downes");
  const activeCalc = CALCULATORS.find((c) => c.id === focusCalc) ?? null;
  const anthropometryActive = focusCalc === ANTHROPOMETRY_ITEM.id;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [view, setView] = useState<"all" | "saved">("all");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const anthropometryQueryHit = !q.trim() || /anthrop|who|iap|fenton|bmi|height|weight|growth|mid-parental|mph|preterm/i.test(q);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem("srh_calculator_favourites") ?? "[]");
        const recent = JSON.parse(window.localStorage.getItem("srh_calculator_recent") ?? "[]");
        if (Array.isArray(saved)) setSavedIds(saved.filter((id): id is string => typeof id === "string" && CALCULATORS.some((calc) => calc.id === id)));
        if (Array.isArray(recent)) setRecentIds(recent.filter((id): id is string => typeof id === "string" && CALCULATORS.some((calc) => calc.id === id)));
      } catch {
        // Local storage is optional; the library remains fully usable without it.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get("calc")?.trim() ?? "";
    const nextId = queryId === "anthropometry" || CALCULATORS.some((calc) => calc.id === queryId) ? queryId : "downes";
    const frame = window.requestAnimationFrame(() => setFocusCalc(nextId));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const rememberCalculator = (id: string) => {
    if (id === ANTHROPOMETRY_ITEM.id) return;
    setRecentIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, 4);
      window.localStorage.setItem("srh_calculator_recent", JSON.stringify(next));
      return next;
    });
  };
  const launchCalculator = (id: string) => {
    rememberCalculator(id);
    setFocusCalc(id);
  };
  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      window.localStorage.setItem("srh_calculator_favourites", JSON.stringify(next));
      return next;
    });
  };

  const filteredCalculators = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CALCULATORS.filter((calc) => {
      if (view === "saved" && !savedIds.includes(calc.id)) return false;
      if (cat !== "all" && calc.category !== cat) return false;
      if (!needle) return true;
      const fieldSearch = calc.fields.map((field) => field.type === "select"
        ? `${field.label} ${field.options.map((option) => option.label).join(" ")}`
        : `${field.label} ${field.unit ?? ""}`).join(" ");
      return `${calc.name} ${calc.citation} ${calc.category} ${fieldSearch}`.toLowerCase().includes(needle);
    });
  }, [q, cat, savedIds, view]);

  const libraryGroups = useMemo(() => {
    const items: LibraryItem[] = [];
    if (view === "all" && cat !== "neonatal" && (cat === "all" || cat === "growth") && anthropometryQueryHit) items.push(ANTHROPOMETRY_ITEM);
    for (const calc of filteredCalculators) items.push({ id: calc.id, name: calc.name, detail: calc.external ? "Primary source linked" : calc.citation.split("(")[0].trim(), category: calc.category, kind: "calculator", calc });
    const map: Record<string, LibraryItem[]> = {};
    for (const item of items) (map[item.category] ??= []).push(item);
    return CATEGORIES.filter((category) => map[category.key]?.length).map((category) => ({ ...category, items: map[category.key] }));
  }, [anthropometryQueryHit, cat, filteredCalculators, view]);

  const recentCalculators = recentIds.map((id) => CALCULATORS.find((calc) => calc.id === id)).filter((calc): calc is CalcDef => Boolean(calc));
  const visibleCount = filteredCalculators.length + (libraryGroups.some((group) => group.items.some((item) => item.id === ANTHROPOMETRY_ITEM.id)) ? 1 : 0);

  return (
    <main className="calculator-page min-h-screen pb-20">
      <TopBar />
      <div className="calculator-shell mx-auto max-w-[1440px] px-4 py-5">
        <section className="calculator-command card">
          <div className="calculator-command-main">
            <div className="calculator-command-title">
              <div className="calc-command-mark"><CalculatorIcon size={22} /></div>
              <div><div className="calc-command-overline">SRH · Pediatric decision support</div><h1>Calculator workspace</h1><p>Choose one tool, complete one workflow, and keep the clinical interpretation in view.</p></div>
            </div>
            <div className="calculator-command-stats"><span><b>{CALCULATORS.length + 1}</b> tools</span><span><b>01</b> active workflow</span><span><b>⌘K</b> quick search</span></div>
          </div>
          <div className="calculator-command-search"><label htmlFor="calculator-search">Find a calculator or clinical feature</label><div className="calc-search-wrap"><Search size={18} /><input ref={searchRef} id="calculator-search" className="inp" placeholder="Search ROP, respiratory distress, bilirubin, birth weight…" value={q} onChange={(event) => setQ(event.target.value)} /><kbd><Keyboard size={11} />⌘K</kbd>{q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}</div><span>{visibleCount} result{visibleCount === 1 ? "" : "s"} · search includes fields, units and source text</span></div>
        </section>

        <div className="calc-workspace-layout">
          <aside className="calc-library-rail card" aria-label="Calculator library">
            <div className="calc-rail-heading"><div><span>Library</span><b>One tool at a time</b></div><span className="calc-rail-count">{CALCULATORS.length + 1}</span></div>
            <div className="calc-rail-tabs"><button type="button" className={view === "all" ? "active" : ""} onClick={() => setView("all")}>All tools</button><button type="button" className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><Star size={13} fill={view === "saved" ? "currentColor" : "none"} /> Saved <b>{savedIds.length}</b></button></div>
            <label className="calc-rail-filter"><span>Clinical area</span><select value={cat} onChange={(event) => setCat(event.target.value)}><option value="all">All clinical areas</option>{CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
            <div className="calc-rail-results"><span>{view === "saved" ? "Saved tools" : "Available tools"}</span><span>{visibleCount}</span></div>
            <div className="calc-library-list">
              {libraryGroups.map((group) => <div key={group.key} className="calc-library-group"><div className="calc-library-group-title"><span>{group.label}</span><b>{group.items.length}</b></div>{group.items.map((item) => <button key={item.id} type="button" className={`calc-library-item ${focusCalc === item.id ? "active" : ""}`} onClick={() => launchCalculator(item.id)}><span className={`calc-library-icon calc-mark-${item.category}`}>{item.kind === "anthropometry" ? <Ruler size={14} /> : <Stethoscope size={14} />}</span><span className="calc-library-copy"><b>{item.name}</b><small>{item.detail}</small></span>{item.kind === "calculator" && item.calc && savedIds.includes(item.calc.id) && <Star className="calc-library-star" size={13} fill="currentColor" />}{focusCalc === item.id && <ChevronRight className="calc-library-current" size={14} />}</button>)}</div>)}
              {libraryGroups.length === 0 && <div className="calc-rail-empty"><BookOpen size={20} /><b>{view === "saved" ? "No saved tools" : "No matches"}</b><span>{view === "saved" ? "Star tools to keep them here." : "Try a different search or clinical area."}</span></div>}
            </div>
          </aside>

          <section className="calc-workspace-stage" aria-live="polite">
            {activeCalc && <div className="calc-stage-heading"><div><span className="calc-stage-kicker">Active workflow · {categoryLabel(activeCalc.category)}</span><h2>{activeCalc.name}</h2><p>{activeCalc.external ? "Primary source linked" : "Citation and limitations shown below"} · one focused workflow at a time</p></div><div className="calc-stage-actions"><span className="calc-stage-status"><i /> Ready for entry</span><button type="button" onClick={() => setFocusCalc("")}><X size={14} /> Close tool</button></div></div>}
            {anthropometryActive && <div className="calc-stage-heading"><div><span className="calc-stage-kicker">Active workflow · Growth & nutrition</span><h2>{ANTHROPOMETRY_ITEM.name}</h2><p>WHO, IAP and Fenton references remain separate and visible.</p></div><div className="calc-stage-actions"><span className="calc-stage-status"><i /> Reference charts</span><button type="button" onClick={() => setFocusCalc("")}><X size={14} /> Close tool</button></div></div>}
            {activeCalc ? <CalcCard calc={activeCalc} open saved={savedIds.includes(activeCalc.id)} onToggleSaved={toggleSaved} onOpen={rememberCalculator} onToggle={(id) => setFocusCalc((current) => current === id ? "" : id)} /> : anthropometryActive ? <AnthropometrySection query="" /> : <div className="calc-stage-placeholder"><div className="calc-placeholder-icon"><CalculatorIcon size={25} /></div><span className="calc-stage-kicker">Workspace ready</span><h2>Choose a calculator from the library</h2><p>Only the active tool opens here, so the rest of the library stays compact on mobile and desktop.</p><button type="button" className="btn-primary" onClick={() => searchRef.current?.focus()}><Search size={15} /> Find a tool</button></div>}
            {activeCalc && recentCalculators.length > 0 && <div className="calc-stage-recent"><History size={14} /><span>Recent:</span>{recentCalculators.filter((calc) => calc.id !== activeCalc.id).slice(0, 3).map((calc) => <button key={calc.id} type="button" onClick={() => launchCalculator(calc.id)}>{calc.name}<ArrowUpRight size={12} /></button>)}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
