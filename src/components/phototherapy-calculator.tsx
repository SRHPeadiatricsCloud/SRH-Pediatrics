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
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
} as const;

export function PhototherapyNomogramCalculator() {
  const [ageHours, setAgeHours] = useState(48);
  const [gestWeeks, setGestWeeks] = useState(34);
  const [weightGrams, setWeightGrams] = useState(1800);
  const [tsbUmol, setTsbUmol] = useState(170);
  const [motherGroup, setMotherGroup] = useState<BloodGroup>("Unknown");
  const [babyGroup, setBabyGroup] = useState<BloodGroup>("Unknown");
  const [activeChartKey, setActiveChartKey] = useState<string | null>(null);

  const selection = useMemo(() => nominalPhototherapyChoice(weightGrams, gestWeeks), [weightGrams, gestWeeks]);
  const bloodRisks = useMemo(() => bloodGroupRiskLabel(motherGroup, babyGroup), [motherGroup, babyGroup]);
  const activeKey = activeChartKey ?? selection.nomogram?.key ?? PHOTOTHERAPY_NOMOGRAMS[0].key;
  const activeNomogram = PHOTOTHERAPY_NOMOGRAMS.find((n) => n.key === activeKey) ?? PHOTOTHERAPY_NOMOGRAMS[0];

  const interpretation = useMemo(() => {
    const curve = selection.curve;
    if (!curve || !selection.nomogram) {
      return {
        severity: "info" as const,
        headline: "Outside these two hospital charts",
        threshold: null as number | null,
        delta: null as number | null,
        exchange: null as number | null,
        note: selection.rationale,
      };
    }

    const threshold = curveValueAt(curve, ageHours);
    const delta = Math.round((tsbUmol - threshold) * 10) / 10;
    const exchange = curve.exchange ?? null;
    const abo = aboIncompatibilityRisk(motherGroup, babyGroup);
    const rh = rhIncompatibilityRisk(motherGroup, babyGroup);
    const highRisk = abo || rh;
    const nearLine = tsbUmol >= threshold - 30;

    if (exchange != null && tsbUmol >= exchange) {
      return {
        severity: "crit" as const,
        headline: "At / above exchange threshold",
        threshold,
        delta,
        exchange,
        note: `TSB is at or above the exchange line for ${curve.label}. Start intensive phototherapy, prepare exchange transfusion and escalate immediately.`,
      };
    }
    if (tsbUmol >= threshold) {
      return {
        severity: highRisk ? ("crit" as const) : ("warn" as const),
        headline: highRisk ? "Above phototherapy line with haemolysis risk" : "Above phototherapy line",
        threshold,
        delta,
        exchange,
        note: highRisk
          ? `TSB is above the phototherapy threshold and the blood groups suggest haemolysis risk. Treat promptly and monitor more closely.`
          : `TSB is above the plotted phototherapy threshold for ${curve.label}. Start / continue phototherapy and recheck bilirubin as per unit protocol.`,
      };
    }
    if (nearLine || highRisk) {
      return {
        severity: "warn" as const,
        headline: highRisk ? "Below line but haemolysis risk present" : "Approaching phototherapy line",
        threshold,
        delta,
        exchange,
        note: highRisk
          ? `Blood groups suggest possible ABO/Rh incompatibility. Even though the TSB is below the plotted line, trend bilirubin closely and send haemolysis work-up if clinically indicated.`
          : `TSB is within 30 µmol/L of the plotted threshold. Recheck soon and ensure feeds, hydration and follow-up are clear.`,
      };
    }
    return {
      severity: "info" as const,
      headline: "Below phototherapy line",
      threshold,
      delta,
      exchange,
      note: `Current TSB plots safely below the selected hospital line. Continue monitoring and clinical review.`,
    };
  }, [ageHours, babyGroup, gestWeeks, motherGroup, selection, tsbUmol]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3 text-[11px] text-slate-300">
        <p className="font-semibold text-cyan-200">Hospital phototherapy nomograms</p>
        <p className="mt-1 leading-relaxed text-slate-400">
          Recreated bedside plotting for the two local neonatal jaundice charts: <b className="text-slate-200">MRD/090</b>
          {" "}(birth weight under 1250 g) and <b className="text-slate-200">MRD/091</b> (preterm infant under 35 weeks).
          Enter age, birth weight, TSB and blood groups to auto-select the likely chart and line.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Age in hours"
          value={ageHours}
          onChange={setAgeHours}
          min={0}
          max={240}
          unit="h"
        />
        <Field
          label="Gestation"
          value={gestWeeks}
          onChange={setGestWeeks}
          min={22}
          max={42}
          step={0.1}
          unit="weeks"
        />
        <Field
          label="Birth weight"
          value={weightGrams}
          onChange={setWeightGrams}
          min={400}
          max={5000}
          unit="g"
        />
        <Field
          label="Total serum bilirubin"
          value={tsbUmol}
          onChange={setTsbUmol}
          min={0}
          max={500}
          unit="µmol/L"
          helper={`${micromolToMgDl(tsbUmol)} mg/dL`}
        />
        <SelectField label="Mother blood group" value={motherGroup} onChange={(v) => setMotherGroup(v as BloodGroup)} />
        <SelectField label="Baby blood group" value={babyGroup} onChange={(v) => setBabyGroup(v as BloodGroup)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <div className={`rounded-2xl border p-4 ${TONE[interpretation.severity]}`}>
          <div className="flex flex-wrap items-start gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">Auto interpretation</div>
              <div className="text-lg font-black text-white">{interpretation.headline}</div>
            </div>
            <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
              {selection.nomogram ? `${selection.nomogram.shortTitle} · ${selection.curve?.symbol} ${selection.curve?.label}` : "reference only"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Metric k="Chosen chart" v={selection.nomogram?.title ?? "Use ≥35 week pathway"} />
            <Metric
              k="Threshold at this age"
              v={interpretation.threshold != null ? `${interpretation.threshold} µmol/L` : "—"}
              sub={interpretation.threshold != null ? `${micromolToMgDl(interpretation.threshold)} mg/dL` : selection.rationale}
            />
            <Metric
              k="Δ from line"
              v={interpretation.delta != null ? `${interpretation.delta > 0 ? "+" : ""}${interpretation.delta} µmol/L` : "—"}
              sub={interpretation.exchange != null ? `Exchange line ${interpretation.exchange} µmol/L` : "No exchange note stored for this line"}
            />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-current">{interpretation.note}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <div className="lbl mb-2">Blood-group risk flags</div>
          {bloodRisks.length > 0 ? (
            <div className="space-y-1.5">
              {bloodRisks.map((risk) => (
                <div key={risk} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200">
                  {risk}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No ABO / Rh incompatibility flag from the entered blood groups.</p>
          )}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-400">
            <p>
              <b className="text-slate-200">Selection logic:</b> MRD/090 is used first for birth weight under 1250 g. MRD/091
              is used for babies under 35 weeks with birth weight 1250 g or above.
            </p>
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
              className={`chip ${active ? "chip-on" : "chip-off"}`}
            >
              {chart.title}
            </button>
          );
        })}
      </div>

      <NomogramChart
        chart={activeNomogram}
        currentCurveKey={selection.nomogram?.key === activeNomogram.key ? selection.curve?.key ?? null : null}
        ageHours={ageHours}
        tsbUmol={tsbUmol}
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
    <label className="rounded-xl border border-white/10 bg-slate-900/40 p-2.5">
      <span className="lbl mb-1 block">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="inp !py-1.5 text-center text-sm font-bold"
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
    <label className="rounded-xl border border-white/10 bg-slate-900/40 p-2.5">
      <span className="lbl mb-1 block">{label}</span>
      <select className="inp !py-1.5 text-sm font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>
        {BLOOD_GROUPS.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-white">
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
}: {
  chart: PhototherapyNomogram;
  currentCurveKey: string | null;
  ageHours: number;
  tsbUmol: number;
}) {
  const width = 760;
  const height = 360;
  const pad = { top: 18, right: 18, bottom: 38, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const x = (hour: number) => pad.left + (Math.max(0, Math.min(chart.maxHours, hour)) / chart.maxHours) * innerW;
  const y = (tsb: number) => pad.top + innerH - (Math.max(0, Math.min(chart.maxTsb, tsb)) / chart.maxTsb) * innerH;
  const currentX = x(ageHours);
  const currentY = y(tsbUmol);

  const selectedCurve = chart.curves.find((c) => c.key === currentCurveKey) ?? null;
  const selectedThreshold = selectedCurve ? curveValueAt(selectedCurve, ageHours) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h3 className="text-sm font-black text-white">{chart.title}</h3>
          <p className="text-[11px] text-slate-400">{chart.subtitle}</p>
        </div>
        <div className="ml-auto rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-slate-400">
          <div>{chart.eligibility}</div>
          {chart.caution && <div className="mt-1">{chart.caution}</div>}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/50">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full">
          <rect x="0" y="0" width={width} height={height} fill="transparent" />

          {Array.from({ length: Math.floor(chart.maxHours / 24) + 1 }, (_, i) => i * 24).map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={x(tick)} y1={pad.top} x2={x(tick)} y2={height - pad.bottom} stroke="rgba(148,163,184,.15)" />
              <text x={x(tick)} y={height - 12} textAnchor="middle" fontSize="11" fill="#94a3b8">
                {tick}
              </text>
            </g>
          ))}
          {Array.from({ length: Math.floor(chart.maxTsb / 50) + 1 }, (_, i) => i * 50).map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={pad.left} y1={y(tick)} x2={width - pad.right} y2={y(tick)} stroke="rgba(148,163,184,.12)" />
              <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
                {tick}
              </text>
            </g>
          ))}

          <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="rgba(226,232,240,.35)" />
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="rgba(226,232,240,.35)" />

          {chart.curves.map((curve) => {
            const active = curve.key === currentCurveKey;
            return (
              <g key={curve.key}>
                <polyline
                  fill="none"
                  stroke={curve.color}
                  strokeWidth={active ? 4 : 2.5}
                  strokeOpacity={active ? 1 : 0.75}
                  points={curve.points.map((p) => `${x(p.hour)},${y(p.tsb)}`).join(" ")}
                />
                {curve.points.map((p, i) => (
                  <circle
                    key={`${curve.key}-${i}`}
                    cx={x(p.hour)}
                    cy={y(p.tsb)}
                    r={active ? 4 : 3}
                    fill={curve.color}
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
                      strokeWidth={1.5}
                      strokeDasharray="7 6"
                    />
                    <text x={width - pad.right - 4} y={y(curve.exchange) - 6} textAnchor="end" fontSize="11" fill="#fda4af">
                      Exchange {curve.exchange} µmol/L
                    </text>
                  </>
                )}
              </g>
            );
          })}

          <line x1={currentX} y1={pad.top} x2={currentX} y2={height - pad.bottom} stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" />
          <line x1={pad.left} y1={currentY} x2={width - pad.right} y2={currentY} stroke="rgba(255,255,255,.2)" strokeDasharray="4 4" />
          <circle cx={currentX} cy={currentY} r={6} fill="#fff" stroke="#0f172a" strokeWidth={3} />
          <text x={currentX + 10} y={Math.max(pad.top + 14, currentY - 12)} fontSize="11" fill="#e2e8f0">
            Current point · {ageHours} h / {tsbUmol} µmol/L
          </text>

          <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="12" fill="#cbd5e1">
            Age in hours
          </text>
          <text
            x="18"
            y={height / 2}
            textAnchor="middle"
            fontSize="12"
            fill="#cbd5e1"
            transform={`rotate(-90 18 ${height / 2})`}
          >
            Total serum bilirubin (µmol/L)
          </text>
        </svg>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap gap-2">
          {chart.curves.map((curve) => (
            <LegendChip key={curve.key} curve={curve} active={curve.key === currentCurveKey} />
          ))}
        </div>
        {selectedCurve && selectedThreshold != null && (
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 px-3 py-2 text-[11px] text-cyan-200">
            Selected line at {ageHours} h: <b>{selectedThreshold} µmol/L</b>
            <span className="text-cyan-100/80"> · {micromolToMgDl(selectedThreshold)} mg/dL</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendChip({ curve, active }: { curve: PhototherapyCurve; active: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] ${
        active ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 font-bold text-white">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: curve.color }} />
        <span>
          {curve.symbol} {curve.label}
        </span>
      </div>
      <div className="mt-0.5 text-slate-400">{curve.note ?? "Threshold line"}</div>
    </div>
  );
}
