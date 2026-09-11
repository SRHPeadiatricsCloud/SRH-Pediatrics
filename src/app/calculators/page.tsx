"use client";

import { ChevronDown, ChevronRight, ExternalLink, Search, Stethoscope } from "lucide-react";
import { Calculator as CalculatorIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BloodGasInterpreter } from "@/components/blood-gas-interpreter";
import { TopBar } from "@/components/ui";
import { PhototherapyNomogramCalculator } from "@/components/phototherapy-calculator";
import { AnthropometrySection } from "@/components/anthropometry-calculators";
import { CALCULATORS, CATEGORIES } from "@/lib/calculators";
import type { Calculator as CalcDef, CalcResult } from "@/lib/calc-types";

const SEV_STYLE: Record<string, string> = {
  good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
};

function CalcCard({ calc, forceOpen = false }: { calc: CalcDef; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CalcResult | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [forceOpen]);

  const complete = calc.fields.length > 0 && calc.fields.every((field) => Object.prototype.hasOwnProperty.call(values, field.key));
  const liveResult = useMemo(() => complete ? calc.compute(values) : null, [calc, complete, values]);
  const shownResult = liveResult ?? result;
  const setValue = (key: string, value: number) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setResult(null);
  };

  return (
    <div ref={ref} className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} className="shrink-0 text-cyan-300" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
        <Stethoscope size={14} className="shrink-0 text-cyan-300/70" />
        <span className="flex-1 text-sm font-bold text-white">{calc.name}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-500">{calc.citation.split("(")[0].trim()}</span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          <p className="mb-3 text-[10px] text-slate-400">📖 {calc.citation}</p>
          {calc.id === "phototherapy-nomograms" ? (
            <PhototherapyNomogramCalculator />
          ) : calc.id === "abg-vbg-auto-interpreter" ? (
            <BloodGasInterpreter />
          ) : (
            <>
              {calc.external && (
                <a href={calc.external.url} target="_blank" rel="noopener noreferrer"
                  className="mb-3 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200">
                  <ExternalLink size={11} /> {calc.external.label}
                </a>
              )}
              <CalculatorVisual calc={calc} values={values} result={liveResult} onValueChange={setValue} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {calc.fields.map((field) => (
                  <label key={field.key} className="calculator-field rounded-xl p-3">
                    <span className="lbl">{field.label}</span>
                    {field.type === "select" ? (
                      <select
                        className="calculator-input inp text-sm"
                        value={values[field.key] ?? ""}
                        onChange={(e) => setValue(field.key, Number(e.target.value))}
                      >
                        <option value="">— select —</option>
                        {field.options.map((o) => (
                          <option key={o.value} value={o.value}>({o.value}) {o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="number"
                          className="calculator-input inp text-center text-base font-bold"
                          inputMode="decimal"
                          value={values[field.key] ?? ""}
                          placeholder={field.placeholder ?? "—"}
                          min={field.min}
                          max={field.max}
                          onChange={(e) => setValue(field.key, Number(e.target.value) || 0)}
                        />
                        {field.unit && <span className="mt-1 block text-[10px] text-slate-500">{field.unit}</span>}
                      </>
                    )}
                  </label>
                ))}
              </div>
              {calc.fields.length > 0 && !complete && Object.keys(values).length > 0 && (
                <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200">
                  Complete each field to show the validated interpretation.
                </p>
              )}
              {calc.fields.length > 0 && (
                <button className="btn-primary mt-3 !py-1.5 text-xs" disabled={!complete} onClick={() => setResult(calc.compute(values))}>
                  Calculate / update interpretation
                </button>
              )}
              {shownResult && (
                <div className={`mt-3 rounded-xl border p-3 ${SEV_STYLE[shownResult.severity]}`}>
                  <div className="text-base font-black tabular-nums">{shownResult.value}</div>
                  <p className="mt-1 text-[11px] leading-snug">{shownResult.interpretation ?? shownResult.note ?? ""}</p>
                  {shownResult.interpretation && shownResult.note && <p className="mt-2 border-t border-current/15 pt-2 text-[10px] leading-snug opacity-80">{shownResult.note}</p>}
                  {shownResult.outOfRange && <p className="mt-1 text-[10px] font-bold text-rose-300">⚠ {shownResult.outOfRange}</p>}
                </div>
              )}
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
  const ga = selected === allFindingKeys.length && values.sex != null ? Math.floor(24 + total * 0.4) : null;
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

export default function CalculatorsPage() {
  const [focusCalc, setFocusCalc] = useState("");
  const focusedCalc = CALCULATORS.find((c) => c.id === focusCalc) ?? null;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const anthropometryQueryHit = !q.trim() || /anthrop|who|iap|fenton|bmi|height|weight|growth|mid-parental|mph|preterm/i.test(q);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const calc = new URLSearchParams(window.location.search).get("calc")?.trim() || "";
    setFocusCalc(calc);
  }, []);
  const filtered = useMemo(() => {
    if (focusedCalc) return [focusedCalc];
    const needle = q.trim().toLowerCase();
    return CALCULATORS.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (!needle) return true;
      return `${c.name} ${c.citation} ${c.category}`.toLowerCase().includes(needle);
    });
  }, [q, cat, focusedCalc]);

  const grouped = useMemo(() => {
    const map: Record<string, CalcDef[]> = {};
    for (const c of CATEGORIES) map[c.key] = [];
    for (const c of filtered) (map[c.category] ??= []).push(c);
    return CATEGORIES.filter((c) => map[c.key]?.length).map((c) => ({ ...c, items: map[c.key] }));
  }, [filtered]);

  return (
    <main className="min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1200px] px-4 py-5">
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <CalculatorIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-white">Quick Access Calculators</h1>
            <p className="text-[11px] text-slate-400">
              {CALCULATORS.length} validated clinical calculators · provisional decision support — not a diagnosis
            </p>
          </div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="inp !w-64 !py-1.5 !pl-8 text-xs"
              placeholder="Search calculator by name…"
              value={focusedCalc ? focusedCalc.name : q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!!focusedCalc}
            />
          </div>
        </div>

        <div className="card mb-4 flex flex-wrap items-center gap-1.5 p-3">
          <button className={`chip ${cat === "all" ? "chip-on" : "chip-off"}`} onClick={() => setCat("all")} disabled={!!focusedCalc}>
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.key} className={`chip ${cat === c.key ? "chip-on" : "chip-off"}`} onClick={() => setCat(c.key)} disabled={!!focusedCalc}>
              {c.label}
            </button>
          ))}
        </div>

        {focusedCalc && (
          <div className="card mb-4 border-cyan-400/30 bg-cyan-400/5 p-3 text-[11px] text-cyan-100">
            Direct calculator link loaded: <b>{focusedCalc.name}</b>
          </div>
        )}

        {!focusedCalc && (cat === "all" || cat === "growth") && <AnthropometrySection query={q} />}

        {grouped.length === 0 && (!anthropometryQueryHit || focusedCalc) && <p className="card p-8 text-center text-sm text-slate-400">No calculator matches “{q}”.</p>}

        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-cyan-300">
                <Stethoscope size={14} /> {group.label}
                <span className="text-[10px] font-semibold text-slate-500">({group.items.length})</span>
              </h2>
              <div className="space-y-2">
                {group.items.map((c) => <CalcCard key={c.id} calc={c} forceOpen={c.id === focusCalc} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
