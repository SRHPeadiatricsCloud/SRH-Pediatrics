"use client";

import { useMemo, useState } from "react";
import {
  BLOOD_GROUPS,
  PHOTOTHERAPY_NOMOGRAMS,
  aboIncompatibilityRisk,
  bloodGroupRiskLabel,
  curveValueAt,
  micromolToMgDl,
  nominalPhototherapyChoice,
  rhIncompatibilityRisk,
  type BloodGroup,
  type PhototherapyCurve,
  type PhototherapyNomogram,
} from "@/lib/phototherapy";

const TONE = {
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.12)]",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200 shadow-[0_0_40px_rgba(245,158,11,0.12)]",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200 shadow-[0_0_40px_rgba(244,63,94,0.14)]",
} as const;

const CURVE_ACCENT: Record<string, string> = {
  "term-lower-risk": "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  "term-medium-risk": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "term-higher-risk": "border-rose-400/30 bg-rose-400/10 text-rose-200",
  "bw-1000-1249": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "bw-750-999": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "bw-500-749": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "ga-gt-2500": "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  "ga-2000-2499": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "ga-1500-1999": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "ga-1250-1499": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

export function PhototherapyNomogramCalculator() {
  const [ageHours, setAgeHours] = useState(48);
  const [gestWeeks, setGestWeeks] = useState(34);
  const [weightGrams, setWeightGrams] = useState(1800);
  const [tsbUmol, setTsbUmol] = useState(170);
  const [motherGroup, setMotherGroup] = useState<BloodGroup>("Unknown");
  const [babyGroup, setBabyGroup] = useState<BloodGroup>("Unknown");
  const [clinicalRiskFactors, setClinicalRiskFactors] = useState(false);
  const [activeChartKey, setActiveChartKey] = useState<string | null>(null);

  const aboRisk = useMemo(() => aboIncompatibilityRisk(motherGroup, babyGroup), [motherGroup, babyGroup]);
  const rhRisk = useMemo(() => rhIncompatibilityRisk(motherGroup, babyGroup), [motherGroup, babyGroup]);
  const combinedRisk = clinicalRiskFactors || aboRisk || rhRisk;

  const selection = useMemo(
    () => nominalPhototherapyChoice(weightGrams, gestWeeks, combinedRisk),
    [combinedRisk, gestWeeks, weightGrams],
  );

  const riskFlags = useMemo(() => {
    const flags = bloodGroupRiskLabel(motherGroup, babyGroup);
    if (clinicalRiskFactors) flags.push("Additional bilirubin neurotoxicity risk factors marked present");
    return flags;
  }, [babyGroup, clinicalRiskFactors, motherGroup]);

  const activeKey = activeChartKey ?? selection.nomogram?.key ?? PHOTOTHERAPY_NOMOGRAMS[0]?.key ?? "mrd-090";
  const activeNomogram = PHOTOTHERAPY_NOMOGRAMS.find((n) => n.key === activeKey) ?? PHOTOTHERAPY_NOMOGRAMS[0]!;
  const activeCurveKey =
    (selection.curve && activeNomogram.curves.some((curve) => curve.key === selection.curve?.key) && selection.curve.key) ||
    (selection.exchangeCurve &&
      activeNomogram.curves.some((curve) => curve.key === selection.exchangeCurve?.key) &&
      selection.exchangeCurve.key) ||
    null;

  const interpretation = useMemo(() => {
    const curve = selection.curve;
    if (!curve || !selection.nomogram) {
      return {
        severity: "info" as const,
        headline: "Reference only",
        threshold: null as number | null,
        exchangeThreshold: null as number | null,
        delta: null as number | null,
        exchangeDelta: null as number | null,
        note: selection.rationale,
      };
    }

    const threshold = curveValueAt(curve, ageHours);
    const exchangeThreshold = selection.exchangeCurve
      ? curveValueAt(selection.exchangeCurve, ageHours)
      : curve.exchange ?? null;
    const delta = Math.round((tsbUmol - threshold) * 10) / 10;
    const exchangeDelta = exchangeThreshold != null ? Math.round((tsbUmol - exchangeThreshold) * 10) / 10 : null;
    const nearLine = tsbUmol >= threshold - 30;
    const exchangeSuffix = exchangeThreshold != null
      ? ` Exchange line at this age: ${exchangeThreshold} µmol/L (${micromolToMgDl(exchangeThreshold)} mg/dL).`
      : "";

    if (exchangeThreshold != null && tsbUmol >= exchangeThreshold + 85) {
      return {
        severity: "crit" as const,
        headline: "≥85 µmol/L above exchange line",
        threshold,
        exchangeThreshold,
        delta,
        exchangeDelta,
        note: `TSB is at least 5 mg/dL (85 µmol/L) above the selected exchange line for ${curve.label}. Escalate immediately for intensive phototherapy and exchange-transfusion pathway.${exchangeSuffix}`,
      };
    }
    if (exchangeThreshold != null && tsbUmol >= exchangeThreshold) {
      return {
        severity: "crit" as const,
        headline: "At or above exchange line",
        threshold,
        exchangeThreshold,
        delta,
        exchangeDelta,
        note: `TSB is at or above the stored exchange threshold for ${curve.label}. Start intensive phototherapy, prepare exchange transfusion and escalate immediately.${exchangeSuffix}`,
      };
    }
    if (tsbUmol >= threshold) {
      return {
        severity: combinedRisk ? ("crit" as const) : ("warn" as const),
        headline: combinedRisk ? "Above phototherapy line with risk factors" : "Above phototherapy line",
        threshold,
        exchangeThreshold,
        delta,
        exchangeDelta,
        note: combinedRisk
          ? `TSB is above the selected phototherapy threshold and haemolysis / neurotoxicity risk is present. Treat promptly and trend bilirubin closely.${exchangeSuffix}`
          : `TSB is above the plotted phototherapy threshold for ${curve.label}. Start or continue phototherapy and repeat bilirubin as per unit protocol.${exchangeSuffix}`,
      };
    }
    if (nearLine || combinedRisk) {
      return {
        severity: "warn" as const,
        headline: combinedRisk ? "Below line but risk factors present" : "Approaching phototherapy line",
        threshold,
        exchangeThreshold,
        delta,
        exchangeDelta,
        note: combinedRisk
          ? `Risk factors suggest closer bilirubin surveillance even though the TSB is below the plotted treatment line. Send haemolysis work-up or broader evaluation if clinically indicated.${exchangeSuffix}`
          : `TSB is within 30 µmol/L of the selected phototherapy line. Recheck soon and ensure feeds, hydration, and follow-up are clear.${exchangeSuffix}`,
      };
    }
    return {
      severity: "info" as const,
      headline: "Below phototherapy line",
      threshold,
      exchangeThreshold,
      delta,
      exchangeDelta,
      note: `Current TSB plots below the selected treatment line. Continue monitoring and clinical review.${exchangeSuffix}`,
    };
  }, [ageHours, combinedRisk, selection, tsbUmol]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(167,139,250,0.12),transparent_30%),linear-gradient(180deg,rgba(8,15,30,0.96),rgba(15,23,42,0.92))] p-4 text-[11px] text-slate-300 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent,rgba(255,255,255,0.02),transparent)] opacity-60" />
        <div className="relative">
          <p className="font-semibold tracking-wide text-cyan-200">SRH NICU bilirubin nomograms</p>
          <p className="mt-1 leading-relaxed text-slate-300/90">
            <b className="text-white">SRH Bilirubin Nomograms — MRD/090, MRD/091, ≥35-week Phototherapy & Exchange</b>
          </p>
          <p className="mt-1 leading-relaxed text-slate-400">
            Auto-selects the correct pathway by gestation, weight, ABO or Rh status, and added neurotoxicity risk factors.
            Charts now show <b className="text-slate-200">both mg/dL and µmol/L</b> with color-coded hologram styling.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Age in hours" value={ageHours} onChange={setAgeHours} min={0} max={240} unit="h" />
        <Field label="Gestation" value={gestWeeks} onChange={setGestWeeks} min={22} max={42} step={0.1} unit="weeks" />
        <Field label="Birth weight" value={weightGrams} onChange={setWeightGrams} min={400} max={5000} unit="g" />
        <Field
          label="Total serum bilirubin"
          value={tsbUmol}
          onChange={setTsbUmol}
          min={0}
          max={600}
          unit="µmol/L"
          helper={`${micromolToMgDl(tsbUmol)} mg/dL`}
        />
        <SelectField label="Mother blood group" value={motherGroup} onChange={(v) => setMotherGroup(v as BloodGroup)} />
        <SelectField label="Baby blood group" value={babyGroup} onChange={(v) => setBabyGroup(v as BloodGroup)} />
      </div>

      <ToggleField
        label="Additional bilirubin neurotoxicity risk factors"
        checked={clinicalRiskFactors}
        onChange={setClinicalRiskFactors}
        helper="Examples: isoimmune haemolytic disease, G6PD deficiency, asphyxia, significant lethargy, temperature instability, sepsis, acidosis, low albumin."
      />

      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <div className={`rounded-2xl border p-4 ${TONE[interpretation.severity]}`}>
          <div className="flex flex-wrap items-start gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">Auto-selected pathway</div>
              <div className="text-lg font-black text-white">{interpretation.headline}</div>
            </div>
            <span
              className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CURVE_ACCENT[selection.curve?.key ?? ""] ?? "border-white/15 bg-white/5 text-white/90"}`}
            >
              {selection.nomogram ? `${selection.nomogram.shortTitle} · ${selection.curve?.label}` : "reference only"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric k="Chosen chart" v={selection.nomogram?.title ?? "Enter gestation and weight"} />
            <Metric
              k="Phototherapy line"
              v={interpretation.threshold != null ? `${interpretation.threshold} µmol/L` : "—"}
              sub={interpretation.threshold != null ? `${micromolToMgDl(interpretation.threshold)} mg/dL` : selection.rationale}
            />
            <Metric
              k="Exchange line"
              v={interpretation.exchangeThreshold != null ? `${interpretation.exchangeThreshold} µmol/L` : "—"}
              sub={interpretation.exchangeThreshold != null ? `${micromolToMgDl(interpretation.exchangeThreshold)} mg/dL` : "No exchange line stored for this path"}
            />
            <Metric
              k="Δ from phototherapy"
              v={interpretation.delta != null ? `${interpretation.delta > 0 ? "+" : ""}${interpretation.delta} µmol/L` : "—"}
              sub={interpretation.exchangeDelta != null ? `Δ from exchange ${interpretation.exchangeDelta > 0 ? "+" : ""}${interpretation.exchangeDelta} µmol/L` : undefined}
            />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-current">{interpretation.note}</p>
        </div>

        <div className="rounded-2xl border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,15,30,0.92))] p-4 shadow-[0_0_40px_rgba(34,211,238,0.06)]">
          <div className="lbl mb-2">Risk flags and selection logic</div>
          {riskFlags.length > 0 ? (
            <div className="space-y-1.5">
              {riskFlags.map((risk) => (
                <div key={risk} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200">
                  {risk}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No ABO or Rh incompatibility flag and no extra clinical risk factor selected.</p>
          )}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-400">
            <p>
              <b className="text-slate-200">Auto-selection:</b> MRD/090 is used first for birth weight under 1250 g. MRD/091 is used for infants under 35 weeks with birth weight 1250 g or above. At ≥35 weeks, the term chart chooses lower-, medium-, or higher-risk lines using gestation plus the entered risk flags.
            </p>
            <p className="mt-2">{selection.rationale}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PHOTOTHERAPY_NOMOGRAMS.map((chart) => {
          const active = chart.key === activeNomogram.key;
          return (
            <button
              key={chart.key}
              type="button"
              onClick={() => setActiveChartKey(chart.key)}
              className={`chip border ${active ? "chip-on border-cyan-400/40 shadow-[0_0_24px_rgba(34,211,238,0.18)]" : "chip-off border-white/10"}`}
            >
              {chart.title}
            </button>
          );
        })}
      </div>

      <NomogramChart
        chart={activeNomogram}
        currentCurveKey={activeCurveKey}
        ageHours={ageHours}
        tsbUmol={tsbUmol}
        gestWeeks={gestWeeks}
        riskFlags={riskFlags}
        selectionSummary={selection.rationale}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  helper,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  helper?: string;
}) {
  return (
    <label className="rounded-xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.88))] p-2.5 shadow-[0_0_24px_rgba(34,211,238,0.04)]">
      <span className="lbl mb-1 block">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="inp !border-cyan-400/10 !bg-slate-950/70 !py-1.5 text-center text-sm font-bold"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {unit && <span className="shrink-0 text-[10px] text-slate-500">{unit}</span>}
      </div>
      {helper && <span className="mt-1 block text-[10px] text-slate-500">{helper}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.88))] p-2.5 shadow-[0_0_24px_rgba(34,211,238,0.04)]">
      <span className="lbl mb-1 block">{label}</span>
      <select className="inp !border-cyan-400/10 !bg-slate-950/70 !py-1.5 text-sm font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>
        {BLOOD_GROUPS.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.88))] p-3 shadow-[0_0_24px_rgba(34,211,238,0.04)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 text-cyan-400"
      />
      <span className="min-w-0">
        <span className="lbl block">{label}</span>
        {helper && <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{helper}</span>}
      </span>
    </label>
  );
}

function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-white shadow-[inset_0_0_24px_rgba(255,255,255,0.02)]">
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/65">{k}</div>
      <div className="mt-0.5 text-sm font-black leading-tight">{v}</div>
      {sub && <div className="mt-1 text-[10px] text-white/70">{sub}</div>}
    </div>
  );
}

function NomogramChart({
  chart,
  currentCurveKey,
  ageHours,
  tsbUmol,
  gestWeeks,
  riskFlags,
  selectionSummary,
}: {
  chart: PhototherapyNomogram;
  currentCurveKey: string | null;
  ageHours: number;
  tsbUmol: number;
  gestWeeks: number;
  riskFlags: string[];
  selectionSummary: string;
}) {
  const width = 860;
  const height = 420;
  const pad = { top: 26, right: 68, bottom: 44, left: 68 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yTickStep = chart.yTickStep ?? 50;

  const x = (hour: number) => pad.left + (Math.max(0, Math.min(chart.maxHours, hour)) / chart.maxHours) * innerW;
  const y = (tsb: number) => pad.top + innerH - (Math.max(0, Math.min(chart.maxTsb, tsb)) / chart.maxTsb) * innerH;
  const currentX = x(ageHours);
  const currentY = y(tsbUmol);

  const selectedCurve = chart.curves.find((c) => c.key === currentCurveKey) ?? null;
  const selectedThreshold = selectedCurve ? curveValueAt(selectedCurve, ageHours) : null;

  const yTicks: number[] = [];
  for (let tick = 0; tick <= chart.maxTsb; tick += yTickStep) yTicks.push(tick);
  if (yTicks[yTicks.length - 1] !== chart.maxTsb) yTicks.push(chart.maxTsb);

  const minorYStep = Math.max(10, Math.round(yTickStep / 2));
  const yMinorTicks: number[] = [];
  for (let tick = 0; tick <= chart.maxTsb; tick += minorYStep) {
    if (!yTicks.includes(tick)) yMinorTicks.push(tick);
  }

  const xTicks = Array.from({ length: Math.floor(chart.maxHours / 24) + 1 }, (_, i) => i * 24);
  const xMinorTicks = Array.from({ length: Math.floor(chart.maxHours / 12) + 1 }, (_, i) => i * 12).filter((tick) => !xTicks.includes(tick));
  const termChart = chart.key.startsWith("term-");
  const activeRiskItems = riskFlags.length > 0 ? riskFlags : ["No ABO / Rh incompatibility or extra neurotoxicity risk flag selected"];
  const pathwayGuide = termChart
    ? [
        "Lower risk: ≥38 weeks and well",
        "Medium risk: ≥38 weeks + risk factors, or 35–37 6/7 weeks and well",
        "Higher risk: 35–37 6/7 weeks + risk factors",
      ]
    : [
        "MRD/090: birth weight under 1250 g",
        "MRD/091: gestation under 35 weeks with weight ≥1250 g",
        `Current gestation entered: ${gestWeeks} weeks`,
      ];

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] p-4 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h3 className="text-sm font-black text-white">{chart.title}</h3>
          <p className="text-[11px] text-slate-400">{chart.subtitle}</p>
        </div>
        <div className="ml-auto rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-[10px] text-slate-300">
          <div>{chart.eligibility}</div>
          {chart.caution && <div className="mt-1 text-slate-400">{chart.caution}</div>}
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-cyan-400/10 bg-slate-950/70">
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[48%] rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-2 text-[10px] text-slate-200 backdrop-blur-sm">
          <div className="font-black uppercase tracking-[0.18em] text-cyan-200">Graph risk profile</div>
          <div className="mt-1 leading-relaxed text-slate-300">{selectionSummary}</div>
          <div className="mt-2 space-y-1 text-slate-400">
            {activeRiskItems.map((item) => (
              <div key={item}>• {item}</div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[42%] rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 text-[10px] text-slate-300 backdrop-blur-sm">
          <div className="font-black uppercase tracking-[0.18em] text-white/90">Risk line guide</div>
          <div className="mt-1 space-y-1 leading-relaxed">
            {pathwayGuide.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[780px] w-full">
          <defs>
            <linearGradient id={`bg-${chart.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.10)" />
              <stop offset="45%" stopColor="rgba(59,130,246,0.06)" />
              <stop offset="100%" stopColor="rgba(167,139,250,0.08)" />
            </linearGradient>
            <filter id={`glow-${chart.key}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="#020617" />
          <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill={`url(#bg-${chart.key})`} />

          {xMinorTicks.map((tick) => (
            <line
              key={`x-minor-${tick}`}
              x1={x(tick)}
              y1={pad.top}
              x2={x(tick)}
              y2={height - pad.bottom}
              stroke="rgba(56,189,248,0.08)"
            />
          ))}
          {yMinorTicks.map((tick) => (
            <line
              key={`y-minor-${tick}`}
              x1={pad.left}
              y1={y(tick)}
              x2={width - pad.right}
              y2={y(tick)}
              stroke="rgba(56,189,248,0.06)"
            />
          ))}

          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={x(tick)} y1={pad.top} x2={x(tick)} y2={height - pad.bottom} stroke="rgba(103,232,249,0.16)" />
              <text x={x(tick)} y={height - 14} textAnchor="middle" fontSize="11" fill="#94a3b8">
                {formatHourTick(tick)}
              </text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={pad.left} y1={y(tick)} x2={width - pad.right} y2={y(tick)} stroke="rgba(103,232,249,0.12)" />
              <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#cbd5e1">
                {micromolToMgDl(tick).toFixed(1)}
              </text>
              <text x={width - pad.right + 10} y={y(tick) + 4} textAnchor="start" fontSize="11" fill="#94a3b8">
                {tick}
              </text>
            </g>
          ))}

          <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="rgba(226,232,240,.35)" />
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="rgba(226,232,240,.35)" />
          <line x1={width - pad.right} y1={pad.top} x2={width - pad.right} y2={height - pad.bottom} stroke="rgba(226,232,240,.2)" />

          {chart.curves.map((curve) => {
            const active = curve.key === currentCurveKey;
            return (
              <g key={curve.key}>
                <polyline
                  fill="none"
                  stroke={curve.color}
                  strokeWidth={active ? 4.5 : 3}
                  strokeOpacity={active ? 1 : 0.8}
                  strokeDasharray={curve.dashArray}
                  strokeLinecap="round"
                  filter={`url(#glow-${chart.key})`}
                  points={curve.points.map((p) => `${x(p.hour)},${y(p.tsb)}`).join(" ")}
                />
                {curve.points.map((p, i) => (
                  <circle
                    key={`${curve.key}-${i}`}
                    cx={x(p.hour)}
                    cy={y(p.tsb)}
                    r={active ? 4.2 : 3.2}
                    fill={curve.color}
                    opacity={active ? 1 : 0.75}
                    filter={`url(#glow-${chart.key})`}
                  />
                ))}
                {curve.exchange != null && active && (
                  <>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y(curve.exchange)}
                      y2={y(curve.exchange)}
                      stroke="#fb7185"
                      strokeWidth={1.6}
                      strokeDasharray="7 6"
                    />
                    <text x={width - pad.right - 4} y={y(curve.exchange) - 6} textAnchor="end" fontSize="11" fill="#fda4af">
                      Exchange {curve.exchange} µmol/L · {micromolToMgDl(curve.exchange)} mg/dL
                    </text>
                  </>
                )}
              </g>
            );
          })}

          <line x1={currentX} y1={pad.top} x2={currentX} y2={height - pad.bottom} stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" />
          <line x1={pad.left} y1={currentY} x2={width - pad.right} y2={currentY} stroke="rgba(255,255,255,.20)" strokeDasharray="4 4" />
          <circle cx={currentX} cy={currentY} r={8} fill="rgba(34,211,238,0.22)" filter={`url(#glow-${chart.key})`} />
          <circle cx={currentX} cy={currentY} r={5.5} fill="#f8fafc" stroke="#0f172a" strokeWidth={2.5} />
          <text x={currentX + 12} y={Math.max(pad.top + 16, currentY - 14)} fontSize="11" fill="#e2e8f0">
            Current point · {ageHours} h · {tsbUmol} µmol/L · {micromolToMgDl(tsbUmol)} mg/dL
          </text>

          <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="12" fill="#cbd5e1">
            Age in hours
          </text>
          <text x="18" y={height / 2} textAnchor="middle" fontSize="12" fill="#e2e8f0" transform={`rotate(-90 18 ${height / 2})`}>
            Total serum bilirubin (mg/dL)
          </text>
          <text x={width - 14} y={height / 2} textAnchor="middle" fontSize="12" fill="#94a3b8" transform={`rotate(90 ${width - 14} ${height / 2})`}>
            Total serum bilirubin (µmol/L)
          </text>
        </svg>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap gap-2">
          {chart.curves.map((curve) => (
            <LegendChip key={curve.key} curve={curve} active={curve.key === currentCurveKey} />
          ))}
        </div>
        {selectedCurve && selectedThreshold != null && (
          <div className={`rounded-xl border px-3 py-2 text-[11px] ${CURVE_ACCENT[selectedCurve.key] ?? "border-cyan-400/25 bg-cyan-400/5 text-cyan-200"}`}>
            Selected line at {ageHours} h: <b>{selectedThreshold} µmol/L</b>
            <span className="opacity-90"> · {micromolToMgDl(selectedThreshold)} mg/dL</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendChip({ curve, active }: { curve: PhototherapyCurve; active: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] shadow-[inset_0_0_16px_rgba(255,255,255,0.02)] ${
        active ? CURVE_ACCENT[curve.key] ?? "border-cyan-400/40 bg-cyan-400/10 text-white" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 font-bold text-white">
        <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: curve.color }} />
        <span>
          {curve.symbol} {curve.label}
        </span>
      </div>
      <div className="mt-0.5 text-slate-300/80">{curve.note ?? "Threshold line"}</div>
    </div>
  );
}

function formatHourTick(hour: number): string {
  if (hour === 0) return "Birth";
  if (hour === 120) return "5 d";
  if (hour === 144) return "6 d";
  if (hour === 168) return "7 d";
  return `${hour} h`;
}
