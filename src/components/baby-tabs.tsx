"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Circle, Clock, Info, User, X } from "lucide-react";
import { WeightInput } from "@/components/weight-input";
import { Chip, ChipGroup, DialWithOther, NumField, Section, Stepper, api, useTempUnit } from "@/components/ui";
import { GrowthFlagsRow, LabsInterpretation, RespInterpretation, VitalsInterpretation } from "@/components/interpret-ui";
import { girFromDextrose, interpretVitals, neonatalDayFluidRange, type Flag, type VitalsInput } from "@/lib/interpret";
import { PainScoreCalculator } from "@/components/pain-scores";
import { EditableListField } from "@/components/editable-list";
import {
  ACTION_PRESETS,
  CARE_BUNDLE,
  DISCHARGE_CRITERIA,
  DRUGS,
  FEED_ROUTE,
  FEED_TYPE,
  ILLNESS,
  LAB_PANELS,
  LINES,
  PROBLEM_CATALOG,
  RESP_FIELDS,
  RESP_MODES,
  SHIFTS,
  SURFACTANT,
  SYSTEMS,
  type SystemKey,
} from "@/lib/catalog";
import type { Detail } from "@/lib/types";
import {
  calculateFluidPlan,
  calcNutrition,
  KCAL_PER_ML,
  PROTEIN_G_PER_ML,
  fmtBP,
  fmtTime,
  gainGPerKgDay,
  pctOfBirth,
  tempIn,
  tempOut,
  type Clinical,
  type DailyFluidPlan,
  type FluidPlanMode,
} from "@/lib/clinical";

function shiftTag(at: string): "Day" | "Night" {
  const h = new Date(at).getHours();
  return h >= 8 && h < 20 ? "Day" : "Night";
}

type FluidValues = NonNullable<Clinical["fluids"]>;
type FluidExtras = {
  dosingWeightKg?: number;
  dosingWeightAt?: string;
  dosingWeightConfirmedAt?: string;
  fluidDriver?: "total" | "enteral" | "iv";
  practicalIncrementMl?: number;
  dextrosePct?: number;
  ivHeld?: boolean;
  feedsHeld?: boolean;
  outputs?: { at: string; urineMl?: number; gastricAspirateMl?: number; stoolMl?: number; stool?: "none" | "small" | "moderate" | "large"; insensibleMl?: number; note?: string }[];
  baseMilkKcalPerMl?: number;
  baseMilkProteinGPer100Ml?: number;
  baseMilkCarbohydrateGPer100Ml?: number;
  baseMilkFatGPer100Ml?: number;
  targets?: { fluids?: [number, number]; energy?: [number, number]; protein?: [number, number]; gir?: [number, number]; maximumEnteralMlKgDay?: number };
  electrolyteUnit?: "mEq/kg/day" | "mmol/kg/day";
  electrolytes?: { na?: number; k?: number; ca?: number; po4?: number };
  fortifiers?: { id: string; name: string; type?: string; kcalPerUnit: number; proteinPerUnit?: number; referenceVolumeMl: number; phase: number; amount?: number; amountUnit?: "sachet" | "ml" | "g" | "scoop" | "unit" | "custom"; minimumAmount?: number; maximumAmount?: number; notes?: string; confirmed?: boolean }[];
  idealFeedVolumeMl?: number;
  practicalFeedVolumeMl?: number;
  feedsGiven?: { at: string; volumeMl: number; plannedVolumeMl?: number; intervalHours?: number; status?: "given" | "held" | "refused" | "emesis"; reason?: string }[];
  frequencyChangedAt?: string;
  previousFeedFreq?: string;
};
type FluidState = FluidValues & FluidExtras;
type ClinicalDrug = NonNullable<Clinical["drugs"]>[number];

function localDateIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function showFluid(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  // Presentation only: keep the stored/calculated number untouched, but remove
  // floating-point noise from bedside interpretation (for example 127.52000000000001).
  const rounded = Number(value.toFixed(2));
  return String(rounded);
}

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function feedIntervalHours(value?: string) {
  if (!value || value.toLowerCase() === "continuous") return undefined;
  const match = value.trim().match(/^(\d+(?:\.5)?) hourly$/i);
  return match ? Number(match[1]) : undefined;
}

function feedFrequencyLabel(hours: number) {
  return hours === 24 ? "continuous" : `${hours} hourly`;
}

type MetricStatus = "safe" | "warn" | "crit" | "neutral";
type TrendKey = "weight" | "fluids" | "kcal" | "gir" | "protein" | "enteral" | "iv";
type TrendPoint = { label: string; value: number };

const METRIC_RING: Record<MetricStatus, string> = {
  safe: "border-emerald-400 bg-emerald-400/10 text-emerald-100",
  warn: "border-amber-400 bg-amber-400/10 text-amber-100",
  crit: "border-rose-400 bg-rose-400/10 text-rose-100",
  neutral: "border-slate-500 bg-white/5 text-slate-100",
};

function rangeStatus(value: number, low: number, high: number): MetricStatus {
  if (!Number.isFinite(value) || value <= 0) return "neutral";
  if (value < low * 0.8 || value > high * 1.2) return "crit";
  if (value < low || value > high) return "warn";
  return "safe";
}

function trendFor(
  entries: NonNullable<Clinical["growth"]>,
  key: "fluids" | "kcal",
  current: number,
): TrendPoint[] {
  const historic = entries
    .filter((entry) => typeof entry[key] === "number" && Number.isFinite(entry[key]))
    .slice(-6)
    .map((entry) => ({ label: entry.at.slice(0, 10), value: Number(entry[key]) }));
  return [...historic, { label: "Today", value: current }];
}

function Sparkline({ points, color, label, onClick }: { points: TrendPoint[]; color: string; label: string; onClick: () => void }) {
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  const plotted = values.length === 1 ? [values[0], values[0]] : values;
  const min = plotted.length ? Math.min(...plotted) : 0;
  const max = plotted.length ? Math.max(...plotted) : 1;
  const span = max - min || 1;
  const coords = plotted.map((value, index) => {
    const x = plotted.length === 1 ? 60 : (index / (plotted.length - 1)) * 120;
    const y = 27 - ((value - min) / span) * 21;
    return `${x},${y}`;
  }).join(" ");
  return (
    <button type="button" onClick={onClick} className="group rounded-lg p-1 text-left" title={`Show ${label} day-by-day`} aria-label={`Show ${label} trend`}>
      <svg viewBox="0 0 120 32" className="h-8 w-[112px] overflow-visible" role="img" aria-hidden>
        <line x1="0" y1="28" x2="120" y2="28" stroke="rgba(148,163,184,.18)" />
        {coords && <polyline points={coords} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {plotted.length === 1 && <circle cx="60" cy="27" r="3" fill={color} />}
      </svg>
      <span className="block text-[9px] text-slate-500 group-hover:text-slate-300">tap trend</span>
    </button>
  );
}

function FormulaValue({ children, onOpen, className = "" }: { children: React.ReactNode; onOpen: () => void; className?: string }) {
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    clear();
    timer.current = window.setTimeout(onOpen, 550);
  };
  return (
    <button
      type="button"
      className={`cursor-help rounded px-0.5 text-left underline decoration-dotted underline-offset-2 hover:bg-white/10 ${className}`}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => { clear(); onOpen(); }}
      title="Tap or hold to see the formula"
    >
      {children}
    </button>
  );
}

function CompactPicker({
  label,
  value,
  options,
  onChange,
  otherPlaceholder,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  onChange: (value: string) => void;
  otherPlaceholder: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [other, setOther] = useState("");
  const select = (next: string) => {
    onChange(next);
    setOther("");
    setExpanded(false);
  };
  const addOther = () => {
    const next = other.trim();
    if (next) select(next);
  };
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="min-w-0 truncate text-xs font-bold text-slate-200">
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}: </span>
          <span className="text-cyan-100">{value || "Select"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-cyan-300 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-white/10 p-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => select(option)}
                className={`min-h-10 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${value === option ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-400/40"}`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              className="inp min-h-10 flex-1 text-xs"
              value={other}
              onChange={(event) => setOther(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addOther(); }}
              placeholder={otherPlaceholder}
              aria-label={`${label} other value`}
            />
            <button type="button" className="btn-ghost min-h-10 shrink-0" onClick={addOther} disabled={!other.trim()}>Use other</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  status,
  trend,
  trendKey,
  onTrend,
  formula,
  onFormula,
  secondary,
  stateText,
  targetText,
}: {
  label: string;
  value: number;
  unit: string;
  status: MetricStatus;
  trend: TrendPoint[];
  trendKey: TrendKey;
  onTrend: (key: TrendKey) => void;
  formula: string;
  onFormula: (title: string, formula: string) => void;
  secondary?: string;
  stateText?: string;
  targetText?: string;
}) {
  const ring = METRIC_RING[status];
  const statusLabel = status === "safe" ? "In target" : status === "warn" ? "Review range" : status === "crit" ? "Outside target" : "Not started";
  const secondaryText = value > 0 ? secondary : stateText || "Add required inputs";
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 shadow-lg shadow-black/10">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span><span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>{targetText && <span className="ml-2 text-[9px] font-normal normal-case tracking-normal text-slate-500">Target {targetText}</span>}</span>
        <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className={`h-3 w-3 shrink-0 rounded-full border-2 ${ring}`} aria-hidden />{statusLabel}</span>
      </div>
      <div className="flex items-end justify-between gap-1">
        <div className="min-w-0">
          <FormulaValue onOpen={() => onFormula(label, formula)} className={`block font-black leading-none text-white ${stateText ? "text-[11px] leading-tight" : "text-2xl tabular-nums sm:text-3xl"}`}>
            {stateText || (value > 0 ? showFluid(value) : "—")}
          </FormulaValue>
          <span className="mt-1 block text-[10px] text-slate-500">{unit}</span>
          {secondaryText && <span className="mt-1 block text-[10px] font-semibold text-slate-400">{secondaryText}</span>}
        </div>
        <Sparkline points={trend} color={status === "warn" ? "#fbbf24" : status === "crit" ? "#fb7185" : "#34d399"} label={label} onClick={() => onTrend(trendKey)} />
      </div>
    </div>
  );
}

function isoFromDateTimeInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Save a tab's draft after the clinician pauses, so changing tabs cannot lose it. */
function useAutoSave(save: () => void | Promise<void>, watch: unknown) {
  const saveRef = useRef(save);
  const dirtyRef = useRef(false);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    dirtyRef.current = true;
    const run = async () => {
      try {
        await saveRef.current();
        dirtyRef.current = false;
      } catch {
        // Keep the draft marked dirty; the next edit will retry the save.
      }
    };
    const timer = window.setTimeout(() => void run(), 1000);
    return () => window.clearTimeout(timer);
  }, [watch]);
  useEffect(() => () => {
    if (!dirtyRef.current) return;
    void (async () => {
      try {
        await saveRef.current();
      } catch {
        // The next visit can retry if the network was unavailable.
      }
    })();
  }, []);
}

function therapyDay(drug: ClinicalDrug, asOf = new Date()) {
  if (drug.dayOverride !== undefined && Number.isFinite(drug.dayOverride)) return Math.max(1, Math.round(drug.dayOverride));
  if (drug.startedAt) {
    const started = new Date(drug.startedAt).getTime();
    if (Number.isFinite(started)) return Math.max(1, Math.floor((asOf.getTime() - started) / 86400000) + 1);
  }
  return Math.max(1, Math.round(drug.day ?? 1));
}

export function VitalsTab({
  d,
  id,
  reload,
  user,
  patch,
}: {
  d: Detail;
  id: string;
  reload: () => void;
  user: string;
  patch: (b: Record<string, unknown>) => Promise<void>;
}) {
  const last = d.vitals[0] ?? {};
  const { unit } = useTempUnit();
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [hc, setHc] = useState<number | undefined>(undefined);
  const [length, setLength] = useState<number | undefined>(undefined);
  const [painScale, setPainScale] = useState(String(last.painScale ?? "NIPS"));
  const [painRaw, setPainRaw] = useState(Number(last.painRaw ?? last.painScore ?? 0));
  const [v, setV] = useState<Record<string, number>>({
    hr: Number(last.hr ?? 140),
    rr: Number(last.rr ?? 45),
    spo2: Number(last.spo2 ?? 96),
    spo2Post: Number(last.spo2Post ?? 96),
    temp: Number(last.temp ?? 36.8),
    sbp: Number(last.sbp ?? 60),
    dbp: Number(last.dbp ?? 35),
    map: Number(last.map ?? 43),
    crt: Number(last.crt ?? 2),
    rbs: Number(last.rbs ?? 80),
    fio2: Number(last.fio2 ?? 21),
    painScore: Number(last.painScore ?? 0),
    urineMlKgHr: Number(last.urineMlKgHr ?? 2),
  });
  const [saving, setSaving] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const set = (k: string) => (n: number) => setV((p) => ({ ...p, [k]: n }));
  const useKg = d.baby.unit !== "nicu";

  const saveVitals = useCallback(async () => {
    setSaving(true);
    // Auto-derive MAP from SBP/DBP when not entered, so BP always stores fully.
    const autoMap =
      v.map != null && v.map !== 0
        ? v.map
        : v.sbp != null && v.dbp != null
          ? Math.round((v.sbp + 2 * v.dbp) / 3)
          : undefined;
    try {
      await api(`/api/babies/${id}/vitals`, "POST", {
        ...v,
        map: autoMap,
        painScale,
        painRaw,
        painScore: Math.round(painRaw),
        recordedBy: user || "Nurse",
      });
    } finally {
      setSaving(false);
    }
  }, [id, painRaw, painScale, user, v]);

  // Keep parameter entry safe when the clinician changes tabs without pressing
  // the button. The debounce groups a round of edits into one observation.
  useAutoSave(saveVitals, v);

  useAutoSave(async () => {
    if (weight === undefined) return;
    const grams = useKg ? Math.round(weight * 1000) : Math.round(weight);
    const existingGrowth = d.baby.clinical?.growth ?? [];
    const lastGrowth = existingGrowth.at(-1);
    const sameAsLast = lastGrowth?.weight === grams && lastGrowth.hc === hc && lastGrowth.length === length;
    const growth = sameAsLast
      ? existingGrowth
      : [...existingGrowth, { at: new Date().toISOString(), weight: grams, hc, length }];
    await patch({
      currentWeight: grams,
      clinical: { growth, ...(length ? { birthLength: length } : {}) },
    });
  }, `${weight ?? ""}|${hc ?? ""}|${length ?? ""}`);

  const submit = async () => {
    await saveVitals();
    if (weight) {
      const grams = useKg ? Math.round(weight * 1000) : Math.round(weight);
      const growth = [...(d.baby.clinical?.growth ?? []), { at: new Date().toISOString(), weight: grams, hc, length }];
      await patch({
        currentWeight: grams,
        clinical: { growth, ...(length ? { birthLength: length } : {}) },
        logEvent: {
          kind: "growth",
          text: `Daily weight ${useKg ? `${weight} kg` : `${grams} g`} recorded${hc ? `, HC ${hc} cm` : ""} during observation round`,
          author: user,
        },
      });
    }
    reload();
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Section
          title="Quick observation round"
          sub="Pre-filled with the last set — tap ± only for what changed, then save."
          right={
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span>
              <button onClick={submit} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save observations"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stepper label="Heart rate /min" value={v.hr} onChange={set("hr")} min={40} max={240} step={2} />
            <Stepper label="Resp rate /min" value={v.rr} onChange={set("rr")} min={10} max={110} step={2} />
            <Stepper label="SpO₂ pre-ductal %" value={v.spo2} onChange={set("spo2")} min={40} max={100} />
            <Stepper label="SpO₂ post-ductal %" value={v.spo2Post} onChange={set("spo2Post")} min={40} max={100} />
            <Stepper
              label={`Temp °${unit}`}
              value={tempOut(v.temp, unit) ?? 0}
              onChange={(n) => set("temp")(tempIn(n, unit))}
              min={89.6}
              max={104}
              step={0.1}
              decimals={1}
            />
            <Stepper label="Systolic BP" value={v.sbp} onChange={set("sbp")} min={20} max={160} />
            <Stepper label="Diastolic BP" value={v.dbp} onChange={set("dbp")} min={10} max={120} />
            <Stepper label="MAP mmHg" value={v.map} onChange={set("map")} min={15} max={130} />
            <Stepper label="CRT sec" value={v.crt} onChange={set("crt")} min={1} max={8} />
            <Stepper label="RBS mg/dL" value={v.rbs} onChange={set("rbs")} min={10} max={400} step={5} />
            <Stepper label="FiO₂ %" value={v.fio2} onChange={set("fio2")} min={21} max={100} step={5} />
            <Stepper label={`Pain score (${painScale})`} value={painRaw} onChange={(n) => { setPainRaw(n); set("painScore")(n); }} min={painScale === "N-PASS" ? -10 : 0} max={painScale === "PIPP" ? 21 : painScale === "N-PASS" ? 11 : painScale === "CRIES" ? 10 : 7} step={1} />
            <Stepper label="Urine ml/kg/hr" value={v.urineMlKgHr} onChange={set("urineMlKgHr")} min={0} max={8} step={0.1} decimals={1} />
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 px-3 py-1.5">
            <span className="lbl">Blood pressure</span>
            <span className="text-base font-black tabular-nums text-cyan-200">
              {fmtBP(v.sbp, v.dbp, v.map)}
            </span>
            <span className="text-[10px] text-slate-400">mmHg · systolic/diastolic (MAP)</span>
          </div>
          {d.baby.unit === "nicu" && (
            <div className="mt-3 overflow-hidden rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/5">
              <button
                type="button"
                onClick={() => setPainOpen((open) => !open)}
                aria-expanded={painOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span>
                  <span className="block text-xs font-bold text-fuchsia-100">NICU pain-score calculator</span>
                  <span className="text-[10px] text-slate-400">
                    Current score: {painScale} {painRaw}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-fuchsia-200 transition-transform ${painOpen ? "rotate-180" : ""}`} />
              </button>
              {painOpen && (
                <div className="border-t border-fuchsia-400/15 p-2">
                  <PainScoreCalculator
                    onCompute={(scale, total) => {
                      setPainScale(scale);
                      setPainRaw(total);
                      set("painScore")(total);
                      window.dispatchEvent(
                        new CustomEvent("neo:saved", {
                          detail: `Pain score ${scale} = ${total} applied to observation`,
                        }),
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <div className="mt-3">
            <VitalsInterpretation baby={d.baby} v={v} painScale={painScale} painRaw={painRaw} />
          </div>
          <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-2">
            <div className="lbl mb-1.5">
              Serial anthropometry — {d.baby.unit === "nicu" ? "daily weight · weekly HC & length" : d.baby.unit === "postnatal" ? "daily weight" : "weight on admission & weekly"}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <WeightInput
                label={`Weight ${useKg ? "(kg)" : "(g)"}`}
                valueGrams={weight != null ? (useKg ? Math.round(weight * 1000) : weight) : undefined}
                onChangeGrams={(g) => setWeight(useKg ? g / 1000 : g)}
                neonatal={!useKg}
              />
              <NumField label="Head circumference (cm)" value={hc} onChange={setHc} min={20} max={60} step={0.5} decimals={1} />
              <NumField label="Length / height (cm)" value={length} onChange={setLength} min={20} max={200} step={0.5} decimals={1} />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">
              Weigh on the same scale, same time, minimal clothing. HC and {useKg ? "length" : "height"} weekly or on
              admission. Values save with the observation round and feed the growth chart.
            </p>
          </div>
        </Section>
      </div>
      <Section title="Observation log" sub="Most recent entries">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-slate-900/90 text-slate-400">
              <tr>
                <th className="p-1">Time</th>
                <th>HR</th>
                <th>RR</th>
                <th>SpO₂</th>
                <th>T °F</th>
                <th>BP sbp/dbp (map)</th>
                <th>RBS</th>
                <th>Pain</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {d.vitals.map((r) => (
                <tr key={String(r.id)} className="border-t border-white/5">
                  <td className="p-1 text-slate-400">{fmtTime(r.recordedAt as string)}</td>
                  <td>{r.hr ?? "—"}</td>
                  <td>{r.rr ?? "—"}</td>
                  <td>{r.spo2 ?? "—"}</td>
                  <td>{tempOut(r.temp as number | null, unit) ?? "—"}</td>
                  <td className="whitespace-nowrap">{fmtBP(r.sbp as number | null, r.dbp as number | null, r.map as number | null)}</td>
                  <td>{r.rbs ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {r.painRaw ?? r.painScore ?? "—"}
                    {(r.painScale as string | null) && (
                      <span className="ml-0.5 text-[9px] text-slate-500">{String(r.painScale)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

export function RespTab({
  d,
  patch,
  user,
}: {
  d: Detail;
  patch: (b: Record<string, unknown>) => Promise<void>;
  user: string;
}) {
  const resp = d.baby.clinical?.resp ?? {};
  const [s, setS] = useState({ ...resp, settings: { ...(resp.settings ?? {}) } });
  const setSetting = (k: string) => (n: number) => setS((p) => ({ ...p, settings: { ...p.settings, [k]: n } }));
  const pao2 = (() => {
    const labs = d.baby.clinical?.labs ?? {};
    const raw = labs["pO2"] ?? labs["PaO2"];
    const n = raw == null ? null : Number(String(raw).replace(/[^0-9.]/g, ""));
    return n != null && Number.isFinite(n) ? n : null;
  })();
  useAutoSave(() => patch({ clinical: { resp: s } }), s);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section
        title="Respiratory support"
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span>
            <button
              className="btn-primary"
              onClick={() =>
                patch({
                  clinical: { resp: s },
                  logEvent: { kind: "resp", text: `Respiratory support: ${s.mode} FiO₂ ${s.settings?.fio2 ?? 21}%`, author: user },
                })
              }
            >
              Save support
            </button>
          </div>
        }
      >
        <div className="lbl mb-1">Mode</div>
        <DialWithOther options={RESP_MODES} value={s.mode} onChange={(v: string) => setS((p) => ({ ...p, mode: v }))} otherPlaceholder="Other mode…" />
        <div className="lbl mt-4 mb-1">Settings</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {RESP_FIELDS.map((f) => (
            <NumField
              key={f.key}
              label={f.label}
              value={s.settings?.[f.key] ?? undefined}
              onChange={setSetting(f.key)}
              min={f.min}
              max={f.max}
              step={f.step}
              decimals={f.step < 1 ? 2 : 0}
              placeholder="enter"
            />
          ))}
        </div>
        <div className="lbl mt-4 mb-1">Surfactant</div>
        <DialWithOther options={SURFACTANT} value={s.surfactant} onChange={(v: string) => setS((p) => ({ ...p, surfactant: v }))} otherPlaceholder="Other surfactant route…" />
        <div className="lbl mt-4 mb-1">SpO₂ target</div>
        <ChipGroup
          options={["88–92%", "90–95%", "91–95%", "92–97%", "95–100%"]}
          value={s.spo2Target}
          onChange={(v: string) => setS((p) => ({ ...p, spo2Target: v }))}
        />
        <div className="mt-3">
          <RespInterpretation
            map={(s.settings?.map as number | null) ?? null}
            fio2={(s.settings?.fio2 as number | null) ?? null}
            pao2={pao2}
            silverman={(s.silverman as number | null) ?? null}
            mode={s.mode}
          />
        </div>
      </Section>
      <Section title="Respiratory reference (NNF / AAP)">
        <ul className="space-y-2 text-xs text-slate-300">
          <li>• CPAP failure: FiO₂ &gt; 0.40 with PEEP 6–7, pH &lt; 7.20 with pCO₂ &gt; 60 → intubate + surfactant.</li>
          <li>• Target SpO₂ 90–95% for preterm on oxygen (AAP/NNF).</li>
          <li>• Caffeine citrate for all &lt; 32 wk / &lt; 1250 g.</li>
        </ul>
      </Section>
    </div>
  );
}

export function FluidsTab({ d, patch, user = "", role = "" }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<unknown>; user?: string; role?: string }) {
  const f = d.baby.clinical?.fluids ?? {};
  const initialFluid = f as FluidState;
  const serverFluidSignature = JSON.stringify(d.baby.clinical?.fluids ?? {});
  const latestGrowthWeight = [...(d.baby.clinical?.growth ?? [])].at(-1)?.weight;
  const defaultDosingWeight = initialFluid.dosingWeightKg ?? (latestGrowthWeight ?? d.baby.currentWeight) / 1000;
  const initialWeightValid = Number.isFinite(defaultDosingWeight) && defaultDosingWeight >= 0.3 && defaultDosingWeight <= 6;
  const [s, setS] = useState<FluidState>({ ...initialFluid });
  const [dosingWeightKg, setDosingWeightKg] = useState(defaultDosingWeight);
  const [weightDraft, setWeightDraft] = useState(String(defaultDosingWeight));
  const [weightError, setWeightError] = useState("");
  const [weightAction, setWeightAction] = useState<"start" | "advance" | "update" | null>(initialWeightValid ? null : "start");
  const [advanceApplying, setAdvanceApplying] = useState(false);
  const [advanceConfirming, setAdvanceConfirming] = useState(false);
  const [advanceWeightConfirmed, setAdvanceWeightConfirmed] = useState(false);
  const [advanceUnit, setAdvanceUnit] = useState<"per-day" | "per-feed" | null>(null);
  const [advanceSection, setAdvanceSection] = useState<"enteral" | "iv">("enteral");
  const [advanceDraft, setAdvanceDraft] = useState("");
  const [dextroseDraft, setDextroseDraft] = useState(initialFluid.dextrosePct == null ? "" : String(initialFluid.dextrosePct));
  const [dextroseError, setDextroseError] = useState("");
  const [feedLogVolume, setFeedLogVolume] = useState("");
  const [feedLogStatus, setFeedLogStatus] = useState<"given" | "held" | "refused" | "emesis">("given");
  const [feedLogReason, setFeedLogReason] = useState("");
  const [conflict, setConflict] = useState("");
  const [fluidDriver, setFluidDriver] = useState<"total" | "enteral" | "iv">(initialFluid.fluidDriver ?? "total");
  const [reconciliationNotice, setReconciliationNotice] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendKey | null>(null);
  const [trendWindow, setTrendWindow] = useState<"24h" | "3d" | "7d" | "custom">("24h");
  const [formula, setFormula] = useState<{ title: string; text: string } | null>(null);
  const [densityMode, setDensityMode] = useState<"guided" | "compact">("guided");
  const [planCheckOpen, setPlanCheckOpen] = useState(false);
  const [moduleView, setModuleView] = useState<"today" | "wizard" | "advanced">(() => {
    if (typeof window === "undefined") return "today";
    return window.localStorage.getItem(`srh:fluids:view:${user || role || "viewer"}`) === "advanced" ? "advanced" : "today";
  });
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardBaseline, setWizardBaseline] = useState<FluidState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [targetChangePending, setTargetChangePending] = useState("");
  const [outputDraft, setOutputDraft] = useState({ urineMl: "", gastricAspirateMl: "", stoolMl: "", stool: "none" as "none" | "small" | "moderate" | "large", insensibleMl: "", note: "" });
  const [outputNow] = useState(() => Date.now());
  const canModify = /admin|consultant|registrar|postgraduate|resident/i.test(role);
  const canLogFeed = canModify || /nurse/i.test(role);
  const viewStorageKey = `srh:fluids:view:${user || role || "viewer"}`;
  const rememberView = (view: "today" | "wizard" | "advanced") => {
    setModuleView(view);
    if (typeof window !== "undefined") window.localStorage.setItem(viewStorageKey, view === "advanced" ? "advanced" : "today");
  };
  const startWizard = () => {
    if (!canModify) return;
    setWizardBaseline({ ...s });
    setWizardStep(1);
    setHelpOpen(false);
    setModuleView("wizard");
  };
  const discardWizard = () => {
    if (wizardBaseline) setS(wizardBaseline);
    setWizardBaseline(null);
    setWizardStep(1);
    setModuleView("today");
  };
  const expectedUpdatedAtRef = useRef(d.baby.updatedAt);
  const patchFluid = async (body: Record<string, unknown>) => {
    const result = await patch({ ...body, expectedUpdatedAt: expectedUpdatedAtRef.current });
    const typed = result as { conflict?: boolean; error?: string; baby?: { updatedAt?: string } } | undefined;
    if (typed?.conflict || typed?.error) {
      setConflict(typed?.conflict ? "Another clinician saved a newer fluid plan. Reload it before making or applying further changes." : typed?.error || "This fluid change was not saved. Reload before retrying.");
      return false;
    }
    if (typed?.baby?.updatedAt) expectedUpdatedAtRef.current = typed.baby.updatedAt;
    if ((body.clinical as { fluids?: unknown } | undefined)?.fluids) lastServerFluidRef.current = JSON.stringify((body.clinical as { fluids: unknown }).fluids);
    return true;
  };
  const dosingWeightValid = Number.isFinite(dosingWeightKg) && dosingWeightKg >= 0.3 && dosingWeightKg <= 6;
  const dosingWeightConfirmed = dosingWeightValid && weightAction === null;
  const activeWeightKg = dosingWeightConfirmed ? dosingWeightKg : 0;
  const dailyMode = s.plan?.mode === "daily";
  const latestWeightEntry = [...(d.baby.clinical?.growth ?? [])].at(-1);
  const weightRecordLabel = initialFluid.dosingWeightAt ?? latestWeightEntry?.at ?? d.baby.updatedAt;
  const advanceDayNow = () => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: (p.plan?.day ?? 1) + 1, holdToday: false } }));
  const confirmDosingWeight = () => {
    const next = Number(weightDraft);
    if (!Number.isFinite(next) || next < 0.3 || next > 6) {
      setWeightError(next >= 100 ? "This looks unusually high for a NICU patient. Enter dosing weight in kilograms, e.g. 1.42 kg." : "Check this weight — outside expected range for a NICU patient (0.3–6 kg).");
      return;
    }
    if (!canModify) return;
    setWeightError("");
    setDosingWeightKg(next);
    setS((p) => ({ ...p, dosingWeightKg: next, dosingWeightAt: new Date().toISOString(), dosingWeightConfirmedAt: new Date().toISOString() }));
    if (weightAction === "advance") {
      advanceDayNow();
    }
    setWeightAction(null);
  };
  const currentTotal = Number(s.totalMlKgDay ?? 0);
  const currentEnteral = Number(s.enteralMlKgDay ?? 0);
  const currentIv = Number(s.ivMlKgDay ?? 0);
  const mismatch = !dailyMode && Math.abs(currentEnteral + currentIv - currentTotal) > 0.01;
  const planLimitError = dailyMode && ((s.plan?.enteral?.minimumMlKgDay ?? 0) > (s.plan?.enteral?.maximumMlKgDay ?? 300) || (s.plan?.iv?.minimumMlKgDay ?? 0) > (s.plan?.iv?.maximumMlKgDay ?? 300));
  const volumeInputs = [s.totalMlKgDay, s.enteralMlKgDay, s.ivMlKgDay, s.feedVol, s.plan?.enteral?.startMlKgDay, s.plan?.enteral?.minimumMlKgDay, s.plan?.enteral?.maximumMlKgDay, s.plan?.iv?.startMlKgDay, s.plan?.iv?.minimumMlKgDay, s.plan?.iv?.maximumMlKgDay];
  const volumeInvalid = volumeInputs.some((value) => value != null && (!Number.isFinite(value) || value < 0));
  const volumeValidationWarning = volumeInvalid ? "Volumes cannot be negative or non-numeric — correct the entered values before applying." : "";
  const commitFixedFluids = (total: number, enteral: number, iv: number, driver: "total" | "enteral" | "iv") => {
    setS((p) => ({ ...p, totalMlKgDay: total, enteralMlKgDay: enteral, ivMlKgDay: iv, fluidDriver: driver }));
    setFluidDriver(driver);
    setReconciliationNotice("");
  };
  const updateFixedFluid = (field: "total" | "enteral" | "iv", next: number) => {
    if (!canModify) return;
    if (!Number.isFinite(next) || next < 0) { setReconciliationNotice("Fluid values cannot be negative or non-numeric. Correct the entered value before continuing."); return; }
    const total = currentTotal || currentEnteral + currentIv;
    if (field === "total") {
      const previousSum = currentEnteral + currentIv;
      const ratio = previousSum > 0 ? next / previousSum : 0;
      commitFixedFluids(next, previousSum > 0 ? currentEnteral * ratio : 0, previousSum > 0 ? currentIv * ratio : next, "total");
    } else if (field === "enteral") {
      if (next > total) {
        setReconciliationNotice(`Enteral ${showFluid(next)} cannot exceed Total ${showFluid(total)} ml/kg/day.`);
        return;
      }
      commitFixedFluids(total, next, total - next, "enteral");
    } else {
      if (next > total) {
        setReconciliationNotice(`IV/TPN ${showFluid(next)} cannot exceed Total ${showFluid(total)} ml/kg/day.`);
        return;
      }
      commitFixedFluids(total, total - next, next, "iv");
    }
  };
  const autoFixReconciliation = () => {
    const sum = currentEnteral + currentIv;
    if (currentTotal <= 0 || sum <= 0) {
      commitFixedFluids(Math.max(currentTotal, sum), currentEnteral, Math.max(0, currentTotal - currentEnteral), "total");
      return;
    }
    const ratio = currentTotal / sum;
    commitFixedFluids(currentTotal, currentEnteral * ratio, currentIv * ratio, "total");
  };
  const rawSnapshot = calculateFluidPlan(s, activeWeightKg);
  const snapshot = activeWeightKg > 0 ? rawSnapshot : { ...rawSnapshot, enteralMlDay: undefined, ivMlDay: undefined, totalMlDay: undefined, feedMl: undefined, feedMlPerHour: undefined };
  const dextrosePct = s.dextrosePct;
  const dextroseValid = dextrosePct != null && Number.isFinite(dextrosePct) && dextrosePct >= 5 && dextrosePct <= 30;
  const ivHeld = Boolean(s.ivHeld);
  const feedsHeld = Boolean(s.feedsHeld);
  const derivedGir = dextroseValid && !ivHeld && (snapshot.ivMlKgDay ?? 0) > 0 ? girFromDextrose(dextrosePct, snapshot.ivMlKgDay ?? 0) : 0;
  const nutritionFluids: FluidState = {
    ...s,
    enteralMlKgDay: feedsHeld ? 0 : snapshot.enteralMlKgDay,
    ivMlKgDay: snapshot.ivMlKgDay,
    totalMlKgDay: snapshot.totalMlKgDay,
    gir: derivedGir,
  };
  const nutrition = calcNutrition({ fluids: nutritionFluids });
  const fortifiers = s.fortifiers ?? [];
  const feedIsContinuous = snapshot.feedMlPerHour !== undefined;
  const idealFeedVolume = snapshot.feedMl ?? (feedIsContinuous ? snapshot.feedMlPerHour : s.feedVol) ?? 0;
  const practicalIncrement = s.practicalIncrementMl ?? (activeWeightKg > 0 && activeWeightKg < 1.5 ? 0.1 : 1);
  const practicalFeedVolume = idealFeedVolume > 0 && practicalIncrement > 0 ? Number((Math.round(idealFeedVolume / practicalIncrement) * practicalIncrement).toPrecision(12)) : 0;
  const practicalSplit = !feedIsContinuous && snapshot.feedsPerDay && snapshot.feedsPerDay % 1 !== 0 && snapshot.enteralMlDay != null && practicalFeedVolume > 0 ? (() => { const regularCount = Math.floor(snapshot.feedsPerDay); const remainder = Number((snapshot.enteralMlDay - regularCount * practicalFeedVolume).toPrecision(12)); return { regularCount, remainder }; })() : undefined;
  const fortifierWarnings = fortifiers.filter((fortifier) => fortifier.referenceVolumeMl > 0 && idealFeedVolume > 0 && Math.abs(fortifier.referenceVolumeMl - idealFeedVolume) > 0.01).map((fortifier) => `${fortifier.name} dose was set for ${showFluid(fortifier.referenceVolumeMl)} ml feeds — current feed is ${showFluid(idealFeedVolume)} ml. Confirm fortifier amount is still correct.`);
  const fortifierValidationWarnings = fortifiers.filter((fortifier) => !fortifier.name.trim() || !Number.isFinite(fortifier.kcalPerUnit) || fortifier.kcalPerUnit < 0 || !Number.isFinite(fortifier.referenceVolumeMl) || fortifier.referenceVolumeMl <= 0 || !Number.isFinite(fortifier.phase) || fortifier.phase < 0 || fortifier.phase > 1.5 || !Number.isFinite(fortifier.amount ?? 1) || (fortifier.amount ?? 1) < (fortifier.minimumAmount ?? 0) || (fortifier.amount ?? 1) > (fortifier.maximumAmount ?? 1.5)).map((fortifier) => `${fortifier.name || "Unnamed fortifier"}: amount must be between ${showFluid(fortifier.minimumAmount ?? 0)} and ${showFluid(fortifier.maximumAmount ?? 1.5)} ${fortifier.amountUnit ?? "unit"}; phase must be 0–1.5 and reference volume must be > 0 ml.`);
  const fortifierReferencePending = fortifiers.some((fortifier) => fortifier.referenceVolumeMl > 0 && idealFeedVolume > 0 && Math.abs(fortifier.referenceVolumeMl - idealFeedVolume) > 0.01 && !fortifier.confirmed);
  const hasFortifierValidationError = fortifierValidationWarnings.length > 0;
  const fortifierPhaseLabel = (phase: number) => phase === 1 ? "Full" : phase === 0.75 ? "¾" : phase === 0.5 ? "½" : phase === 0.25 ? "¼" : showFluid(phase);
  const fortifierAmountLabel = (fortifier: NonNullable<FluidExtras["fortifiers"]>[number]) => fortifier.amount == null || fortifier.amount === 1 && !fortifier.amountUnit ? "" : ` ${showFluid(fortifier.amount ?? 1)} ${fortifier.amountUnit ?? "unit"}`;
  const mctFortifiers = fortifiers.filter((fortifier) => /mct/i.test(`${fortifier.type ?? ""} ${fortifier.name}`));
  const mctMlPerFeed = mctFortifiers.reduce((sum, fortifier) => sum + (fortifier.amountUnit === "ml" ? Number(fortifier.amount ?? 0) * fortifier.phase : 0), 0);
  const mctMlPerDay = snapshot.feedsPerDay ? mctMlPerFeed * snapshot.feedsPerDay : 0;
  const fortifierSummary = fortifiers.length ? `${showFluid(idealFeedVolume)} ml ${s.feedType || "milk"} + ${fortifiers.map((fortifier) => /mct/i.test(`${fortifier.type ?? ""} ${fortifier.name}`) ? `${fortifier.name} ${showFluid(fortifier.amount ?? 0)} ${fortifier.amountUnit ?? "ml"}` : `${fortifier.name} ${fortifierPhaseLabel(fortifier.phase)}${fortifierAmountLabel(fortifier)}`).join(" + ")}` : `${showFluid(idealFeedVolume)} ml ${s.feedType || "milk"}`;
  const totalFluid = snapshot.totalMlKgDay ?? s.totalMlKgDay ?? 0;
  const enteralFluidValue = snapshot.enteralMlKgDay ?? s.enteralMlKgDay ?? 0;
  const ivFluidValue = snapshot.ivMlKgDay ?? s.ivMlKgDay ?? 0;
  const fluidBarTotal = Math.max(totalFluid, enteralFluidValue + ivFluidValue, 0);
  const enteralBarPercent = fluidBarTotal > 0 ? Math.min(100, (enteralFluidValue / fluidBarTotal) * 100) : 0;
  const enteralSharePercent = totalFluid > 0 ? Math.min(100, Math.max(0, (enteralFluidValue / totalFluid) * 100)) : 0;
  const fluidRange = s.targets?.fluids ?? neonatalDayFluidRange(d.baby);
  const girRange = s.targets?.gir ?? [4, 12];
  const fluidStatus = rangeStatus(totalFluid, fluidRange[0], fluidRange[1]);
  const kcalStatus = rangeStatus(nutrition.totalKcal, nutrition.kcalTarget[0], nutrition.kcalTarget[1]);
  const ivNotStarted = (snapshot.ivMlKgDay ?? 0) <= 0;
  const feedsNotStarted = (snapshot.enteralMlKgDay ?? 0) <= 0;
  const girStatus = dextroseValid && !ivHeld && !ivNotStarted ? rangeStatus(nutrition.gir, girRange[0], girRange[1]) : "neutral";
  const girStateText = ivHeld ? "IV/TPN held — GIR suspended" : ivNotStarted ? "IV/TPN not yet started" : !dextroseValid ? "Add dextrose % to calculate GIR" : undefined;
  const energyStateText = ivHeld && feedsHeld ? "IV/TPN held · feeds on hold" : ivHeld ? "IV/TPN held — GIR suspended" : feedsHeld ? "Feeds on hold — enteral calories paused" : feedsNotStarted && ivNotStarted ? "Feeds and IV/TPN not yet started" : !dextroseValid && !ivNotStarted ? "Add dextrose % for complete energy" : undefined;
  const growthEntries = d.baby.clinical?.growth ?? [];
  const trends: Record<TrendKey, { label: string; unit: string; points: TrendPoint[] }> = {
    weight: { label: "Dosing weight", unit: "kg", points: [{ label: "Today", value: activeWeightKg }] },
    fluids: { label: "Total fluids", unit: "ml/kg/day", points: trendFor(growthEntries, "fluids", totalFluid) },
    kcal: { label: "Energy", unit: "kcal/kg/day", points: trendFor(growthEntries, "kcal", nutrition.totalKcal) },
    // GIR is not part of the existing growth snapshot data model. Show today's
    // value honestly until a prior GIR snapshot exists rather than inventing data.
    gir: { label: "GIR", unit: "mg/kg/min", points: [{ label: "Today", value: nutrition.gir }] },
    protein: { label: "Protein", unit: "g/kg/day", points: [{ label: "Today", value: nutrition.totalProtein }] },
    enteral: { label: "Enteral", unit: "ml/kg/day", points: [{ label: "Today", value: enteralFluidValue }] },
    iv: { label: "IV/TPN", unit: "ml/kg/day", points: [{ label: "Today", value: ivFluidValue }] },
  };
  const feedsGivenToday = (s.feedsGiven ?? []).filter((feed) => feed.at.slice(0, 10) === localDateIso());
  const feedTimelineToday = [...feedsGivenToday].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const lastFeedAt = feedTimelineToday.at(-1)?.at;
  const plannedNextFeedAt = snapshot.feedsPerDay && lastFeedAt ? new Date(+new Date(lastFeedAt) + (24 / snapshot.feedsPerDay) * 60 * 60 * 1000) : undefined;
  const actualFeedVolumeToday = feedTimelineToday.reduce((sum, feed) => sum + (feed.volumeMl || 0), 0);
  const projectedFeedVolumeToday = snapshot.feedsPerDay && idealFeedVolume > 0 ? actualFeedVolumeToday + Math.max(0, snapshot.feedsPerDay - feedTimelineToday.length) * idealFeedVolume : undefined;
  const warnings: string[] = [];
  if (totalFluid <= 0) warnings.push("Total fluids has no entered target yet.");
  else if (fluidStatus !== "safe") warnings.push(`Total fluids ${showFluid(totalFluid)} ml/kg/day is ${totalFluid < fluidRange[0] ? "below" : "above"} the ${fluidRange[0]}–${fluidRange[1]} target.`);
  if (energyStateText) warnings.push(energyStateText);
  else if (nutrition.totalKcal <= 0) warnings.push("Energy is not yet calculated from feed and TPN inputs.");
  else if (kcalStatus !== "safe") warnings.push(`Energy ${showFluid(nutrition.totalKcal)} kcal/kg/day is ${nutrition.totalKcal < nutrition.kcalTarget[0] ? "below" : "above"} the ${nutrition.kcalTarget[0]}–${nutrition.kcalTarget[1]} target.`);
  if (girStateText) warnings.push(girStateText);
  else if (nutrition.gir <= 0) warnings.push("GIR has no entered target yet.");
  else if (girStatus !== "safe") warnings.push(`GIR ${showFluid(nutrition.gir)} mg/kg/min is outside the ${girRange[0]}–${girRange[1]} target range.`);
  if (nutrition.totalProtein > 0 && nutrition.totalProtein < nutrition.proteinTarget[0]) warnings.push(`Protein ${showFluid(nutrition.totalProtein)} g/kg/day is below the ${nutrition.proteinTarget[0]}–${nutrition.proteinTarget[1]} target.`);
  if (reconciliationNotice) warnings.push(reconciliationNotice);
  if (planLimitError) warnings.push("Plan minimum cannot exceed its maximum — correct the limits before applying.");
  if (volumeValidationWarning) warnings.push(volumeValidationWarning);
  warnings.push(...fortifierWarnings, ...fortifierValidationWarnings);
  if (s.frequencyChangedAt && feedsGivenToday.length > 0) warnings.push(`New interval applies from ${s.frequencyChangedAt.slice(11, 16)} onward; ${feedsGivenToday.length} feed${feedsGivenToday.length === 1 ? "" : "s"} already given today at the previous interval.`);
  const electrolyteTargets = { na: [2, 4], k: [1, 3], ca: [1.5, 3.5], po4: [1, 2] } as const;
  const electrolyteToMEq = (key: keyof typeof electrolyteTargets, value: number | undefined) => value == null ? undefined : s.electrolyteUnit === "mmol/kg/day" && (key === "ca" || key === "po4") ? value * 2 : value;
  const electrolyteNeedsAttention = (snapshot.ivMlKgDay ?? 0) > 0 && !ivHeld && (["na", "k", "ca", "po4"] as const).some((key) => {
    const value = electrolyteToMEq(key, s.electrolytes?.[key]);
    const target = electrolyteTargets[key];
    return value == null || value < target[0] || value > target[1];
  });
  const naValue = electrolyteToMEq("na", s.electrolytes?.na);
  const naTarget = electrolyteTargets.na;
  const naNeedsAttention = (snapshot.ivMlKgDay ?? 0) > 0 && !ivHeld && (naValue == null || naValue < naTarget[0] || naValue > naTarget[1]);
  const feedVolumeValid = dosingWeightConfirmed && idealFeedVolume > 0 && (snapshot.feedMl !== undefined || snapshot.feedMlPerHour !== undefined);
  if (electrolyteNeedsAttention) warnings.push("Electrolytes need attention before this plan can be applied.");
  const planChecks = [
    { label: "Dosing weight confirmed", ok: dosingWeightConfirmed },
    { label: "Fluids reconciled", ok: totalFluid > 0 && !mismatch && !planLimitError && !volumeInvalid },
    { label: "Feed volume valid", ok: feedVolumeValid },
    { label: "Fortifier confirmed", ok: !hasFortifierValidationError && !fortifierReferencePending },
    { label: "Dextrose available", ok: ivNotStarted || dextroseValid },
    { label: "GIR calculated", ok: ivNotStarted || (dextroseValid && !ivHeld) },
    { label: naNeedsAttention ? "Na needs attention" : "Na target reviewed", ok: !naNeedsAttention, warning: naNeedsAttention },
    { label: "Electrolytes in target", ok: !electrolyteNeedsAttention },
    { label: "Target changes confirmed", ok: !targetChangePending },
  ];
  const planIssues = planChecks.filter((item) => !item.ok).length;
  const statusIsCritical = [fluidStatus, kcalStatus, girStatus].includes("crit");
  const setFrequency = (value: string) => {
    if (!canModify) return;
    if (s.feedFreq && s.feedFreq !== value && feedsGivenToday.length > 0) {
      setS((p) => ({ ...p, feedFreq: value, previousFeedFreq: p.feedFreq, frequencyChangedAt: new Date().toISOString() }));
    } else {
      setS((p) => ({ ...p, feedFreq: value }));
    }
  };
  const intervalHours = feedIntervalHours(s.feedFreq);
  const setIntervalHours = (hours: number) => {
    if (!canModify || !Number.isFinite(hours) || hours < 0.5 || hours > 24) return;
    setFrequency(feedFrequencyLabel(hours));
  };
  const recordFeedGiven = async () => {
    const actual = feedLogVolume.trim() === "" ? idealFeedVolume : Number(feedLogVolume);
    if (!canLogFeed || !Number.isFinite(actual) || actual < 0) return;
    const status = feedLogStatus;
    const feed = { at: new Date().toISOString(), volumeMl: status === "given" ? actual : 0, plannedVolumeMl: idealFeedVolume > 0 ? idealFeedVolume : undefined, intervalHours: snapshot.feedsPerDay ? 24 / snapshot.feedsPerDay : undefined, status, reason: feedLogReason.trim() || undefined };
    const fluids: FluidState = { ...s, feedsGiven: [...(s.feedsGiven ?? []), feed] };
    setS(fluids);
    const saved = await patchFluid({ clinical: { fluids }, logEvent: { kind: "feed-given", text: `${status === "given" ? "Feed given" : `Feed ${status}`}: actual ${showFluid(feed.volumeMl)} ml; planned ${idealFeedVolume > 0 ? `${showFluid(idealFeedVolume)} ml` : "not set"} (${s.feedFreq || "interval not set"})${feed.reason ? `; ${feed.reason}` : ""}`, author: user || "Team" } });
    if (saved) { lastSavedRef.current = JSON.stringify(fluids); setFeedLogVolume(""); setFeedLogReason(""); }
  };
  const commitDextrose = () => {
    const next = Number(dextroseDraft);
    if (!Number.isFinite(next) || next < 5 || next > 30) {
      setDextroseError("Enter dextrose 5–30% to calculate GIR.");
      return;
    }
    if (!canModify) return;
    setDextroseError("");
    const nextGir = ivHeld ? 0 : girFromDextrose(next, snapshot.ivMlKgDay ?? 0);
    setS((p) => ({ ...p, dextrosePct: next, gir: nextGir }));
  };
  const set = (k: string) => (n: number) => {
    if (!canModify) return;
    if (!Number.isFinite(n) || n < 0) { setReconciliationNotice("Nutrition values and volumes cannot be negative or non-numeric. Correct the entered value before continuing."); return; }
    setS((p) => ({ ...p, [k]: n }));
  };
  const setPlanNumber = (section: "enteral" | "iv", key: keyof DailyFluidPlan) => (n: number) => {
    if (!canModify) return;
    if (!Number.isFinite(n) || (n < 0 && key !== "changePer24h")) { setReconciliationNotice("Daily fluid limits and starts cannot be negative. Correct the entered value before continuing."); return; }
    setS((p) => ({
      ...p,
      plan: {
        ...(p.plan ?? { mode: "daily", day: 1 }),
        mode: "daily",
        [section]: { ...(p.plan?.[section] ?? {}), [key]: n },
      },
    }));
  };
  const enableDaily = () => {
    if (!canModify) return;
    if (!dosingWeightConfirmed) return;
    setS((p) => ({
      ...p,
      plan: {
        ...(p.plan ?? {}),
        mode: "daily",
        startDate: p.plan?.startDate ?? localDateIso(),
        day: p.plan?.day ?? 1,
        holdToday: false,
        enteral: p.plan?.enteral ?? { startMlKgDay: p.enteralMlKgDay ?? 0, changePer24h: 0, minimumMlKgDay: 0, maximumMlKgDay: 300 },
        iv: p.plan?.iv ?? { startMlKgDay: p.ivMlKgDay ?? 0, changePer24h: 0, minimumMlKgDay: 0, maximumMlKgDay: 300 },
      },
    }));
  };
  const setMode = (mode: FluidPlanMode) => {
    if (!canModify) return;
    if (mode === "daily") enableDaily();
    else setS((p) => ({ ...p, plan: { ...p.plan, mode: "fixed" } }));
  };
  const advanceDay = () => {
    if (!canModify || !dosingWeightConfirmed || mismatch || conflict) return;
    setWeightAction("advance");
  };
  const holdToday = () => { if (canModify) setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", holdToday: !p.plan?.holdToday } })); };
  const resetDay = () => { if (canModify) setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: 1, holdToday: false } })); };
  const updateTarget = (key: "fluids" | "energy" | "protein" | "gir", index: 0 | 1, value: number) => {
    if (!canModify || !Number.isFinite(value) || value < 0) return;
    setS((p) => ({ ...p, targets: { ...(p.targets ?? {}), [key]: [index === 0 ? value : (p.targets?.[key]?.[0] ?? value), index === 1 ? value : (p.targets?.[key]?.[1] ?? value)] as [number, number] } }));
    setTargetChangePending(`${key === "fluids" ? "Fluid" : key === "gir" ? "GIR" : key} target changed. Confirm this target change before it is saved.`);
  };
  const updateFortifier = (id: string, update: Partial<NonNullable<FluidExtras["fortifiers"]>[number]>) => {
    if (!canModify) return;
    setS((p) => ({ ...p, fortifiers: (p.fortifiers ?? []).map((fortifier) => fortifier.id === id ? { ...fortifier, ...update, ...(update.confirmed === undefined ? { confirmed: false } : {}) } : fortifier) }));
  };
  const addFortifier = () => {
    if (!canModify) return;
    setS((p) => ({ ...p, fortifiers: [...(p.fortifiers ?? []), { id: `${Date.now()}`, name: "New fortifier", kcalPerUnit: 0, referenceVolumeMl: idealFeedVolume || 25, phase: 1, amount: 1, amountUnit: "sachet", confirmed: false }] }));
  };
  const removeFortifier = (id: string) => { if (canModify) setS((p) => ({ ...p, fortifiers: (p.fortifiers ?? []).filter((fortifier) => fortifier.id !== id) })); };
  const advanceCurrent = advanceSection === "enteral" ? (snapshot.enteralMlKgDay ?? 0) : (snapshot.ivMlKgDay ?? 0);
  const advancePlan = s.plan?.[advanceSection];
  const advanceMax = advancePlan?.maximumMlKgDay ?? s.targets?.maximumEnteralMlKgDay ?? 300;
  const advanceIncrement = Number(advanceDraft);
  const advanceDelta = advanceUnit === "per-feed" ? advanceIncrement * (snapshot.feedsPerDay ?? 1) : advanceIncrement;
  const advanceNext = advanceCurrent + (Number.isFinite(advanceDelta) ? advanceDelta : 0);
  const advanceReason = !canModify ? "Only a credentialed resident, registrar, consultant, or admin can apply advances." : !dosingWeightConfirmed ? "Confirm a dosing weight first." : mismatch ? "Reconcile Enteral + IV/TPN with Total first." : planLimitError ? "Correct the plan minimum and maximum first." : volumeInvalid ? "Correct negative or non-numeric volume values first." : hasFortifierValidationError ? "Fix composition validation first." : !advanceUnit ? "Choose per-day or per-feed." : !Number.isFinite(advanceIncrement) || advanceIncrement <= 0 ? "Enter a positive advance." : advanceNext > advanceMax ? "Maximum exceeded — reduce the increment before applying." : "";
  const canReviewAdvance = !advanceReason && !advanceApplying;
  const canApplyAdvance = canReviewAdvance && advanceWeightConfirmed;
  const requestAdvance = () => { if (canReviewAdvance) { setAdvanceWeightConfirmed(false); setAdvanceConfirming(true); } };
  const applyAdvance = async () => {
    if (!canApplyAdvance || !advanceConfirming) return;
    setAdvanceApplying(true);
    const nextDay = (s.plan?.day ?? 1) + 1;
    const nextPlan = { ...(s.plan ?? {}), mode: "daily" as const, day: nextDay, [advanceSection]: { ...(s.plan?.[advanceSection] ?? {}), startMlKgDay: advanceNext - advanceDelta * (nextDay - 1), changePer24h: advanceDelta } };
    const fluids: FluidState = { ...s, plan: nextPlan };
    try {
      const saved = await patchFluid({ clinical: { fluids }, logEvent: { kind: "fluid-advance", text: `Applied ${advanceSection} advance: ${showFluid(advanceCurrent)} → ${showFluid(advanceNext)} ml/kg/day; ${advanceUnit} ${showFluid(advanceIncrement)}; dosing weight ${showFluid(activeWeightKg)} kg`, author: user || "Team" } });
      if (!saved) return;
      setS(fluids);
      lastSavedRef.current = JSON.stringify(fluids);
      setAdvanceDraft("");
      setAdvanceUnit(null);
      setAdvanceConfirming(false);
      setAdvanceWeightConfirmed(false);
    } finally {
      setAdvanceApplying(false);
    }
  };
  const lastSavedRef = useRef("");
  const lastServerFluidRef = useRef(serverFluidSignature);
  useEffect(() => {
    if (serverFluidSignature === lastServerFluidRef.current) return;
    const localSignature = JSON.stringify(s);
    if (localSignature !== lastServerFluidRef.current) {
      const latestFluidEvent = d.events.find((event) => ["fluid-edit", "fluid-advance"].includes(event.kind));
      setConflict(`${latestFluidEvent?.author || "Another clinician"} just now. This plan changed while you were editing. Review before saving.`);
    } else {
      setS({ ...(d.baby.clinical?.fluids ?? {}) } as FluidState);
    }
    lastServerFluidRef.current = serverFluidSignature;
  }, [d.baby.clinical?.fluids, d.events, s, serverFluidSignature]);
  const reloadServerPlan = () => {
    const latest = { ...(d.baby.clinical?.fluids ?? {}) } as FluidState;
    setS(latest);
    if (latest.dosingWeightKg != null) {
      setDosingWeightKg(latest.dosingWeightKg);
      setWeightDraft(String(latest.dosingWeightKg));
      setWeightAction(Number.isFinite(latest.dosingWeightKg) && latest.dosingWeightKg >= 0.3 && latest.dosingWeightKg <= 6 ? null : "start");
    }
    setConflict("");
    expectedUpdatedAtRef.current = d.baby.updatedAt;
    // Mutable refs intentionally track the server snapshot across realtime polls.
    // eslint-disable-next-line react-hooks/immutability
    lastServerFluidRef.current = JSON.stringify(latest);
  };
  const save = async (): Promise<boolean> => {
    if (!canModify || !dosingWeightConfirmed || mismatch || planLimitError || volumeInvalid || conflict || hasFortifierValidationError || fortifierReferencePending || targetChangePending) return false;
    const resolved = calculateFluidPlan(s, activeWeightKg);
    const fluids: FluidState = dailyMode
      ? { ...s, enteralMlKgDay: resolved.enteralMlKgDay, ivMlKgDay: resolved.ivMlKgDay, totalMlKgDay: resolved.totalMlKgDay, idealFeedVolumeMl: idealFeedVolume, practicalFeedVolumeMl: practicalFeedVolume }
      : { ...s, idealFeedVolumeMl: idealFeedVolume, practicalFeedVolumeMl: practicalFeedVolume };
    const signature = JSON.stringify(fluids);
    if (signature === lastSavedRef.current) return true;
    const previous = lastSavedRef.current || JSON.stringify(initialFluid);
    lastSavedRef.current = signature;
    // eslint-disable-next-line react-hooks/immutability
    lastServerFluidRef.current = signature;
    return patchFluid({
      clinical: { fluids },
      logEvent: {
        kind: "fluid-edit",
        text: `Fluids/TPN parameters changed by ${user || "staff"}: previous ${previous.slice(0, 180)} → new ${signature.slice(0, 180)}`,
        author: user || "Team",
      },
    });
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const firstFluidRender = useRef(true);
  useEffect(() => {
    if (firstFluidRender.current) {
      firstFluidRender.current = false;
      return;
    }
    // Guided wizard edits are draft-only. Advanced view keeps the existing
    // realtime autosave behavior; the wizard saves only from its review step.
    if (moduleView !== "advanced") return;
    const timer = window.setTimeout(() => saveRef.current(), 1000);
    return () => window.clearTimeout(timer);
  }, [moduleView, s]);
  const day = s.plan?.day ?? 1;
  const todayLabel = s.plan?.holdToday ? "Held at previous target" : `Day ${day} target`;
  const totalFluidFormula = dailyMode
    ? `Total fluids = enteral target + IV target = ${showFluid(snapshot.enteralMlKgDay)} + ${showFluid(snapshot.ivMlKgDay)} = ${showFluid(totalFluid)} ml/kg/day.`
    : `Total fluids = the entered totalMlKgDay value (${showFluid(s.totalMlKgDay)} ml/kg/day).`;
  const fortifierFormula = fortifiers.length ? ` Fortifiers: ${fortifiers.map((fortifier) => `${fortifier.name} = (${showFluid(fortifier.kcalPerUnit)} kcal/${fortifier.amountUnit ?? "unit"} × ${showFluid(fortifier.amount ?? 1)} × phase ${showFluid(fortifier.phase)}) / ${showFluid(fortifier.referenceVolumeMl)} ml = ${showFluid((fortifier.kcalPerUnit * (fortifier.amount ?? 1) * fortifier.phase) / fortifier.referenceVolumeMl)} kcal/ml`).join("; ")}.` : "";
  const kcalFormula = `Energy = enteral volume × (${nutrition.density} kcal/ml including base milk and fortifiers) + GIR contribution + amino-acid contribution + lipid contribution = ${showFluid(nutrition.totalKcal)} kcal/kg/day.${fortifierFormula}`;
  const girFormula = `GIR = (dextrose % × 10 × IV ml/kg/day) / 1440 = (${showFluid(dextrosePct ?? 0)} × 10 × ${showFluid(snapshot.ivMlKgDay)} ) / 1440 = ${showFluid(nutrition.gir)} mg/kg/min.`;
  const planStatus: "Draft" | "Active" | "Warning" | "Blocked" = conflict || mismatch || volumeInvalid || planLimitError || hasFortifierValidationError || fortifierReferencePending || targetChangePending ? "Blocked" : !dosingWeightConfirmed ? "Draft" : warnings.length ? "Warning" : "Active";
  const planStatusClass = planStatus === "Active" ? "text-emerald-200 bg-emerald-400/10" : planStatus === "Warning" ? "text-amber-200 bg-amber-400/10" : planStatus === "Blocked" ? "text-rose-200 bg-rose-500/15" : "text-slate-300 bg-white/5";
  const trendWindowSize = trendWindow === "24h" ? 2 : trendWindow === "3d" ? 3 : trendWindow === "7d" ? 7 : Number.POSITIVE_INFINITY;
  const selectedTrend = trendMetric ? { ...trends[trendMetric], points: trends[trendMetric].points.slice(-trendWindowSize) } : null;
  const fluidAuditEvents = d.events.filter((event) => ["fluid-edit", "fluid-advance", "feed-given", "fluid-output"].includes(event.kind)).slice(0, 8);
  const planExists = Boolean(s.dosingWeightConfirmedAt || s.totalMlKgDay != null || s.enteralMlKgDay != null || s.ivMlKgDay != null || s.plan?.enteral?.startMlKgDay != null || s.plan?.iv?.startMlKgDay != null || s.feedType);
  const outputEntries = s.outputs ?? [];
  const outputSince = outputNow - 86400000;
  const output24 = outputEntries.filter((entry) => +new Date(entry.at) >= outputSince);
  const outputUrine = output24.reduce((sum, entry) => sum + (entry.urineMl ?? 0), 0);
  const outputMeasured = output24.reduce((sum, entry) => sum + (entry.urineMl ?? 0) + (entry.gastricAspirateMl ?? 0) + (entry.stoolMl ?? 0) + (entry.insensibleMl ?? 0), 0);
  const projectedIntake = snapshot.totalMlDay ?? 0;
  const netBalance = projectedIntake - outputMeasured;
  const recordOutput = async () => {
    if (!canLogFeed) return;
    const numeric = (value: string) => value.trim() === "" ? undefined : Number(value);
    const row = { at: new Date().toISOString(), urineMl: numeric(outputDraft.urineMl), gastricAspirateMl: numeric(outputDraft.gastricAspirateMl), stoolMl: numeric(outputDraft.stoolMl), stool: outputDraft.stool, insensibleMl: numeric(outputDraft.insensibleMl), note: outputDraft.note.trim() || undefined };
    const invalid = [row.urineMl, row.gastricAspirateMl, row.stoolMl, row.insensibleMl].some((value) => value != null && (!Number.isFinite(value) || value < 0));
    if (invalid || [row.urineMl, row.gastricAspirateMl, row.stoolMl, row.insensibleMl].every((value) => value == null) && row.stool === "none") return;
    const fluids: FluidState = { ...s, outputs: [...outputEntries, row] };
    setS(fluids);
    const saved = await patchFluid({ clinical: { fluids }, logEvent: { kind: "fluid-output", text: `Fluid output recorded: urine ${row.urineMl ?? 0} ml; aspirate ${row.gastricAspirateMl ?? 0} ml; stool ${row.stoolMl ?? row.stool}; insensible ${row.insensibleMl ?? 0} ml`, author: user || "Team" } });
    if (saved) setOutputDraft({ urineMl: "", gastricAspirateMl: "", stoolMl: "", stool: "none", insensibleMl: "", note: "" });
  };
  const sharePlan = async () => {
    if (!planExists) return;
    const text = `${d.baby.babyName} (${d.baby.uhid || `record ${d.baby.id}`})\nNutrition plan · day ${day}\nDosing weight: ${dosingWeightConfirmed ? `${showFluid(dosingWeightKg)} kg (${showFluid(dosingWeightKg * 1000)} g)` : "not confirmed"}\nTotal fluids: ${showFluid(totalFluid)} ml/kg/day${activeWeightKg ? ` (${showFluid(totalFluid * activeWeightKg)} ml/day)` : ""}\nEnteral + IV/TPN: ${showFluid(snapshot.enteralMlKgDay)} + ${showFluid(snapshot.ivMlKgDay)} ml/kg/day\nEnergy: ${energyStateText || `${showFluid(nutrition.totalKcal)} kcal/kg/day`}${activeWeightKg ? ` (${showFluid(nutrition.totalKcal * activeWeightKg)} kcal/day)` : ""}\nGIR: ${girStateText || `${showFluid(nutrition.gir)} mg/kg/min`}${activeWeightKg ? ` (${showFluid(nutrition.gir * activeWeightKg)} mg/min)` : ""}\nFeed: ${fortifierSummary}\nFrequency: ${s.feedFreq || "not set"}\nStatus: ${planStatus}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: `${d.baby.babyName} nutrition plan`, text });
      return;
    }
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.title = "SRH Pediatrics nutrition plan";
    const pre = popup.document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;font:16px system-ui;padding:24px;max-width:760px;margin:auto";
    pre.textContent = text;
    popup.document.body.appendChild(pre);
    popup.print();
  };
  const updateWizardSplit = (field: "total" | "enteral" | "iv", next: number) => {
    if (!dailyMode) { updateFixedFluid(field, next); return; }
    if (!canModify || !Number.isFinite(next) || next < 0) return;
    const total = Number(snapshot.totalMlKgDay ?? currentTotal ?? 0);
    const enteral = Number(snapshot.enteralMlKgDay ?? currentEnteral ?? 0);
    const iv = Number(snapshot.ivMlKgDay ?? currentIv ?? 0);
    let nextTotal = total;
    let nextEnteral = enteral;
    let nextIv = iv;
    if (field === "total") { nextTotal = next; const ratio = enteral + iv > 0 ? next / (enteral + iv) : 0; nextEnteral = (enteral + iv > 0 ? enteral * ratio : 0); nextIv = enteral + iv > 0 ? iv * ratio : next; }
    if (field === "enteral") { if (next > total) { setReconciliationNotice(`Enteral ${showFluid(next)} cannot exceed Total ${showFluid(total)} ml/kg/day.`); return; } nextEnteral = next; nextIv = total - next; }
    if (field === "iv") { if (next > total) { setReconciliationNotice(`IV/TPN ${showFluid(next)} cannot exceed Total ${showFluid(total)} ml/kg/day.`); return; } nextIv = next; nextEnteral = total - next; }
    setS((p) => ({ ...p, totalMlKgDay: nextTotal, enteralMlKgDay: nextEnteral, ivMlKgDay: nextIv, plan: { ...(p.plan ?? {}), mode: "daily", enteral: { ...(p.plan?.enteral ?? {}), startMlKgDay: nextEnteral }, iv: { ...(p.plan?.iv ?? {}), startMlKgDay: nextIv } } }));
  };
  const wizardHelp = [
    "Confirming a dosing weight makes every absolute ml/day, kcal/day, and glucose-delivery value traceable to a recorded patient measurement.",
    "Total fluids are a 24-hour rate. The absolute readout is rate multiplied by the confirmed dosing weight; it is not a second independent prescription.",
    "Enteral and IV/TPN are two parts of one total. A mismatch is unsafe because it would make downstream totals and bedside volumes disagree.",
    "Base milk and fortifiers are recorded independently so the team can see exactly where energy and protein come from; fortifier quantities are never silently scaled.",
    "The interval determines feeds per day. A fractional frequency is preserved exactly, while practical bedside splitting is shown separately from ideal calculations.",
  ];
  const wizardNext = async () => {
    if (wizardStep === 1 && !dosingWeightConfirmed) { setWeightError("Confirm a valid dosing weight before continuing."); return; }
    if (wizardStep === 2 && totalFluid <= 0) { setReconciliationNotice("Enter a positive total fluid target before continuing."); return; }
    if (wizardStep === 3 && mismatch) { setReconciliationNotice("Reconcile Enteral + IV/TPN with Total before continuing."); return; }
    if (wizardStep === 4 && (hasFortifierValidationError || fortifierReferencePending)) { setReconciliationNotice("Confirm or correct every fortifier before continuing."); return; }
    if (wizardStep < 6) { setWizardStep((step) => step + 1); return; }
    const saved = await save();
    if (saved) { setWizardBaseline(null); rememberView("today"); }
  };
  const wizardBack = () => {
    if (wizardStep > 1) { setWizardStep((step) => step - 1); return; }
    if (window.confirm("Discard changes and go back to today’s plan?")) discardWizard();
  };
  const baseMilkOptions = ["Own mother’s milk (OMM)", "Donor human milk (DHM)", "Preterm formula", "Neosure", "Neocate", "Term formula", ...FEED_TYPE.filter((item) => !["Own mother’s milk (OMM)", "Donor human milk (DHM)", "Preterm formula", "Neosure", "Neocate", "Term formula"].includes(item))];
  const latestFluidEvent = d.events.find((event) => ["fluid-edit", "fluid-advance", "feed-given", "fluid-output"].includes(event.kind));
  const header = <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-[10px] text-slate-400"><b className="text-slate-100">{d.baby.babyName}</b><span>Identifier {d.baby.uhid || `#${d.baby.id}`}</span><span>GA {d.baby.gestWeeks}+{d.baby.gestDays}</span><span>Postnatal day {day}</span><span>Current {showFluid(d.baby.currentWeight / 1000)} kg</span><span>Dosing {dosingWeightConfirmed ? `${showFluid(dosingWeightKg)} kg` : "not confirmed"}</span><span>Nutrition day {day}</span><span>Updated {fmtTime(d.baby.updatedAt)}</span>{latestFluidEvent && <span className="text-cyan-200">Updated by {latestFluidEvent.author || "clinical team"} · {fmtTime(latestFluidEvent.at)}</span>}</div>;
  if (moduleView === "today") {
    const metricIcon = (status: MetricStatus) => status === "safe" ? "✓" : status === "warn" ? "⚠" : status === "crit" ? "✕" : "○";
    const metricText = (status: MetricStatus) => status === "safe" ? "In target" : status === "warn" ? "Review range" : status === "crit" ? "Cannot apply" : "Not started";
    return (
      <div className="grid gap-3">
        <Section title="Fluids, TPN & nutrition · Today’s plan" sub="One card for the whole bedside read-back. Expand details only when needed." right={<button type="button" className="btn-primary min-h-10" disabled={!canModify} onClick={startWizard}>{planExists ? "Update plan" : "Start plan"}</button>}>
          {header}
          <details className="mb-3"><summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-[10px] font-bold text-cyan-200">More options <span aria-hidden>⌄</span></summary><div className="mt-2 flex flex-wrap gap-2 border-b border-white/10 pb-3"><button type="button" className="btn-ghost min-h-9" onClick={sharePlan} disabled={!planExists}>Share plan</button><button type="button" className="btn-ghost min-h-9" onClick={() => rememberView("advanced")}>Advanced clinician view</button></div></details>
          {!planExists ? <div className="py-6 text-center"><Circle className="mx-auto h-8 w-8 text-cyan-300" /><h3 className="mt-3 text-base font-black text-slate-100">No nutrition plan started yet for {d.baby.babyName}</h3><p className="mx-auto mt-1 max-w-md text-xs text-slate-400">Start with a confirmed dosing weight, then build the plan one topic at a time.</p><button type="button" className="btn-primary mt-4 min-h-11" disabled={!canModify} onClick={startWizard}>Start plan</button></div> : <div className="divide-y divide-white/10">
            <div className={`mb-3 flex items-start gap-2 rounded-xl border p-3 text-[11px] font-semibold ${warnings.length ? statusIsCritical ? "border-rose-400/40 bg-rose-500/10 text-rose-100" : "border-amber-400/40 bg-amber-400/10 text-amber-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}><span aria-hidden className="text-sm">{warnings.length ? statusIsCritical ? "✕" : "⚠" : "✓"}</span><div><b className="block">{warnings.length ? `${warnings.length} item${warnings.length === 1 ? "" : "s"} needs review` : "Plan is within target"}</b><span className="font-normal">{warnings.length ? "Open details below for the exact interpretation." : "Fluids, energy, and GIR are ready for bedside read-back."}</span></div></div>
            <div className="py-1">
              <div className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${METRIC_RING[fluidStatus]}`}>{metricIcon(fluidStatus)}</span><div><b className="block text-xs text-slate-100">Total fluids</b><span className="text-[10px] text-slate-500">Target {fluidRange[0]}–{fluidRange[1]} ml/kg/day · {metricText(fluidStatus)}</span></div></div><div className="flex items-center gap-2"><FormulaValue onOpen={() => setFormula({ title: "Total fluids", text: `${totalFluidFormula} Absolute volume = ${showFluid(totalFluid)} × ${showFluid(activeWeightKg)} kg = ${showFluid(totalFluid * activeWeightKg)} ml/day.` })} className="text-right"><b className="block text-lg tabular-nums text-white">{totalFluid > 0 ? showFluid(totalFluid) : "Not started"}</b><span className="block text-[10px] text-slate-400">{totalFluid > 0 && activeWeightKg ? `${showFluid(totalFluid * activeWeightKg)} ml/day` : "Tap for formula"}</span></FormulaValue><Sparkline points={trends.fluids.points} color={fluidStatus === "warn" ? "#fbbf24" : fluidStatus === "crit" ? "#fb7185" : "#34d399"} label="Total fluids" onClick={() => setTrendMetric("fluids")} /></div></div>
              <div className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${METRIC_RING[kcalStatus]}`}>{metricIcon(kcalStatus)}</span><div><b className="block text-xs text-slate-100">Energy</b><span className="text-[10px] text-slate-500">Target {nutrition.kcalTarget[0]}–{nutrition.kcalTarget[1]} kcal/kg/day · {energyStateText || metricText(kcalStatus)}</span></div></div><div className="flex items-center gap-2"><FormulaValue onOpen={() => setFormula({ title: "Energy", text: `${kcalFormula} Absolute energy = ${showFluid(nutrition.totalKcal)} × ${showFluid(activeWeightKg)} kg = ${showFluid(nutrition.totalKcal * activeWeightKg)} kcal/day.` })} className="text-right"><b className="block text-lg tabular-nums text-white">{energyStateText || (nutrition.totalKcal > 0 ? showFluid(nutrition.totalKcal) : "Not started")}</b><span className="block text-[10px] text-slate-400">{nutrition.totalKcal > 0 && activeWeightKg ? `${showFluid(nutrition.totalKcal * activeWeightKg)} kcal/day` : "Tap for formula"}</span></FormulaValue><Sparkline points={trends.kcal.points} color={kcalStatus === "warn" ? "#fbbf24" : kcalStatus === "crit" ? "#fb7185" : "#34d399"} label="Energy" onClick={() => setTrendMetric("kcal")} /></div></div>
              <div className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${METRIC_RING[girStatus]}`}>{metricIcon(girStatus)}</span><div><b className="block text-xs text-slate-100">GIR</b><span className="text-[10px] text-slate-500">Target {girRange[0]}–{girRange[1]} mg/kg/min · {girStateText || metricText(girStatus)}</span></div></div><div className="flex items-center gap-2"><FormulaValue onOpen={() => setFormula({ title: "GIR", text: `${girFormula} Absolute glucose delivery = ${showFluid(nutrition.gir)} × ${showFluid(activeWeightKg)} kg = ${showFluid(nutrition.gir * activeWeightKg)} mg/min.` })} className="text-right"><b className="block text-lg tabular-nums text-white">{girStateText || (nutrition.gir > 0 ? showFluid(nutrition.gir) : "Not started")}</b><span className="block text-[10px] text-slate-400">{nutrition.gir > 0 && activeWeightKg ? `${showFluid(nutrition.gir * activeWeightKg)} mg/min` : "Tap for formula"}</span></FormulaValue><Sparkline points={trends.gir.points} color={girStatus === "warn" ? "#fbbf24" : girStatus === "crit" ? "#fb7185" : "#34d399"} label="GIR" onClick={() => setTrendMetric("gir")} /></div></div>
            </div>
            <div className="border-t border-white/10 py-3 text-xs"><b className="text-slate-100">Next feed</b><span className="ml-2 text-slate-300">{idealFeedVolume > 0 ? `${showFluid(practicalFeedVolume)} ml draw-up (${showFluid(idealFeedVolume)} ml ideal) ${s.feedType || "feed"} · ${s.feedFreq || "frequency not set"}` : "Confirm dosing weight and frequency to calculate."}</span></div>
            <details className="group"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-xs font-black text-slate-100"><span>Feed, fluids & clinical details</span><span className="text-cyan-200 transition group-open:rotate-180">⌄</span></summary><div className="space-y-3 pb-2 text-[11px] text-slate-300"><div><b className="text-slate-100">Fluid split</b><p>{showFluid(snapshot.enteralMlKgDay)} ml/kg/day enteral + {showFluid(snapshot.ivMlKgDay)} ml/kg/day IV/TPN = {showFluid(totalFluid)} ml/kg/day total.</p></div><div><b className="text-slate-100">Feed composition</b><p>{fortifierSummary} · {s.feedType || "feed type not set"}</p></div><div><b className="text-slate-100">IV/TPN</b><p>{ivHeld ? "⏸ IV/TPN held — GIR suspended" : ivNotStarted ? "○ IV/TPN not started" : `${showFluid(snapshot.ivMlDay)} ml/day · dextrose ${dextroseValid ? `${showFluid(dextrosePct)}%` : "not entered"} · amino acid ${showFluid(s.aminoAcid)} g/kg/day · lipid ${showFluid(s.lipid)} g/kg/day`}</p></div><div><b className="text-slate-100">Nutrition</b><p>{feedsHeld ? "⏸ Feeds on hold — enteral calories paused" : feedsNotStarted ? "○ Enteral feeds not started" : `${showFluid(nutrition.totalKcal)} kcal/kg/day · ${showFluid(nutrition.totalProtein)} g/kg/day protein`}</p></div><div><b className="text-slate-100">Electrolytes</b><p>{electrolyteNeedsAttention ? "⚠ Electrolytes need attention" : snapshot.ivMlKgDay && !ivHeld ? "✓ Entered / in target" : "○ Not required until IV/TPN is running"}</p></div><div><b className="text-slate-100">Fluid balance</b><p>{output24.length ? `${showFluid(outputMeasured)} ml output in rolling 24h · net ${projectedIntake > 0 ? `${netBalance >= 0 ? "+" : ""}${showFluid(netBalance)} ml` : "not calculated"}` : "No output recorded in the rolling 24h window."}</p></div><div className="flex flex-wrap gap-2 pt-1"><button type="button" className="btn-ghost min-h-10" onClick={() => setTrendMetric("fluids")}>View trends</button><button type="button" className="btn-ghost min-h-10" onClick={() => setFormula({ title: "Plan interpretation", text: `${totalFluidFormula} ${kcalFormula} ${girFormula}` })}>View formulas</button></div></div></details>
          </div>}
        </Section>
      </div>
    );
  }
  if (moduleView === "wizard") {
    const wizardTitles = ["Weight & mode", "Total fluids", "Enteral / IV split", "Feed composition", "Frequency", "Review plan"];
    return <div className="grid gap-3"><Section title="Nutrition plan wizard" sub={`${wizardStep === 6 ? "Review" : `Step ${wizardStep} of 5`} · draft changes are not saved until the final action`} right={<button type="button" className="btn-ghost min-h-10" onClick={() => { if (window.confirm("Discard changes and go back to today’s plan?")) discardWizard(); }}>Today’s plan</button>}>{header}<div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (wizardStep / 6) * 100)}%` }} /></div>{(reconciliationNotice || weightError || conflict) && <div className="mb-3 rounded-xl border border-rose-400/50 bg-rose-500/10 p-3 text-[11px] font-semibold text-rose-100" role="alert"><b className="block">There is a problem with this plan</b><span>{conflict || reconciliationNotice || weightError}</span></div>}<div className="rounded-2xl border border-cyan-400/25 bg-slate-900/45 p-4"><h3 className="text-lg font-black text-white">{wizardTitles[wizardStep - 1]}</h3><p className="mt-1 text-sm leading-relaxed text-slate-300">{wizardHelp[Math.min(wizardStep - 1, 4)]}</p>{wizardStep === 1 && <div className="mt-4 grid gap-3"><label className="block"><span className="lbl mb-1 block">Dosing weight in kilograms</span><input className="inp min-h-12 text-lg font-black" type="number" step="0.01" min="0.01" max="20" value={weightDraft} disabled={!canModify} onChange={(event) => { setWeightDraft(event.target.value); setWeightAction("update"); }} /><span className="mt-1 block text-xs text-slate-400">Use the latest recorded weight by default. Example: 1.42 kg equals 1420 g; all absolute values wait for confirmation.</span>{weightError && <span className="mt-1 block text-xs font-bold text-rose-200">⚠ {weightError}</span>}</label>{weightAction && <button type="button" className="btn-secondary min-h-11" disabled={!canModify} onClick={confirmDosingWeight}>{weightAction === "start" ? `Confirm ${showFluid(Number(weightDraft))} kg` : "Confirm updated dosing weight"}</button>}<div className="grid gap-2 sm:grid-cols-2"><button type="button" className={`min-h-12 rounded-xl border p-3 text-left ${!dailyMode ? "border-cyan-300/60 bg-cyan-400/10" : "border-white/10"}`} disabled={!canModify} onClick={() => setMode("fixed")}><b className="block text-sm">Fixed target</b><span className="text-xs text-slate-400">Use one confirmed 24-hour total and maintain the enteral/IV split.</span></button><button type="button" className={`min-h-12 rounded-xl border p-3 text-left ${dailyMode ? "border-cyan-300/60 bg-cyan-400/10" : "border-white/10"}`} disabled={!canModify} onClick={() => setMode("daily")}><b className="block text-sm">Advance daily</b><span className="text-xs text-slate-400">Start with today’s target and apply forward-only daily increments.</span></button></div></div>}{wizardStep === 2 && <div className="mt-4"><NumField strict label="Total fluids ml/kg/day" value={dailyMode ? snapshot.totalMlKgDay : s.totalMlKgDay} onChange={(value) => updateWizardSplit("total", value)} min={0} max={300} step={1} disabled={!canModify} placeholder={`${neonatalDayFluidRange(d.baby)[0]} suggested`} /><p className="mt-2 text-xs text-slate-400">Suggested range by postnatal day: {fluidRange[0]}–{fluidRange[1]} ml/kg/day. Absolute today: {activeWeightKg ? `${showFluid(totalFluid * activeWeightKg)} ml/day` : "confirm dosing weight first"}.</p></div>}{wizardStep === 3 && <div className="mt-4 grid gap-3"><label className="rounded-xl border border-cyan-300/25 bg-cyan-400/5 p-3"><span className="flex justify-between text-xs font-black text-cyan-100"><span>Enteral share</span><span>{showFluid(enteralSharePercent)}% enteral · {showFluid(100 - enteralSharePercent)}% IV/TPN</span></span><input className="mt-3 w-full accent-cyan-400" type="range" min="0" max="100" step="1" value={enteralSharePercent} disabled={!canModify || totalFluid <= 0} onChange={(event) => updateWizardSplit("enteral", totalFluid * Number(event.target.value) / 100)} /><span className="mt-1 block text-[10px] text-slate-400">Slide the split; Total stays fixed and the other component follows it.</span></label><div className="flex h-8 overflow-hidden rounded-lg bg-slate-950/60"><div className="bg-cyan-400/70" style={{ width: `${enteralBarPercent}%` }} /><div className="flex-1 bg-indigo-400/60" /></div><div className="grid gap-2 sm:grid-cols-3"><NumField strict label="Total ml/kg/day" value={dailyMode ? snapshot.totalMlKgDay : s.totalMlKgDay} onChange={(value) => updateWizardSplit("total", value)} min={0} max={300} step={1} disabled={!canModify} /><NumField strict label="Enteral ml/kg/day" value={dailyMode ? snapshot.enteralMlKgDay : s.enteralMlKgDay} onChange={(value) => updateWizardSplit("enteral", value)} min={0} max={300} step={1} disabled={!canModify} /><NumField strict label="IV/TPN ml/kg/day" value={dailyMode ? snapshot.ivMlKgDay : s.ivMlKgDay} onChange={(value) => updateWizardSplit("iv", value)} min={0} max={300} step={1} disabled={!canModify} /></div><p className="text-xs text-slate-400">Enteral + IV/TPN must equal Total. Dextrose, amino acid, and lipid appear when IV/TPN is greater than zero.</p>{(snapshot.ivMlKgDay ?? 0) > 0 && <div className="grid gap-2 sm:grid-cols-3"><NumField strict label="Dextrose % (5–30)" value={s.dextrosePct} onChange={(value) => setS((p) => ({ ...p, dextrosePct: value }))} min={5} max={30} step={0.1} disabled={!canModify} /><NumField strict label="Amino acid g/kg/day" value={s.aminoAcid} onChange={(value) => setS((p) => ({ ...p, aminoAcid: value }))} min={0} max={5} step={0.1} disabled={!canModify} /><NumField strict label="Lipid g/kg/day" value={s.lipid} onChange={(value) => setS((p) => ({ ...p, lipid: value }))} min={0} max={5} step={0.1} disabled={!canModify} /></div>}</div>}{wizardStep === 4 && <div className="mt-4 grid gap-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{baseMilkOptions.map((option) => <button type="button" key={option} disabled={!canModify} onClick={() => setS((p) => ({ ...p, feedType: option }))} className={`min-h-14 rounded-xl border p-2 text-left text-xs font-bold ${s.feedType === option ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300"}`}>{s.feedType === option ? "✓ " : ""}{option}</button>)}</div><p className="text-xs text-slate-400">Choose one base milk. Energy and protein fields remain configurable in the advanced detail tier.</p><button type="button" className="btn-secondary min-h-11" disabled={!canModify} onClick={addFortifier}>+ Add fortifier</button>{fortifiers.map((fortifier) => <div key={fortifier.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3"><div className="grid gap-2 sm:grid-cols-4"><label><span className="lbl mb-1 block">Name</span><input className="inp min-h-10" disabled={!canModify} value={fortifier.name} onChange={(event) => updateFortifier(fortifier.id, { name: event.target.value })} /></label><label><span className="lbl mb-1 block">Amount</span><input className="inp min-h-10" type="number" min="0" step="0.1" disabled={!canModify} value={fortifier.amount ?? 1} onChange={(event) => updateFortifier(fortifier.id, { amount: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Phase</span><select className="inp min-h-10" disabled={!canModify} value={fortifier.phase} onChange={(event) => updateFortifier(fortifier.id, { phase: Number(event.target.value) })}><option value="0.25">¼</option><option value="0.5">½</option><option value="0.75">¾</option><option value="1">1</option><option value="1.5">1.5</option><option value={fortifier.phase}>Custom ({showFluid(fortifier.phase)})</option></select><input className="inp mt-1 min-h-9" type="number" min="0" max="1.5" step="0.01" value={fortifier.phase} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { phase: Number(event.target.value) })} aria-label="Custom fortifier phase" /><span className="mt-1 block text-[10px] text-slate-500">Phase is 0–1.5; invalid values are blocked.</span></label><label><span className="lbl mb-1 block">kcal / unit</span><input className="inp min-h-10" type="number" min="0" disabled={!canModify} value={fortifier.kcalPerUnit} onChange={(event) => updateFortifier(fortifier.id, { kcalPerUnit: Number(event.target.value) })} /></label></div></div>)}</div>}{wizardStep === 5 && <div className="mt-4 grid gap-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{["2 hourly", "3 hourly", "4 hourly"].map((value) => <button type="button" key={value} disabled={!canModify} onClick={() => setFrequency(value)} className={`min-h-14 rounded-xl border text-sm font-black ${s.feedFreq === value ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300"}`}>{value}</button>)}<label className="rounded-xl border border-white/10 p-2"><span className="lbl mb-1 block">Custom hours</span><input className="inp min-h-10" type="number" min="0.5" max="24" step="0.5" disabled={!canModify} value={intervalHours ?? ""} onChange={(event) => { const hours = Number(event.target.value); if (hours >= 0.5 && hours <= 24) setFrequency(feedFrequencyLabel(hours)); }} placeholder="2.5" /></label></div><p className="text-xs text-slate-400">{snapshot.feedsPerDay ? `${showFluid(snapshot.feedsPerDay)} feeds/day` : "Choose an interval to calculate feeds/day"} · exact ideal feed: {idealFeedVolume > 0 ? `${showFluid(idealFeedVolume)} ml` : "not calculated"}</p></div>}{wizardStep === 6 && <div className="mt-4 grid gap-2 text-sm"><div className="rounded-xl bg-white/5 p-3"><b>Weight & mode</b><p className="text-slate-300">{dosingWeightConfirmed ? `${showFluid(dosingWeightKg)} kg (${showFluid(dosingWeightKg * 1000)} g), ${dailyMode ? "Advance daily" : "Fixed target"}` : "Dosing weight needs confirmation"}</p></div><div className="rounded-xl bg-white/5 p-3"><b>Fluids</b><p className="text-slate-300">{showFluid(totalFluid)} ml/kg/day · {showFluid(snapshot.enteralMlKgDay)} enteral + {showFluid(snapshot.ivMlKgDay)} IV/TPN</p></div><div className="rounded-xl bg-white/5 p-3"><b>Composition & feed</b><p className="text-slate-300">{fortifierSummary} · {s.feedFreq || "frequency not set"}</p></div>{warnings.length > 0 && <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100">{warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div>}<p className="text-xs text-slate-400">Nothing has been saved during this wizard. Review the choices above, then use Save plan.</p></div>}<div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3"><a href="#nutrition-help" className="text-xs font-bold text-cyan-200 underline" onClick={(event) => { event.preventDefault(); setHelpOpen((open) => !open); }}>Need help?</a><div className="flex gap-2"><button type="button" className="btn-secondary min-h-11" onClick={wizardBack}>Back</button><button type="button" className="btn-primary min-h-11" disabled={!canModify || (wizardStep === 6 && (!!conflict || mismatch || planIssues > 0 || !!targetChangePending))} onClick={() => void wizardNext()}>{wizardStep === 6 ? "Save plan" : "Next"}</button></div></div>{helpOpen && <p id="nutrition-help" className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-relaxed text-cyan-50">{wizardHelp[Math.min(wizardStep - 1, 4)]} This workflow reflects common NNF/AAP bedside principles; follow local unit policy and the prescribing neonatologist’s order.</p>}</div></Section></div>;
  }
  return (
    <div className="grid gap-3">
      <Section
        title="Fluids, TPN & nutrition"
        right={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost min-h-9 text-[10px]" onClick={() => rememberView("today")}>Today&apos;s plan</button><span className={`rounded-full px-2 py-1 text-[9px] font-black ${planStatusClass}`}>Plan: {planStatus}</span><span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span>
            <button className="btn-primary" disabled={!canModify || !dosingWeightConfirmed || mismatch || planLimitError || volumeInvalid || !!conflict || hasFortifierValidationError || fortifierReferencePending || !!targetChangePending} onClick={() => void save()}>{mismatch ? "Reconcile before saving" : targetChangePending ? "Confirm target change below" : planLimitError || volumeInvalid ? "Fix fluid validation" : !dosingWeightConfirmed ? "Confirm dosing weight" : hasFortifierValidationError ? "Fix composition" : fortifierReferencePending ? "Confirm fortifier amount" : "Save 24-hour plan"}</button>
          </div>
        }
      >
        {header}
        <div className="sticky top-2 z-20 -mx-1 rounded-2xl bg-slate-950/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
          {conflict && <div className="mb-2 rounded-xl border border-rose-400/60 bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-100" role="alert"><div className="flex flex-wrap items-center justify-between gap-2"><span>{conflict}</span><button type="button" className="btn-secondary min-h-10 border-rose-300/50 text-rose-100" onClick={reloadServerPlan}>Reload newer plan</button></div><details className="mt-2 rounded-lg border border-rose-300/20 bg-slate-950/20 p-2"><summary className="cursor-pointer text-[10px]">Review server versus your draft before reloading</summary><div className="mt-1 grid grid-cols-2 gap-2 text-[10px] font-normal"><span>Server: Total {showFluid(d.baby.clinical?.fluids?.totalMlKgDay)} · Enteral {showFluid(d.baby.clinical?.fluids?.enteralMlKgDay)} · IV {showFluid(d.baby.clinical?.fluids?.ivMlKgDay)}</span><span>Draft: Total {showFluid(s.totalMlKgDay)} · Enteral {showFluid(s.enteralMlKgDay)} · IV {showFluid(s.ivMlKgDay)}</span></div></details></div>}
        <div className="mb-2 flex w-full rounded-xl border border-cyan-400/30 bg-slate-900 p-1" role="tablist" aria-label="Fluid prescription mode">
            <button type="button" role="tab" aria-selected={!dailyMode} onClick={() => setMode("fixed")} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black transition ${!dailyMode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>Fixed target</button>
            <button type="button" role="tab" aria-selected={dailyMode} onClick={() => setMode("daily")} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black transition ${dailyMode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>Advance daily</button>
          </div>
          <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-slate-500">Clinical density</span><div className="flex rounded-lg border border-white/10 bg-slate-900 p-0.5" role="group" aria-label="Clinical density"><button type="button" className={`min-h-9 rounded-md px-2 text-[10px] font-bold ${densityMode === "guided" ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`} onClick={() => setDensityMode("guided")}>Guided</button><button type="button" className={`min-h-9 rounded-md px-2 text-[10px] font-bold ${densityMode === "compact" ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`} onClick={() => setDensityMode("compact")}>Compact</button></div></div>
          {densityMode === "guided" && <p className="mb-2 rounded-lg bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-100">Guided mode keeps formulas, status explanations, and bedside safeguards visible. Switch to Compact for the same calculations with less instructional text.</p>}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <MetricCard label="Total fluids" targetText={`${fluidRange[0]}–${fluidRange[1]} ml/kg/day`} value={totalFluid} unit="ml/kg/day" secondary={activeWeightKg ? `= ${showFluid(totalFluid * activeWeightKg)} ml/day` : "Confirm dosing weight"} status={fluidStatus} trend={trends.fluids.points} trendKey="fluids" onTrend={setTrendMetric} formula={totalFluidFormula} onFormula={(title, text) => setFormula({ title, text: `${text} Absolute volume = ${showFluid(totalFluid)} × ${showFluid(activeWeightKg)} kg = ${showFluid(totalFluid * activeWeightKg)} ml/day.` })} />
            <MetricCard label="Energy" targetText={`${nutrition.kcalTarget[0]}–${nutrition.kcalTarget[1]} kcal/kg/day`} value={nutrition.totalKcal} unit="kcal/kg/day" secondary={activeWeightKg ? `= ${showFluid(nutrition.totalKcal * activeWeightKg)} kcal/day` : "Confirm dosing weight"} stateText={energyStateText} status={kcalStatus} trend={trends.kcal.points} trendKey="kcal" onTrend={setTrendMetric} formula={kcalFormula} onFormula={(title, text) => setFormula({ title, text: `${text} Absolute energy = ${showFluid(nutrition.totalKcal)} × ${showFluid(activeWeightKg)} kg = ${showFluid(nutrition.totalKcal * activeWeightKg)} kcal/day.` })} />
            <div className="col-span-2 md:col-span-1">
              <MetricCard label="GIR" targetText={`${girRange[0]}–${girRange[1]} mg/kg/min`} value={nutrition.gir} unit="mg/kg/min" secondary={activeWeightKg ? `= ${showFluid(nutrition.gir * activeWeightKg)} mg/min` : "Confirm dosing weight"} stateText={girStateText} status={girStatus} trend={trends.gir.points} trendKey="gir" onTrend={setTrendMetric} formula={girFormula} onFormula={(title, text) => setFormula({ title, text: `${text} Absolute glucose delivery = ${showFluid(nutrition.gir)} mg/kg/min × ${showFluid(activeWeightKg)} kg = ${showFluid(nutrition.gir * activeWeightKg)} mg/min.` })} />
            </div>
          </div>
          <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold ${warnings.length ? statusIsCritical ? "border-rose-400/50 bg-rose-500/15 text-rose-100" : "border-amber-400/50 bg-amber-400/15 text-amber-100" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"}`} role="status">
            {warnings.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            {warnings.length ? <ul className="space-y-0.5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <span>All values within target range.</span>}
          </div>
          {formula && (
            <div className="mt-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-[11px] text-cyan-50" role="dialog" aria-label={`${formula.title} formula`}>
              <div className="flex items-center justify-between gap-2"><b>{formula.title} formula</b><button type="button" className="text-cyan-200" onClick={() => setFormula(null)}>Close</button></div>
              <p className="mt-1 leading-relaxed">{formula.text}</p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/35 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-slate-100">Bedside plan summary</b><p className="text-[10px] text-slate-500">One-line read-back before applying or handing over.</p></div><button type="button" className={`btn-secondary min-h-10 ${planIssues ? "border-rose-300/50 text-rose-100" : "border-emerald-300/50 text-emerald-100"}`} onClick={() => setPlanCheckOpen((open) => !open)}>{planCheckOpen ? "Hide plan check" : "Check My Plan"}</button></div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold"><span className="rounded-lg bg-white/5 px-2 py-1">Dosing weight → {dosingWeightConfirmed ? `${showFluid(dosingWeightKg)} kg / ${showFluid(dosingWeightKg * 1000)} g` : "Confirm"}</span><span className="rounded-lg bg-white/5 px-2 py-1">Total → {showFluid(totalFluid)} ml/kg/d · {activeWeightKg ? `${showFluid(totalFluid * activeWeightKg)} ml/d` : "Confirm dosing weight"}</span><span className="rounded-lg bg-white/5 px-2 py-1">Split → {showFluid(snapshot.enteralMlKgDay)} + {showFluid(snapshot.ivMlKgDay)}</span><span className="rounded-lg bg-white/5 px-2 py-1">Feed → {fortifierSummary}</span><span className="rounded-lg bg-white/5 px-2 py-1">Volume → {feedVolumeValid ? `${showFluid(practicalFeedVolume)} ml (${showFluid(idealFeedVolume)} ideal)` : "Not calculated"}</span><span className="rounded-lg bg-white/5 px-2 py-1">Frequency → {s.feedFreq || "Not set"}</span><span className="rounded-lg bg-white/5 px-2 py-1">Energy → {energyStateText || `${showFluid(nutrition.totalKcal)} kcal/kg/d`}</span><span className="rounded-lg bg-white/5 px-2 py-1">GIR → {girStateText || `${showFluid(nutrition.gir)} mg/kg/min`}</span><span className="rounded-lg bg-white/5 px-2 py-1">Electrolytes → {electrolyteNeedsAttention ? "Needs attention" : (snapshot.ivMlKgDay ?? 0) > 0 ? "Entered / in range" : "Not ordered"}</span><span className={`rounded-lg px-2 py-1 ${warnings.length ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/10 text-emerald-100"}`}>Warnings → {warnings.length ? `${warnings.length} to review` : "None"}</span></div>
          {planCheckOpen && <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-2"><div className="grid gap-1.5 sm:grid-cols-2">{planChecks.map((item) => <div key={item.label} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${item.ok ? "bg-emerald-400/10 text-emerald-100" : item.warning ? "bg-amber-400/15 text-amber-100" : "bg-rose-500/15 text-rose-100"}`}><span aria-hidden>{item.ok ? "✓" : item.warning ? "⚠️" : "✕"}</span><span>{item.label}</span></div>)}</div><p className={`mt-2 text-xs font-black ${planIssues ? "text-rose-200" : "text-emerald-200"}`}>{planIssues ? `🔴 Cannot apply — resolve ${planIssues} issue${planIssues === 1 ? "" : "s"}` : "🟢 Ready to apply"}</p><p className="mt-1 text-[10px] text-slate-500">Consistency checker only — it does not recommend doses.</p></div>}
        </div>

        {densityMode === "guided" && <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-slate-100">Nutrition trends</b><span className="ml-2 text-[10px] text-slate-500">fluid, enteral, IV/TPN, energy, protein and GIR</span></div><div className="flex flex-wrap gap-1" role="group" aria-label="Trend window">{(["24h", "3d", "7d", "custom"] as const).map((window) => <button key={window} type="button" className={`min-h-9 rounded-lg px-2 text-[10px] font-black ${trendWindow === window ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-400"}`} onClick={() => setTrendWindow(window)}>{window === "custom" ? "Custom" : window}</button>)}</div></div><div className="mt-2 flex flex-wrap gap-1.5">{(Object.keys(trends) as TrendKey[]).map((key) => <button key={key} type="button" className={`min-h-9 rounded-lg border px-2 text-[10px] font-bold ${trendMetric === key ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-400"}`} onClick={() => setTrendMetric(key)}>{trends[key].label}</button>)}</div></div>}

        {densityMode === "guided" && selectedTrend && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><div><b className="text-xs text-slate-100">{selectedTrend.label} trend</b><span className="ml-2 text-[10px] text-slate-500">last {selectedTrend.points.length} recorded points · {selectedTrend.unit}</span></div><button type="button" className="text-[10px] text-slate-400 hover:text-white" onClick={() => setTrendMetric(null)}>Close</button></div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-7">
              {selectedTrend.points.map((point, index) => <div key={`${point.label}-${index}`} className="rounded-lg bg-slate-900/60 p-1.5 text-center"><span className="block truncate text-[9px] text-slate-500">{point.label}</span><b className="block text-[11px] tabular-nums text-slate-100">{showFluid(point.value)}</b></div>)}
            </div>
            {selectedTrend.points.length === 1 && <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><Info size={11} /> No prior snapshot is stored for this metric yet.</p>}
          </div>
        )}

        <div className={`mt-3 rounded-xl border p-3 ${weightAction ? "border-amber-400/50 bg-amber-400/10" : "border-white/10 bg-slate-900/35"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-slate-100">Dosing weight</div>
              <p className="mt-0.5 text-[10px] text-slate-400">Explicit weight used for every absolute ml/day and kcal/day calculation.</p>
              <p className="text-[10px] text-slate-500">Latest recorded weight: {latestGrowthWeight != null ? `${showFluid(latestGrowthWeight / 1000)} kg` : `${showFluid(d.baby.currentWeight / 1000)} kg`} · recorded {fmtTime(latestWeightEntry?.at ?? d.baby.updatedAt)} · dosing weight is never changed silently.</p>
              {weightAction && <p className="mt-1 text-[11px] font-semibold text-amber-100">Using {showFluid(Number(weightDraft))} kg (recorded {weightRecordLabel ? weightRecordLabel.slice(0, 10) : "latest weight"}) — confirm or update.</p>}
            </div>
            <div className="flex items-end gap-2">
              <label className="block"><span className="lbl mb-1 block">kg</span><input className="inp min-h-11 w-28 text-center text-sm font-black" type="number" inputMode="decimal" step="0.01" min="0.01" max="20" value={weightDraft} disabled={!canModify} onChange={(event) => { const next = event.target.value; setWeightDraft(next); if (next === String(dosingWeightKg) && dosingWeightValid) setWeightAction(null); else setWeightAction(weightAction === "start" ? "start" : "update"); }} onBlur={() => { const next = Number(weightDraft); setWeightError(!Number.isFinite(next) || next < 0.3 || next > 6 ? next >= 100 ? "This looks unusually high for a NICU patient. Enter dosing weight in kilograms, e.g. 1.42 kg." : "Check this weight — outside expected range for a NICU patient (0.3–6 kg)." : ""); }} /></label>
              {weightAction && <button type="button" className="btn-primary min-h-11" disabled={!canModify} onClick={confirmDosingWeight}>{weightAction === "start" ? `Confirm ${showFluid(Number(weightDraft))} kg` : "Update dosing weight"}</button>}
            </div>
          </div>
          {Number.isFinite(dosingWeightKg) && dosingWeightKg > 0 && <p className="mt-2 text-[10px] font-semibold text-slate-300">{showFluid(dosingWeightKg)} kg = {showFluid(dosingWeightKg * 1000)} g · used for absolute outputs</p>}
          {weightError && <p className="mt-2 text-[11px] font-bold text-rose-200" role="alert">{weightError}</p>}
          {!canModify && <p className="mt-2 text-[11px] font-semibold text-slate-400">View-only plan for {role || "this role"}. Credentialed resident, registrar, consultant, or admin action is required to change targets, TPN, composition, or dosing weight; nurses can log feeds.</p>}
          {!dosingWeightValid && <p className="mt-2 text-[11px] font-bold text-rose-200">Calculations are paused until a dosing weight from 0.3–6 kg is confirmed.</p>}
        </div>

        {dailyMode && (
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-2">
            <div className="mb-1 flex items-center justify-between gap-2"><b className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Plan metadata</b><span className="text-[9px] text-slate-500">compact context</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumField strict label="Plan day" value={day} onChange={(n) => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: Math.max(1, Math.round(n)) } }))} min={1} max={365} step={1} disabled={!canModify} placeholder="1" />
              <label className="block rounded-lg border border-white/10 bg-slate-900/40 p-2"><span className="lbl mb-1 block">Plan starts</span><input className="inp !min-h-10 !py-1 text-sm" type="date" disabled={!canModify} value={s.plan?.startDate ?? localDateIso()} onChange={(event) => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", startDate: event.target.value } }))} /></label>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-2 text-center"><span className="lbl block">Dosing weight</span><b className="mt-1 block text-sm text-slate-100">{activeWeightKg ? `${showFluid(activeWeightKg)} kg` : "Confirm"}</b><small className="text-[9px] text-slate-500">explicit plan weight</small></div>
            </div>
          </div>
        )}

        {!dailyMode && (mismatch || reconciliationNotice) && <div className="mt-3 rounded-xl border border-rose-400/60 bg-rose-500/15 p-3 text-[11px] font-semibold text-rose-100" role="alert">{mismatch ? <div>Enteral + IV/TPN ({showFluid(currentEnteral + currentIv)}) doesn&apos;t match Total ({showFluid(currentTotal)}) — reconcile before this plan can be applied.</div> : <div className="text-amber-100">{reconciliationNotice}</div>}{mismatch && <button type="button" className="btn-secondary mt-2 min-h-10 border-rose-300/50 text-rose-100" disabled={!canModify} onClick={autoFixReconciliation}>Auto-fix by scaling</button>}</div>}

        {dailyMode ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-2">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">Enteral feeds</b><span className="text-[9px] text-slate-500">ml/kg/day</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField strict label="Start" value={s.plan?.enteral?.startMlKgDay} onChange={setPlanNumber("enteral", "startMlKgDay")} min={0} max={300} step={1} disabled={!canModify} placeholder="20" />
                <NumField strict label="Change /24h" value={s.plan?.enteral?.changePer24h} onChange={setPlanNumber("enteral", "changePer24h")} min={-300} max={300} step={1} disabled={!canModify} placeholder="+20" />
                <NumField strict label="Maximum" value={s.plan?.enteral?.maximumMlKgDay} onChange={setPlanNumber("enteral", "maximumMlKgDay")} min={0} max={300} step={1} disabled={!canModify} placeholder="160" />
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.04] p-2 text-[11px] text-slate-200"><b>{todayLabel}:</b> <FormulaValue onOpen={() => setFormula({ title: "Enteral target", text: `Enteral target = start ${showFluid(s.plan?.enteral?.startMlKgDay)} + change ${showFluid(s.plan?.enteral?.changePer24h)} × (day ${day} − 1), clamped by the plan limits.` })}>{showFluid(snapshot.enteralMlKgDay)}</FormulaValue> ml/kg/day · <FormulaValue onOpen={() => setFormula({ title: "Enteral volume", text: `Enteral ml/day = enteral ml/kg/day × dosing weight = ${showFluid(snapshot.enteralMlKgDay)} × ${showFluid(activeWeightKg)}.` })}>{showFluid(snapshot.enteralMlDay)}</FormulaValue> ml/day</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-2">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">IV / TPN</b><span className="text-[9px] text-slate-500">ml/kg/day</span></div>
              <div className="grid grid-cols-4 gap-1.5">
                <NumField strict label="Start" value={s.plan?.iv?.startMlKgDay} onChange={setPlanNumber("iv", "startMlKgDay")} min={0} max={300} step={1} disabled={!canModify} placeholder="80" />
                <NumField strict label="Change /24h" value={s.plan?.iv?.changePer24h} onChange={setPlanNumber("iv", "changePer24h")} min={-300} max={300} step={1} disabled={!canModify} placeholder="−10" />
                <NumField strict label="Minimum" value={s.plan?.iv?.minimumMlKgDay} onChange={setPlanNumber("iv", "minimumMlKgDay")} min={0} max={300} step={1} disabled={!canModify} placeholder="40" />
                <NumField strict label="Maximum" value={s.plan?.iv?.maximumMlKgDay} onChange={setPlanNumber("iv", "maximumMlKgDay")} min={0} max={300} step={1} disabled={!canModify} placeholder="160" />
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.04] p-2 text-[11px] text-slate-200"><b>{todayLabel}:</b> <FormulaValue onOpen={() => setFormula({ title: "IV target", text: `IV target = start ${showFluid(s.plan?.iv?.startMlKgDay)} + change ${showFluid(s.plan?.iv?.changePer24h)} × (day ${day} − 1), clamped by the plan limits.` })}>{showFluid(snapshot.ivMlKgDay)}</FormulaValue> ml/kg/day · <FormulaValue onOpen={() => setFormula({ title: "IV volume", text: `IV ml/day = IV ml/kg/day × dosing weight = ${showFluid(snapshot.ivMlKgDay)} × ${showFluid(activeWeightKg)}.` })}>{showFluid(snapshot.ivMlDay)}</FormulaValue> ml/day</div>
            </div>
            <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/35 p-2 text-[11px] text-slate-200"><div className="mb-1 flex items-center justify-between"><b>Today&apos;s 24-hour plan</b><span className="text-[9px] text-slate-500">enteral + IV/TPN</span></div><div className="grid grid-cols-3 gap-2 text-center"><div><span className="block text-[9px] text-slate-500">Enteral</span><FormulaValue onOpen={() => setFormula({ title: "Enteral target", text: "Calculated from the advance-daily enteral start, change, day, and limits." })}>{showFluid(snapshot.enteralMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.enteralMlDay)} ml/day</small></div><div><span className="block text-[9px] text-slate-500">IV / TPN</span><FormulaValue onOpen={() => setFormula({ title: "IV target", text: "Calculated from the advance-daily IV start, change, day, and limits." })}>{showFluid(snapshot.ivMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.ivMlDay)} ml/day</small></div><div><span className="block text-[9px] text-slate-500">Total</span><FormulaValue onOpen={() => setFormula({ title: "Total fluids", text: totalFluidFormula })}>{showFluid(snapshot.totalMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.totalMlDay)} ml/day</small></div></div><p className="mt-2 text-[10px] text-slate-500">{snapshot.feedMl !== undefined ? `${showFluid(snapshot.feedMl)} ml/feed at ${s.feedFreq}.` : snapshot.feedMlPerHour !== undefined ? `${showFluid(snapshot.feedMlPerHour)} ml/hour continuously.` : "Select a fixed hourly frequency to calculate volume per feed."}</p></div>
            <div className="md:col-span-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-cyan-100">Advance feed flow</b><p className="text-[10px] text-slate-400">Choose a unit before applying; maximum is enforced.</p></div><div className="flex rounded-lg border border-white/10 bg-slate-950/40 p-0.5"><button type="button" className={`min-h-10 rounded-md px-2 text-[10px] font-bold ${advanceSection === "enteral" ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`} onClick={() => { setAdvanceSection("enteral"); setAdvanceWeightConfirmed(false); }}>Enteral</button><button type="button" className={`min-h-10 rounded-md px-2 text-[10px] font-bold ${advanceSection === "iv" ? "bg-cyan-400 text-slate-950" : "text-slate-400"}`} onClick={() => { setAdvanceSection("iv"); setAdvanceWeightConfirmed(false); }}>IV / TPN</button></div></div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"><button type="button" className={`min-h-10 rounded-lg border text-[10px] font-bold ${advanceUnit === "per-day" ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-400"}`} onClick={() => { setAdvanceUnit("per-day"); setAdvanceWeightConfirmed(false); }}>Per day</button><button type="button" className={`min-h-10 rounded-lg border text-[10px] font-bold ${advanceUnit === "per-feed" ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-400"}`} onClick={() => { setAdvanceUnit("per-feed"); setAdvanceWeightConfirmed(false); }}>Per feed</button>{[5, 10].map((increment) => <button key={increment} type="button" className="min-h-10 rounded-lg border border-white/10 text-[10px] font-bold text-slate-300 disabled:opacity-40" disabled={!canModify} onClick={() => { setAdvanceUnit("per-day"); setAdvanceDraft(String(increment)); setAdvanceWeightConfirmed(false); }}>+{increment} ml/kg/d</button>)}</div>
              <div className="mt-2 flex gap-2"><input className="inp min-h-11 flex-1 text-center text-sm font-black" inputMode="decimal" type="number" min="0" step="0.1" value={advanceDraft} onChange={(event) => { setAdvanceDraft(event.target.value); setAdvanceWeightConfirmed(false); }} placeholder="Advance amount" disabled={!canModify} /><button type="button" className="btn-primary min-h-11" disabled={!canReviewAdvance || advanceConfirming} onClick={requestAdvance}>{advanceConfirming ? "Review below" : "Review advance"}</button></div>
              <p className={`mt-2 text-[10px] ${advanceReason ? "font-bold text-amber-200" : "text-slate-500"}`}>{advanceReason || `Preview: ${showFluid(advanceCurrent)} → ${showFluid(advanceNext)} ml/kg/day · ${showFluid(advanceCurrent * activeWeightKg)} → ${showFluid(advanceNext * activeWeightKg)} ml/day · day ${(s.plan?.day ?? 1) + 1}`}</p>
              {advanceConfirming && <div className="mt-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-2 text-[11px] text-cyan-50"><b>Confirm this clinical change</b><p className="mt-1">{advanceSection === "enteral" ? "Enteral" : "IV / TPN"}: {showFluid(advanceCurrent)} → {showFluid(advanceNext)} ml/kg/day ({showFluid(advanceCurrent * activeWeightKg)} → {showFluid(advanceNext * activeWeightKg)} ml/day). Dosing weight: {showFluid(activeWeightKg)} kg ({showFluid(activeWeightKg * 1000)} g). Effective: {new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit" })} onward.</p><label className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-cyan-300/20 px-2 text-[10px] font-semibold"><input type="checkbox" checked={advanceWeightConfirmed} onChange={(event) => setAdvanceWeightConfirmed(event.target.checked)} className="accent-cyan-400" /> I confirm this dosing weight and the proposed advance.</label><div className="mt-2 flex gap-2"><button type="button" className="btn-secondary min-h-10" disabled={advanceApplying} onClick={() => { setAdvanceConfirming(false); setAdvanceWeightConfirmed(false); }}>Cancel</button><button type="button" className="btn-primary min-h-10" disabled={!canApplyAdvance} onClick={applyAdvance}>{advanceApplying ? "Applying…" : "Confirm & apply"}</button></div></div>}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2"><button type="button" className="btn-secondary min-h-10" disabled={!canModify || !dosingWeightConfirmed || mismatch || !!conflict} onClick={advanceDay}>Confirm dosing weight & advance day</button><button type="button" className={`btn-secondary min-h-10 ${s.plan?.holdToday ? "border-amber-300/50 text-amber-200" : ""}`} disabled={!canModify} onClick={holdToday}>{s.plan?.holdToday ? "Release hold" : "Hold today"}</button><button type="button" className="btn-secondary min-h-10" disabled={!canModify} onClick={resetDay}>Reset to day 1</button></div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div><NumField strict label="Total fluids ml/kg/d" value={s.totalMlKgDay ?? undefined} onChange={(n) => updateFixedFluid("total", n)} min={0} max={300} step={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{fluidDriver === "total" ? "● Driving · enteral + IV follow" : "Following / derived"} · {activeWeightKg ? `= ${showFluid(currentTotal * activeWeightKg)} ml/day` : "confirm kg"}</span></div>
            <div><NumField strict label="Enteral ml/kg/d" value={s.enteralMlKgDay ?? undefined} onChange={(n) => updateFixedFluid("enteral", n)} min={0} max={300} step={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{fluidDriver === "enteral" ? "● Driving · IV follows" : "Following / derived"} · {activeWeightKg ? `= ${showFluid(currentEnteral * activeWeightKg)} ml/day` : "confirm kg"}</span></div>
            <div><NumField strict label="IV ml/kg/d" value={s.ivMlKgDay ?? undefined} onChange={(n) => updateFixedFluid("iv", n)} min={0} max={300} step={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{fluidDriver === "iv" ? "● Driving · enteral follows" : "Following / derived"} · {activeWeightKg ? `= ${showFluid(currentIv * activeWeightKg)} ml/day` : "confirm kg"}</span></div>
            <label className="rounded-xl border border-white/10 bg-slate-900/50 p-2"><span className="lbl mb-1 block">Dextrose % <span className="text-amber-300">required for GIR</span></span><input className="inp min-h-11 text-center text-base font-black" inputMode="decimal" type="number" min="0" max="40" step="0.1" value={dextroseDraft} disabled={!canModify} onChange={(event) => setDextroseDraft(event.target.value)} onBlur={commitDextrose} placeholder="5–30" />{dextroseError && <span className="mt-1 block text-[10px] font-bold text-rose-200">{dextroseError}</span>}</label>
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2"><span className="lbl mb-1 block">GIR mg/kg/min</span><FormulaValue onOpen={() => setFormula({ title: "GIR", text: girFormula })} className="text-base font-black text-white">{girStateText || (dextroseValid ? showFluid(nutrition.gir) : "Add dextrose %")}</FormulaValue><span className="mt-1 block text-[9px] text-slate-500">read-only derived value</span></div>
            <div><NumField strict label="Amino acid g/kg/d" value={s.aminoAcid ?? undefined} onChange={set("aminoAcid")} min={0} max={5} step={0.1} decimals={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{activeWeightKg && s.aminoAcid != null ? `= ${showFluid(s.aminoAcid * activeWeightKg)} g/day` : "confirm kg for g/day"}</span></div>
            <div><NumField strict label="Lipid g/kg/d" value={s.lipid ?? undefined} onChange={set("lipid")} min={0} max={5} step={0.1} decimals={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{activeWeightKg && s.lipid != null ? `= ${showFluid(s.lipid * activeWeightKg)} g/day` : "confirm kg for g/day"}</span></div>
            <div><NumField strict label="Energy target kcal/kg/d" value={s.kcal ?? undefined} onChange={set("kcal")} min={0} max={200} step={1} disabled={!canModify} placeholder="enter" /><span className="ml-1 text-[9px] text-slate-500">{activeWeightKg && s.kcal != null ? `= ${showFluid(s.kcal * activeWeightKg)} kcal/day` : "confirm kg for kcal/day"}</span></div>
            <NumField strict label="Feed volume / feed (ml)" value={s.feedVol ?? undefined} onChange={set("feedVol")} min={0} max={120} step={1} disabled={!canModify} placeholder="enter" />
          </div>
        )}

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3"><div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">Fluid allocation</b><FormulaValue onOpen={() => setFormula({ title: "Fluid allocation", text: `Enteral ${showFluid(enteralFluidValue)} + IV/TPN ${showFluid(ivFluidValue)} = ${showFluid(enteralFluidValue + ivFluidValue)} ml/kg/day; compare with Total ${showFluid(totalFluid)}.` })} className="text-[10px] text-cyan-100">ⓘ formula</FormulaValue></div><div className="flex h-8 overflow-hidden rounded-lg bg-slate-950/60" aria-label={`Enteral ${showFluid(enteralFluidValue)} and IV/TPN ${showFluid(ivFluidValue)} ml/kg/day`}><div className="flex items-center justify-center bg-cyan-400/70 text-[9px] font-black text-slate-950" style={{ width: `${enteralBarPercent}%` }}>{enteralBarPercent > 12 ? `Enteral ${showFluid(enteralFluidValue)}` : ""}</div><div className="flex flex-1 items-center justify-center bg-indigo-400/60 text-[9px] font-black text-white">{100 - enteralBarPercent > 16 ? `IV/TPN ${showFluid(ivFluidValue)}` : ""}</div></div><div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>Enteral {showFluid(enteralFluidValue)}</span><span>IV/TPN {showFluid(ivFluidValue)}</span><span>Total {showFluid(totalFluid)}</span></div></div>

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><b className="text-xs text-slate-100">Feed volume</b><p className="text-[10px] text-slate-500">Ideal value is used in all calculations; draw-up rounding is display-only.</p></div><span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-100">{feedIsContinuous ? "rate" : "bedside feed"}</span></div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><FormulaValue onOpen={() => setFormula({ title: feedIsContinuous ? "Continuous feed rate" : "Ideal feed volume", text: feedIsContinuous ? `Continuous feed rate = enteral ml/day ÷ 24 = ${showFluid(snapshot.enteralMlDay)} ÷ 24 = ${showFluid(snapshot.feedMlPerHour)} ml/hour.` : `Ideal feed volume = enteral ml/day ÷ feeds/day = ${showFluid(snapshot.enteralMlDay)} ÷ ${showFluid(snapshot.feedsPerDay)}. This exact value remains in downstream math.` })} className="text-xl font-black text-white">{idealFeedVolume > 0 ? showFluid(practicalFeedVolume) : "Not yet calculated"}</FormulaValue>{idealFeedVolume > 0 && <span className="text-xs text-slate-400">{feedIsContinuous ? "ml/hour" : "ml draw up"} <span className="text-slate-500">(ideal {showFluid(idealFeedVolume)} ml{feedIsContinuous ? "/hour" : ""})</span></span>}</div>
          {snapshot.feedsPerDay && <p className="mt-1 text-[10px] text-slate-400">{showFluid(snapshot.feedsPerDay)} feeds/day · every {s.feedFreq} · ideal daily enteral volume {showFluid(snapshot.enteralMlDay)} ml/day{practicalSplit && practicalSplit.remainder > 0 ? ` · Practical split: ${practicalSplit.regularCount} × ${showFluid(practicalFeedVolume)} ml + 1 × ${showFluid(practicalSplit.remainder)} ml` : ""}</p>}
          {feedsGivenToday.length > 0 && <p className="mt-1 text-[10px] font-semibold text-emerald-200">{feedsGivenToday.length} feed{feedsGivenToday.length === 1 ? "" : "s"} logged today.</p>}
          {canLogFeed && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]"><label className="block"><span className="lbl mb-1 block">Actual volume ml</span><input className="inp min-h-10 text-xs" inputMode="decimal" type="number" min="0" step="0.1" value={feedLogVolume} onChange={(event) => setFeedLogVolume(event.target.value)} placeholder={idealFeedVolume > 0 ? showFluid(idealFeedVolume) : "actual"} /></label><label className="block"><span className="lbl mb-1 block">Outcome</span><select className="inp min-h-10 text-xs" value={feedLogStatus} onChange={(event) => setFeedLogStatus(event.target.value as typeof feedLogStatus)}><option value="given">Given</option><option value="held">Held</option><option value="refused">Refused</option><option value="emesis">Emesis</option></select></label><label className="block"><span className="lbl mb-1 block">Reason / note</span><input className="inp min-h-10 text-xs" value={feedLogReason} onChange={(event) => setFeedLogReason(event.target.value)} placeholder="optional" /></label><button type="button" className="btn-secondary min-h-10 self-end" disabled={feedLogVolume !== "" && (!Number.isFinite(Number(feedLogVolume)) || Number(feedLogVolume) < 0)} onClick={() => void recordFeedGiven()}>Log outcome</button></div>}
        </div>

        <details className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3"><summary className="cursor-pointer text-xs font-black text-slate-100">Today&apos;s feed timeline <span className="ml-1 text-[10px] font-normal text-slate-500">GIVEN is historical · PLANNED is prospective</span></summary><div className="mt-2 space-y-1.5 text-[10px]">{feedTimelineToday.map((feed) => <div key={feed.at} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-400/10 px-2 py-1.5 text-emerald-100"><span><b>GIVEN</b> · {new Date(feed.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {feed.status ?? "given"}</span><span>{showFluid(feed.volumeMl)} ml actual{feed.plannedVolumeMl != null ? ` · planned ${showFluid(feed.plannedVolumeMl)} ml` : ""}</span></div>)}{plannedNextFeedAt && <div className="flex items-center justify-between gap-2 rounded-lg bg-cyan-400/10 px-2 py-1.5 text-cyan-100"><span><b>PLANNED</b> · {plannedNextFeedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} onward · {s.feedFreq}</span><span>{showFluid(idealFeedVolume)} ml ideal</span></div>}{!feedTimelineToday.length && !plannedNextFeedAt && <p className="text-slate-500">No historical feeds logged today. Log actual outcome above; planned values will remain separate.</p>}{feedTimelineToday.length > 0 && <p className="mt-2 text-[10px] text-slate-400">Given earlier today: {showFluid(actualFeedVolumeToday)} ml actual · planned from now: {showFluid(idealFeedVolume)} ml/feed · projected 24-hour total: {projectedFeedVolumeToday != null ? `${showFluid(projectedFeedVolumeToday)} ml` : "not calculated"}.</p>}</div></details>

        <details className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3"><summary className="cursor-pointer text-xs font-black text-slate-100">Fluid balance <span className="ml-1 text-[10px] font-normal text-slate-500">optional output side · rolling 24 hours</span></summary><div className="mt-2 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-white/5 p-2"><span className="lbl block">Projected intake</span><b className="mt-1 block text-sm text-slate-100">{projectedIntake > 0 ? `${showFluid(projectedIntake)} ml/day` : "Not calculated"}</b></div><div className="rounded-xl bg-white/5 p-2"><span className="lbl block">Urine output</span><b className="mt-1 block text-sm text-slate-100">{output24.length ? `${showFluid(outputUrine)} ml/24h` : "Not recorded"}</b><small className="text-[9px] text-slate-500">{activeWeightKg ? `${showFluid(outputUrine / activeWeightKg / 24)} ml/kg/hr average` : "confirm kg for normalized rate"}</small></div><div className="rounded-xl bg-white/5 p-2"><span className="lbl block">Measured output</span><b className="mt-1 block text-sm text-slate-100">{output24.length ? `${showFluid(outputMeasured)} ml/24h` : "Not recorded"}</b></div><div className={`rounded-xl p-2 ${netBalance >= 0 ? "bg-cyan-400/10" : "bg-amber-400/10"}`}><span className="lbl block">Net balance</span><b className="mt-1 block text-sm text-slate-100">{projectedIntake > 0 && output24.length ? `${netBalance >= 0 ? "+" : ""}${showFluid(netBalance)} ml` : "Not calculated"}</b></div></div><div className="mt-3 grid gap-2 sm:grid-cols-5"><label><span className="lbl mb-1 block">Urine ml</span><input className="inp min-h-10" type="number" min="0" step="0.1" value={outputDraft.urineMl} onChange={(event) => setOutputDraft((draft) => ({ ...draft, urineMl: event.target.value }))} placeholder="optional" /></label><label><span className="lbl mb-1 block">Gastric aspirate ml</span><input className="inp min-h-10" type="number" min="0" step="0.1" value={outputDraft.gastricAspirateMl} onChange={(event) => setOutputDraft((draft) => ({ ...draft, gastricAspirateMl: event.target.value }))} placeholder="optional" /></label><label><span className="lbl mb-1 block">Stool ml</span><input className="inp min-h-10" type="number" min="0" step="0.1" value={outputDraft.stoolMl} onChange={(event) => setOutputDraft((draft) => ({ ...draft, stoolMl: event.target.value }))} placeholder="measured" /></label><label><span className="lbl mb-1 block">Insensible ml</span><input className="inp min-h-10" type="number" min="0" step="0.1" value={outputDraft.insensibleMl} onChange={(event) => setOutputDraft((draft) => ({ ...draft, insensibleMl: event.target.value }))} placeholder="optional" /></label><label><span className="lbl mb-1 block">Stool category</span><select className="inp min-h-10" value={outputDraft.stool} onChange={(event) => setOutputDraft((draft) => ({ ...draft, stool: event.target.value as typeof draft.stool }))}><option value="none">None recorded</option><option value="small">Small</option><option value="moderate">Moderate</option><option value="large">Large</option></select></label></div><div className="mt-2 flex flex-wrap gap-2"><input className="inp min-h-10 flex-1" value={outputDraft.note} onChange={(event) => setOutputDraft((draft) => ({ ...draft, note: event.target.value }))} placeholder="Output note / timestamp context" /><button type="button" className="btn-secondary min-h-10" disabled={!canLogFeed} onClick={() => void recordOutput()}>Record output</button></div>{output24.length > 0 && <div className="mt-2 space-y-1 text-[10px] text-slate-400">{output24.slice(-5).reverse().map((entry) => <div key={entry.at} className="flex justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"><span>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · urine {showFluid(entry.urineMl ?? 0)} ml · aspirate {showFluid(entry.gastricAspirateMl ?? 0)} ml</span><span>{entry.stool ?? "no stool"}</span></div>)}</div>}</details>

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-slate-100">Nutrition detail</b><span className="ml-2 text-[9px] text-slate-500">calculated from current prescription</span></div>{dailyMode && <label className="flex items-center gap-1 text-[10px] text-slate-400">Dextrose % <input className="inp min-h-9 w-20 text-center text-xs font-black" inputMode="decimal" type="number" min="0" max="40" step="0.1" value={dextroseDraft} disabled={!canModify} onChange={(event) => setDextroseDraft(event.target.value)} onBlur={commitDextrose} placeholder="5–30" /></label>}</div>
          {dextroseError && dailyMode && <p className="mb-2 text-[10px] font-bold text-rose-200">{dextroseError}</p>}
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div><span className="block text-slate-500">Enteral energy</span><FormulaValue onOpen={() => setFormula({ title: "Enteral energy", text: `Enteral energy = ${showFluid(nutrition.enteralMl)} ml/kg/day × ${nutrition.density} kcal/ml.` })}>{feedsHeld ? "Feeds on hold" : feedsNotStarted ? "Not started" : showFluid(nutrition.enteralKcal)}</FormulaValue>{!feedsHeld && !feedsNotStarted && " kcal/kg/d"}</div>
            <div><span className="block text-slate-500">IV / TPN energy</span><FormulaValue onOpen={() => setFormula({ title: "IV / TPN energy", text: `IV energy combines dextrose (${showFluid(nutrition.dextroseKcal)}), amino acid (${showFluid(nutrition.aaKcal)}), and lipid (${showFluid(nutrition.lipidKcal)}) kcal/kg/day.` })}>{ivHeld ? "IV/TPN held" : ivNotStarted ? "Not started" : showFluid(nutrition.ivKcal)}</FormulaValue>{!ivHeld && !ivNotStarted && " kcal/kg/d"}</div>
            <div><span className="block text-slate-500">Protein</span><FormulaValue onOpen={() => setFormula({ title: "Protein", text: `Protein = enteral protein (${showFluid(nutrition.enteralProtein)}) + amino acid (${showFluid(nutrition.aaG)}) g/kg/day.` })}>{feedsHeld && ivHeld ? "Feeds/IV held" : showFluid(nutrition.totalProtein)}</FormulaValue>{!(feedsHeld && ivHeld) && " g/kg/d"}</div>
            <div><span className="block text-slate-500">Dextrose</span><FormulaValue onOpen={() => setFormula({ title: "Dextrose", text: `Dextrose grams = GIR × 1.44 = ${showFluid(nutrition.gir)} × 1.44.` })}>{ivHeld ? "IV/TPN held" : !dextroseValid ? "Add dextrose %" : showFluid(nutrition.dextroseG)}</FormulaValue>{!ivHeld && dextroseValid && " g/kg/d"}</div>
          </div>
          {(nutrition.mctKcal > 0 || nutrition.fortifierKcal > 0 || nutrition.fortifierProtein > 0) && <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-300"><span className="rounded-lg bg-white/5 px-2 py-1">Fortifier calories: {showFluid(nutrition.fortifierKcal)} kcal/kg/day · {activeWeightKg ? `${showFluid(nutrition.fortifierKcal * activeWeightKg)} kcal/day` : "confirm kg"}</span><span className="rounded-lg bg-white/5 px-2 py-1">Fortifier protein: {showFluid(nutrition.fortifierProtein)} g/kg/day · {activeWeightKg ? `${showFluid(nutrition.fortifierProtein * activeWeightKg)} g/day` : "confirm kg"}</span>{mctFortifiers.length > 0 && <FormulaValue onOpen={() => setFormula({ title: "MCT contribution", text: `MCT = ${showFluid(mctMlPerFeed)} ml/feed × ${showFluid(snapshot.feedsPerDay)} feeds/day = ${showFluid(mctMlPerDay)} ml/day; configured kcal/ml is shown in the fortifier row. The separate MCT energy contribution is ${showFluid(nutrition.mctKcal)} kcal/kg/day.` })} className="rounded-lg bg-amber-400/10 px-2 py-1 text-amber-100">MCT: {showFluid(mctMlPerFeed)} ml/feed · {showFluid(mctMlPerDay)} ml/day · {showFluid(nutrition.mctKcal)} kcal/kg/day</FormulaValue>}</div>}
        </div>

        {(snapshot.ivMlKgDay ?? 0) > 0 && <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3"><div className="mb-2 flex items-start justify-between gap-2"><div><b className="text-xs text-slate-100">Electrolytes</b><p className="text-[10px] text-slate-500">Required while IV/TPN is running · {s.electrolyteUnit ?? "mEq/kg/day"}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${ivHeld ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-slate-400"}`}>{ivHeld ? "IV held" : "detail tier"}</span></div>{ivHeld ? <p className="text-[11px] font-semibold text-amber-200">IV/TPN held — electrolyte prescription paused.</p> : <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{([{ key: "na", label: "Na", target: [2, 4] }, { key: "k", label: "K", target: [1, 3] }, { key: "ca", label: "Ca", target: [1.5, 3.5] }, { key: "po4", label: "PO₄", target: [1, 2] }] as const).map((row) => { const value = s.electrolytes?.[row.key]; const normalized = electrolyteToMEq(row.key, value); const valence = row.key === "ca" || row.key === "po4" ? 2 : 1; const status = normalized == null ? "neutral" : rangeStatus(normalized, row.target[0], row.target[1]); return <div key={row.key} className="rounded-xl border border-white/10 bg-slate-900/50 p-2"><div className="flex items-center justify-between gap-1"><span className="lbl">{row.label}</span><span className={`h-2.5 w-2.5 rounded-full border ${METRIC_RING[status]}`} /></div><NumField strict label={`${row.label} ${s.electrolyteUnit ?? "mEq/kg/day"}`} value={value} onChange={(next) => { if (!canModify) return; if (!Number.isFinite(next) || next < 0) { setReconciliationNotice("Electrolyte values cannot be negative or non-numeric."); return; } setS((p) => ({ ...p, electrolytes: { ...(p.electrolytes ?? {}), [row.key]: next } })); }} min={0} max={10} step={0.1} decimals={2} disabled={!canModify} placeholder="Not entered" /><FormulaValue onOpen={() => setFormula({ title: `${row.label} formula`, text: `${row.label} entered = ${showFluid(value)} ${s.electrolyteUnit ?? "mEq/kg/day"}; normalized for target comparison = ${showFluid(value)} × ${s.electrolyteUnit === "mmol/kg/day" ? `valence ${valence}` : "1 (mEq already normalized)"} = ${showFluid(normalized)} mEq/kg/day; absolute = ${showFluid(normalized)} × ${showFluid(activeWeightKg)} kg = ${showFluid(normalized == null ? undefined : normalized * activeWeightKg)} mEq/day.` })} className="mt-1 text-[9px] text-slate-500">{value == null ? "Not entered" : `${showFluid(normalized == null ? undefined : normalized * activeWeightKg)} mEq/day absolute`} · formula</FormulaValue>{value != null && status !== "safe" && <p className="mt-1 text-[9px] font-semibold text-amber-200">{normalized != null && normalized < row.target[0] ? "Below" : "Above"} target {row.target[0]}–{row.target[1]} mEq/kg/day</p>}{value == null && <p className="mt-1 text-[9px] font-semibold text-amber-200">Not entered</p>}</div>; })}</div>}</div>}
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35">
          <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={configOpen} onClick={() => setConfigOpen((open) => !open)}><span><span className="block text-xs font-black text-slate-100">Prescription details</span><span className="text-[10px] text-slate-500">Feed type · route · frequency</span></span><ChevronDown className={`h-4 w-4 text-cyan-300 transition-transform ${configOpen ? "rotate-180" : ""}`} /></button>
          {configOpen && <div className="space-y-3 border-t border-white/10 p-2">
            <div><div className="lbl mb-1">BASE MILK</div><CompactPicker label="Base milk" options={FEED_TYPE} value={s.feedType} onChange={(value) => { if (canModify) setS((p) => ({ ...p, feedType: value })); }} otherPlaceholder="Other base milk…" />{s.feedType && <p className="mt-1 text-[10px] text-slate-400">Base energy density: <b className="text-slate-200">{s.baseMilkKcalPerMl ?? (KCAL_PER_ML[s.feedType] != null ? `${KCAL_PER_ML[s.feedType]}` : "enter local reference")} {KCAL_PER_ML[s.feedType] != null || s.baseMilkKcalPerMl != null ? "kcal/ml" : ""}</b></p>}{canModify && <div className="mt-2 grid grid-cols-2 gap-2"><NumField strict label="Configured kcal/ml" value={s.baseMilkKcalPerMl ?? (s.feedType && KCAL_PER_ML[s.feedType] != null ? KCAL_PER_ML[s.feedType] : undefined)} onChange={(value) => setS((p) => ({ ...p, baseMilkKcalPerMl: value }))} min={0} max={10} step={0.01} decimals={2} disabled={!canModify} placeholder="hospital value" /><NumField strict label="Protein g/100 ml" value={s.baseMilkProteinGPer100Ml ?? (s.feedType && PROTEIN_G_PER_ML[s.feedType] != null ? PROTEIN_G_PER_ML[s.feedType] * 100 : undefined)} onChange={(value) => setS((p) => ({ ...p, baseMilkProteinGPer100Ml: value }))} min={0} max={20} step={0.1} decimals={2} disabled={!canModify} placeholder="hospital value" /></div>}</div>
            <div><div className="lbl mb-1">ROUTE</div><CompactPicker label="Route" options={FEED_ROUTE} value={s.feedRoute} onChange={(value) => { if (canModify) setS((p) => ({ ...p, feedRoute: value })); }} otherPlaceholder="Other route…" /></div>
            <div><div className="lbl mb-1">FEEDING INTERVAL</div><CompactPicker label="Frequency" options={["0.5 hourly", "1 hourly", "1.5 hourly", "2 hourly", "2.5 hourly", "3 hourly", "4 hourly", "continuous", "2–3 hourly on demand"]} value={s.feedFreq} onChange={setFrequency} otherPlaceholder="Other frequency…" /><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><Stepper label="30-minute interval stepper" value={intervalHours} onChange={setIntervalHours} min={0.5} max={24} step={0.5} unit="h" disabled={!canModify} /><div className="rounded-xl border border-white/10 bg-slate-900/50 p-2"><span className="lbl mb-1 block">QUICK PICKS</span><div className="grid grid-cols-3 gap-1.5">{[1, 2, 2.5, 3, 3.5, 4, 6].map((hours) => <button key={hours} type="button" className={`min-h-10 rounded-lg border px-1 text-[10px] font-bold ${intervalHours === hours ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300"}`} disabled={!canModify} onClick={() => setIntervalHours(hours)}>{hours} h</button>)}</div>{intervalHours && <p className="mt-2 text-[10px] text-slate-400">{showFluid(24 / intervalHours)} feeds/day · 30-minute increments only</p>}</div></div></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-2"><div className="mb-2 flex items-center justify-between gap-2"><div><b className="text-xs text-slate-100">Feed composition</b><p className="text-[10px] text-slate-500">{fortifierSummary}</p></div><button type="button" className="btn-secondary min-h-10" disabled={!canModify} onClick={addFortifier}>+ Fortifier</button></div>{fortifiers.length === 0 && <p className="text-[10px] text-slate-500">Add independently dosed fortifiers; each keeps its own dilution and phase.</p>}{fortifiers.map((fortifier) => <div key={fortifier.id} className="mb-2 rounded-lg border border-white/10 bg-slate-900/50 p-2 last:mb-0"><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-6"><label><span className="lbl mb-1 block">Name</span><input className="inp min-h-10 text-xs" value={fortifier.name} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { name: event.target.value })} /></label><label><span className="lbl mb-1 block">kcal / unit</span><input className="inp min-h-10 text-xs" type="number" min="0" step="0.01" value={fortifier.kcalPerUnit} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { kcalPerUnit: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Dilution / ref ml</span><input className="inp min-h-10 text-xs" type="number" min="0.1" step="0.1" value={fortifier.referenceVolumeMl} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { referenceVolumeMl: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Phase</span><select className="inp min-h-10 text-xs" value={fortifier.phase} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { phase: Number(event.target.value) })}><option value="0.25">1/4</option><option value="0.5">1/2</option><option value="0.75">3/4</option><option value="1">Full</option><option value={fortifier.phase}>Custom {fortifier.phase}</option></select><input className="inp mt-1 min-h-8 text-[10px]" aria-label="Custom phase fraction" type="number" min="0" max="1.5" step="0.01" value={fortifier.phase} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { phase: Number(event.target.value) })} placeholder="Custom 0–1.5" /></label><label><span className="lbl mb-1 block">Amount / feed</span><input className="inp min-h-10 text-xs" type="number" min="0" step="0.1" value={fortifier.amount ?? 1} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { amount: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Amount unit</span><select className="inp min-h-10 text-xs" value={fortifier.amountUnit ?? "sachet"} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { amountUnit: event.target.value as "sachet" | "ml" | "g" | "scoop" | "unit" | "custom" })}><option value="sachet">sachet</option><option value="ml">ml</option><option value="g">g</option><option value="scoop">scoop</option><option value="unit">unit</option><option value="custom">custom</option></select></label></div><div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5"><label><span className="lbl mb-1 block">Type</span><input className="inp min-h-9 text-[10px]" value={fortifier.type ?? ""} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { type: event.target.value })} placeholder="powder / oil / modular" /></label><label><span className="lbl mb-1 block">Protein / unit</span><input className="inp min-h-9 text-[10px]" type="number" min="0" step="0.01" value={fortifier.proteinPerUnit ?? 0} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { proteinPerUnit: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Min amount</span><input className="inp min-h-9 text-[10px]" type="number" min="0" step="0.1" value={fortifier.minimumAmount ?? 0} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { minimumAmount: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Max amount</span><input className="inp min-h-9 text-[10px]" type="number" min="0" step="0.1" value={fortifier.maximumAmount ?? 1.5} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { maximumAmount: Number(event.target.value) })} /></label><label><span className="lbl mb-1 block">Notes / instructions</span><input className="inp min-h-9 text-[10px]" value={fortifier.notes ?? ""} disabled={!canModify} onChange={(event) => updateFortifier(fortifier.id, { notes: event.target.value })} placeholder="local instruction" /></label></div>{fortifierWarnings.some((warning) => warning.startsWith(fortifier.name)) && <div className="mt-1"><p className="text-[10px] font-semibold text-amber-200">{fortifierWarnings.find((warning) => warning.startsWith(fortifier.name))}</p>{fortifier.confirmed ? <p className="text-[10px] text-emerald-200">Reference volume confirmed; amount was not auto-scaled.</p> : <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200" disabled={!canModify} onClick={() => updateFortifier(fortifier.id, { confirmed: true })}>Confirm fortifier amount (do not auto-scale)</button>}</div>}<button type="button" className="mt-1 text-[10px] text-rose-300" disabled={!canModify} onClick={() => removeFortifier(fortifier.id)}>Remove fortifier</button></div>)}</div>
            <div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-2 text-[11px] text-slate-300"><input type="checkbox" checked={ivHeld} disabled={!canModify} onChange={(event) => setS((p) => ({ ...p, ivHeld: event.target.checked }))} className="accent-cyan-400" /> IV/TPN held — suspend GIR</label><label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-2 text-[11px] text-slate-300"><input type="checkbox" checked={feedsHeld} disabled={!canModify} onChange={(event) => setS((p) => ({ ...p, feedsHeld: event.target.checked }))} className="accent-cyan-400" /> Feeds on hold</label></div>
            <div className="grid gap-2 sm:grid-cols-2"><NumField strict label="Draw-up increment (ml)" value={practicalIncrement} onChange={(value) => { if (!canModify) return; if (!Number.isFinite(value) || value <= 0) { setReconciliationNotice("Bedside rounding increment must be greater than 0 ml."); return; } setS((p) => ({ ...p, practicalIncrementMl: value })); }} min={0.01} max={10} step={0.1} decimals={2} disabled={!canModify} /><label className="block rounded-xl border border-white/10 bg-slate-950/20 p-2"><span className="lbl mb-1 block">Electrolyte unit</span><select className="inp min-h-11 text-xs" value={s.electrolyteUnit ?? "mEq/kg/day"} disabled={!canModify} onChange={(event) => setS((p) => ({ ...p, electrolyteUnit: event.target.value as FluidExtras["electrolyteUnit"] }))}><option>mEq/kg/day</option><option>mmol/kg/day</option></select></label></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-2"><div className="mb-2 flex items-center justify-between"><b className="text-xs text-slate-100">Authorized target settings</b><span className="text-[9px] text-slate-500">changes are audited</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-7"><NumField strict label="Fluid low" value={s.targets?.fluids?.[0]} onChange={(value) => updateTarget("fluids", 0, value)} min={0} max={300} step={1} disabled={!canModify} placeholder="fluid low" /><NumField strict label="Fluid high" value={s.targets?.fluids?.[1]} onChange={(value) => updateTarget("fluids", 1, value)} min={0} max={300} step={1} disabled={!canModify} placeholder="fluid high" /><NumField strict label="Energy low" value={s.targets?.energy?.[0]} onChange={(value) => updateTarget("energy", 0, value)} min={0} max={300} step={1} disabled={!canModify} placeholder="110" /><NumField strict label="Energy high" value={s.targets?.energy?.[1]} onChange={(value) => updateTarget("energy", 1, value)} min={0} max={300} step={1} disabled={!canModify} placeholder="135" /><NumField strict label="GIR low" value={s.targets?.gir?.[0]} onChange={(value) => updateTarget("gir", 0, value)} min={0} max={30} step={0.1} disabled={!canModify} placeholder="4" /><NumField strict label="GIR high" value={s.targets?.gir?.[1]} onChange={(value) => updateTarget("gir", 1, value)} min={0} max={30} step={0.1} disabled={!canModify} placeholder="12" /><NumField strict label="Max enteral" value={s.targets?.maximumEnteralMlKgDay} onChange={(value) => { if (canModify) { setS((p) => ({ ...p, targets: { ...(p.targets ?? {}), maximumEnteralMlKgDay: value } })); setTargetChangePending("Maximum enteral target changed. Confirm this target change before it is saved."); } }} min={0} max={300} step={1} disabled={!canModify} placeholder="150" /></div>{targetChangePending && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2 text-[10px] font-semibold text-amber-100"><span>⚠ {targetChangePending} Nothing is saved until you confirm.</span><button type="button" className="btn-secondary min-h-9 border-amber-300/50 text-amber-100" onClick={() => { setTargetChangePending(""); window.setTimeout(() => void saveRef.current(), 0); }}>Confirm target change &amp; save</button></div>}</div>
          </div>}
        </div>
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3"><summary className="cursor-pointer text-xs font-black text-slate-100">Fluid audit log <span className="ml-1 text-[10px] font-normal text-slate-500">credentialed changes and feed entries</span></summary>{fluidAuditEvents.length ? <ul className="mt-2 space-y-2">{fluidAuditEvents.map((event) => <li key={event.id} className="border-t border-white/10 pt-2 text-[10px] text-slate-300"><div className="flex justify-between gap-2"><span className="font-bold text-cyan-100">{event.kind}</span><span className="text-slate-500">{fmtTime(event.at)} · {event.author}</span></div><p className="mt-0.5">{event.text}</p></li>)}</ul> : <p className="mt-2 text-[10px] text-slate-500">No applied fluid changes or feed logs yet.</p>}</details>
      </Section>
    </div>
  );
}

export function GrowthTab({
  d,
  patch,
  user,
}: {
  d: Detail;
  patch: (b: Record<string, unknown>) => Promise<void>;
  user: string;
  reload: () => void;
}) {
  const b = d.baby;
  const entries = useMemo(
    () => [...(b.clinical?.growth ?? [])].sort((x, y) => +new Date(x.at) - +new Date(y.at)),
    [b.clinical?.growth],
  );
  const [bw, setBw] = useState(b.birthWeight);
  const [cw, setCw] = useState(b.currentWeight);
  const [w, setW] = useState<number | undefined>(undefined);
  const [wHc, setWHc] = useState<number | undefined>(undefined);
  const [wLen, setWLen] = useState<number | undefined>(undefined);
  useAutoSave(() => patch({ birthWeight: bw, currentWeight: cw }), `${bw}:${cw}`);
  return (
    <Section
      title="Birth weight & current weight"
      right={
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span>
          <button
            className="btn-primary"
          onClick={() =>
            patch({
              birthWeight: bw,
              currentWeight: cw,
              logEvent: { kind: "growth", text: `Weights updated — birth ${bw} g, current ${cw} g`, author: user },
            })
          }
        >
          Save weights
        </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <WeightInput label="Birth weight" valueGrams={bw} onChangeGrams={setBw} neonatal={d.baby.unit === "nicu"} />
        <WeightInput label="Current weight" valueGrams={cw} onChangeGrams={setCw} neonatal={d.baby.unit === "nicu"} />
        <WeightInput label="Add serial weight" valueGrams={w} onChangeGrams={setW} neonatal={d.baby.unit === "nicu"} />
        <NumField label="HC (cm)" value={wHc} onChange={setWHc} min={20} max={60} step={0.5} decimals={1} />
        <NumField label="Length / height (cm)" value={wLen} onChange={setWLen} min={20} max={200} step={0.5} decimals={1} />
        <button
          className="btn-ghost self-end"
          disabled={!w}
          onClick={() => {
            if (!w) return;
            patch({
              currentWeight: w,
              clinical: { growth: [...entries, { at: new Date().toISOString(), weight: w, hc: wHc, length: wLen }] },
              logEvent: {
                kind: "growth",
                text: `Serial weight ${w} ${d.baby.unit === "nicu" ? "g" : "kg"}${wHc ? `, HC ${wHc} cm` : ""}${wLen ? `, length ${wLen} cm` : ""}`,
                author: user,
              },
            });
            setW(undefined);
            setWHc(undefined);
            setWLen(undefined);
          }}
        >
          Add weigh
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Change from birth: {pctOfBirth(bw, cw) ?? 0}% · {entries.length} serial entries. Use Daily progress for the full calculator.
      </p>
      <div className="mt-2">
        <GrowthFlagsRow
          velocity={
            entries.length >= 2
              ? (() => {
                  const a = entries[entries.length - 2];
                  const z = entries[entries.length - 1];
                  const days = Math.max(0.5, (+new Date(z.at) - +new Date(a.at)) / 86400000);
                  return gainGPerKgDay(a.weight, z.weight, days);
                })()
              : null
          }
          lossPct={(() => {
            const nadir = Math.min(bw, cw, ...entries.map((e) => e.weight));
            return bw > 0 ? Math.max(0, Math.round(((bw - nadir) / bw) * 1000) / 10) : 0;
          })()}
          regained={cw >= bw}
        />
      </div>
    </Section>
  );
}

export function ProblemsTab({ d, id, reload, user }: { d: Detail; id: string; reload: () => void; user: string }) {
  const [sys, setSys] = useState<SystemKey>("Respiratory");
  const [q, setQ] = useState("");
  const [customName, setCustomName] = useState("");
  const active = d.problems.filter((p) => p.status !== "resolved");
  const existingFor = (label: string) => d.problems.find((p) => p.label.toLowerCase() === label.toLowerCase());
  const include = async (system: string, label: string) => {
    const existing = existingFor(label);
    if (existing?.status === "resolved") {
      await api(`/api/babies/${id}/problems`, "PATCH", { id: existing.id, status: "active", author: user });
    } else if (!existing) {
      await api(`/api/babies/${id}/problems`, "POST", { system, label, author: user });
    }
    reload();
  };
  const setStatus = async (p: Detail["problems"][number], status: "active" | "watch" | "resolved") => {
    await api(`/api/babies/${id}/problems`, "PATCH", { id: p.id, status, author: user });
    reload();
  };
  const remove = async (p: Detail["problems"][number]) => {
    if (!window.confirm(`Remove “${p.label}” from this baby’s problem record?`)) return;
    await api(`/api/babies/${id}/problems?rowId=${p.id}`, "DELETE");
    reload();
  };
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const out: { system: string; label: string }[] = [];
    for (const s of SYSTEMS)
      for (const l of PROBLEM_CATALOG[s]) if (l.toLowerCase().includes(q.toLowerCase())) out.push({ system: s, label: l });
    return out.slice(0, 40);
  }, [q]);
  const options = results ?? PROBLEM_CATALOG[sys].map((label) => ({ system: sys, label }));
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Section title="Include a diagnosis / problem" right={<input className="inp w-56 text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          {!results && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SYSTEMS.map((s) => (
                <Chip key={s} label={s} on={sys === s} onClick={() => setSys(s)} />
              ))}
            </div>
          )}
          <div className="grid max-h-[360px] gap-1.5 overflow-auto sm:grid-cols-2">
            {options.map((option) => {
              const existing = existingFor(option.label);
              const isIncluded = existing?.status === "active" || existing?.status === "watch";
              return (
                <div key={option.label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/40 p-2">
                  <span className="min-w-0 flex-1 text-xs text-slate-200">{option.label}</span>
                  {isIncluded ? (
                    <span className="text-[10px] font-bold text-emerald-300">✓ Included</span>
                  ) : (
                    <button className="btn-primary !px-2 !py-1 text-[10px]" onClick={() => include(option.system, option.label)}>
                      {existing?.status === "resolved" ? "Re-open" : "+ Include"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="Add a custom diagnosis">
          <div className="flex gap-2">
            <input className="inp" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Type new diagnosis" />
            <button
              className="btn-primary"
              disabled={!customName.trim()}
              onClick={async () => {
                await include(sys, customName.trim());
                setCustomName("");
              }}
            >
              + Include
            </button>
          </div>
        </Section>
      </div>
      <Section title="Baby’s problem record" sub={`${active.length} active`}>
        <div className="space-y-2">
          {d.problems.map((p) => (
            <div key={p.id} className={`rounded-xl border p-2 ${p.status === "resolved" ? "border-emerald-400/30 bg-emerald-400/10" : p.status === "watch" ? "border-amber-400/30 bg-amber-400/10" : "border-rose-400/30 bg-rose-400/10"}`}>
              <div className="text-xs font-bold text-white">{p.label}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.status !== "resolved" && (
                  <button className="btn-ghost !px-2 !py-1 text-[10px]" onClick={() => setStatus(p, "resolved")}>
                    ✓ Mark resolved
                  </button>
                )}
                {p.status === "resolved" && (
                  <button className="btn-ghost !px-2 !py-1 text-[10px]" onClick={() => setStatus(p, "active")}>
                    Re-open
                  </button>
                )}
                <button className="btn-ghost !px-2 !py-1 text-[10px] text-rose-300" onClick={() => remove(p)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function DrugsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const c = d.baby.clinical ?? {};
  const [drugs, setDrugs] = useState(c.drugs ?? []);
  const [lines, setLines] = useState(c.lines ?? []);
  const [group, setGroup] = useState(Object.keys(DRUGS)[0]);
  const likelyCourseDays = (name: string) => /cillin|cef|myc|penem|zolid|istin|azole|comycin|Amikacin|Gentamicin/i.test(name) ? 7 : undefined;
  const newDrug = (name: string): ClinicalDrug => ({ name, day: 1, startedAt: new Date().toISOString(), ofDays: likelyCourseDays(name), source: "our unit" });
  const toggleDrug = (name: string) =>
    setDrugs((p) => (p.some((x) => x.name === name) ? p.filter((x) => x.name !== name) : [...p, newDrug(name)]));
  const updateDrug = (index: number, patch: Partial<ClinicalDrug>) => setDrugs((p) => p.map((drug, i) => i === index ? { ...drug, ...patch } : drug));
  const currentDrugDay = (drug: ClinicalDrug) => therapyDay(drug);
  const drugDraft = useMemo(() => ({ drugs, lines }), [drugs, lines]);
  useAutoSave(() => patch({ clinical: { drugs, lines } }), drugDraft);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section
        title="Medications"
        right={<div className="flex items-center gap-2"><span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span><button className="btn-primary" onClick={() => patch({ clinical: { drugs, lines } })}>Save</button></div>}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.keys(DRUGS).map((g) => (
            <Chip key={g} label={g} on={group === g} onClick={() => setGroup(g)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(DRUGS[group] ?? []).map((n) => (
            <Chip key={n} label={n} tone="amber" on={drugs.some((x) => x.name === n)} onClick={() => toggleDrug(n)} />
          ))}
        </div>
        <div className="mt-2">
          <EditableListField
            options={[]}
            value={drugs.map((x) => x.dose ? `${x.name} — ${x.dose}` : x.name)}
            onChange={(names: string[]) =>
              setDrugs(names.filter((n) => n.trim()).map((n) => {
                const existing = drugs.find((x) => x.name === n || `${x.name} — ${x.dose ?? ""}` === n);
                return existing ?? newDrug(n);
              }))
            }
            placeholder="Add custom medication or dose…"
            emptyLabel="No medications added yet."
          />
        </div>
        <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-2 text-[10px] leading-relaxed text-cyan-100">
          <b>Therapy day is medicine-specific.</b> For an existing or transferred case, set the first-dose date for each antibiotic below. A medicine started three days ago will show D4; a medicine started today will show D1.
        </div>
        <div className="lbl mt-4 mb-1">Running medications · current as of now</div>
        <div className="space-y-2">
          {drugs.map((x, i) => {
            const derived = Boolean(x.startedAt && x.dayOverride === undefined);
            return <div key={`${x.name}-${i}`} className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-slate-100">{x.name}{x.dose ? ` · ${x.dose}` : ""}</span>
                {x.ofDays !== undefined && <span className="shrink-0 text-amber-200">D{currentDrugDay(x)}/{x.ofDays}</span>}
                <button className="shrink-0 text-rose-300" onClick={() => setDrugs((p) => p.filter((_, j) => j !== i))}>✕</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="block"><span className="lbl mb-1 block !text-[9px]">First dose</span><input className="inp !min-h-0 !py-1 text-[11px]" type="datetime-local" value={localDateTimeValue(x.startedAt)} onChange={(event) => updateDrug(i, { startedAt: isoFromDateTimeInput(event.target.value), dayOverride: undefined })} /></label>
                <label className="block"><span className="lbl mb-1 block !text-[9px]">Planned days</span><input className="inp !min-h-0 !py-1 text-[11px]" type="number" min={1} max={365} value={x.ofDays ?? ""} placeholder="e.g. 7" onChange={(event) => updateDrug(i, { ofDays: event.target.value ? Number(event.target.value) : undefined })} /></label>
                <label className="block"><span className="lbl mb-1 block !text-[9px]">Manual day if date unknown</span><input className="inp !min-h-0 !py-1 text-[11px]" type="number" min={1} max={365} value={x.dayOverride ?? ""} placeholder={derived ? `Auto D${currentDrugDay(x)}` : "e.g. 4"} onChange={(event) => updateDrug(i, { dayOverride: event.target.value ? Number(event.target.value) : undefined })} /></label>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-slate-500"><span>{derived ? "Calculated from first dose" : x.dayOverride !== undefined ? "Manual therapy day" : "Enter first-dose date"}</span>{x.source && <span>· {x.source}</span>}</div>
            </div>;
          })}
        </div>
      </Section>
      <Section title="Lines, tubes & devices" right={<button className="btn-primary" onClick={() => patch({ clinical: { drugs, lines } })}>Save</button>}>
        <div className="flex flex-wrap gap-1.5">
          {LINES.map((n) => (
            <Chip key={n} label={n} tone="emerald" on={lines.some((x) => x.name === n)} onClick={() => setLines((p) => (p.some((x) => x.name === n) ? p.filter((x) => x.name !== n) : [...p, { name: n, day: 1 }]))} />
          ))}
        </div>
        <div className="mt-2">
          <EditableListField
            options={LINES}
            value={lines.map((x) => x.name)}
            onChange={(names: string[]) =>
              setLines(names.filter((n) => n.trim()).map((n) => {
                const existing = lines.find((x) => x.name === n);
                return existing ?? { name: n, day: 1 };
              }))
            }
            placeholder="Add custom line / device…"
            emptyLabel="No lines or devices added yet."
          />
        </div>
      </Section>
    </div>
  );
}

export function LabsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const [labs, setLabs] = useState<Record<string, string>>(d.baby.clinical?.labs ?? {});
  useAutoSave(() => patch({ clinical: { labs } }), labs);
  return (
    <Section title="Investigations" right={<div className="flex items-center gap-2"><span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span><button className="btn-primary" onClick={() => patch({ clinical: { labs } })}>Save labs</button></div>}>
      <div className="space-y-4">
        {LAB_PANELS.map((p) => (
          <div key={p.key}>
            <div className="lbl mb-1">{p.label}</div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
              {p.fields.map((f) => (
                <label key={f} className="rounded-lg border border-white/10 bg-slate-900/50 px-2 py-1">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-400">{f}</span>
                  <input className="w-full bg-transparent text-sm text-white outline-none" value={labs[f] ?? ""} onChange={(e) => setLabs((s) => ({ ...s, [f]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <LabsInterpretation baby={d.baby} labs={labs} />
      </div>
    </Section>
  );
}

export function CareTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const c = d.baby.clinical ?? {};
  const [care, setCare] = useState<string[]>(c.care ?? []);
  const [disch, setDisch] = useState<string[]>(c.discharge ?? []);
  const [plan, setPlan] = useState(c.plan ?? "");
  const [family, setFamily] = useState(c.familyNote ?? "");
  const careDraft = useMemo(() => ({ care, disch, plan, family }), [care, disch, plan, family]);
  useAutoSave(() => patch({ clinical: { care, discharge: disch, plan, familyNote: family } }), careDraft);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section title="Nursing & developmental care bundle" right={<div className="flex items-center gap-2"><span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span><button className="btn-primary" onClick={() => patch({ clinical: { care, discharge: disch, plan, familyNote: family } })}>Save</button></div>}>
        <EditableListField options={CARE_BUNDLE} value={care} onChange={(v: string[]) => setCare(v)} placeholder="Add other care item…" />
        <div className="lbl mt-4 mb-1">Plan for next 12 hours</div>
        <textarea className="inp h-24" value={plan} onChange={(e) => setPlan(e.target.value)} />
        <div className="lbl mt-3 mb-1">Family / counselling note</div>
        <textarea className="inp h-20" value={family} onChange={(e) => setFamily(e.target.value)} />
      </Section>
      <Section title="Discharge readiness" sub={`${disch.length}/${DISCHARGE_CRITERIA.length} criteria met`}>
        <EditableListField options={DISCHARGE_CRITERIA} value={disch} onChange={(v: string[]) => setDisch(v)} placeholder="Add other criterion…" />
      </Section>
    </div>
  );
}

export function CourseTab({
  d,
  user,
  patch,
}: {
  d: Detail;
  id: string;
  reload: () => void;
  user: string;
  patch: (b: Record<string, unknown>) => Promise<void>;
}) {
  const b = d.baby;
  const c = b.clinical ?? {};
  const [discharging, setDischarging] = useState(false);
  const dischargeEvent = d.events.find((e) => e.kind === "discharge");
  const isDischarged = b.status === "discharged";
  const dischargeDate = dischargeEvent ? dischargeEvent.at : new Date().toISOString();
  const losDays = Math.max(1, Math.round((+new Date(dischargeDate) - +new Date(b.dob)) / 86400000));
  const growth = [...(c.growth ?? [])].sort((a, z) => +new Date(a.at) - +new Date(z.at));
  const lastWeight = growth.at(-1)?.weight ?? b.currentWeight;
  const lastVital = d.vitals[0] ?? {};
  const n = calcNutrition(c);
  const course = [
    ...d.problems.map((p) => ({ at: p.onsetAt, text: `${p.label} — ${p.status}`, author: "Clinical record" })),
    ...d.events.map((e) => ({ at: e.at, text: e.text, author: e.author })),
  ].sort((a, z) => +new Date(a.at) - +new Date(z.at));

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap gap-2">
        {!isDischarged ? (
          <button
            className="btn-primary"
            disabled={discharging}
            onClick={async () => {
              setDischarging(true);
              await patch({
                status: "discharged",
                acuity: "ready",
                logEvent: { kind: "discharge", text: `Discharged from NICU — summary by ${user}`, author: user },
              });
              setDischarging(false);
            }}
          >
            🏥 Discharge baby — finalise summary
          </button>
        ) : (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
            ✓ Discharged
          </span>
        )}
        <button className="btn-ghost" onClick={() => window.print()}>🖨️ Print / save as PDF</button>
      </div>
      <div className="print-black rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="border-b-2 border-slate-300 pb-3 text-center">
          <h2 className="text-lg font-black text-slate-900">Sri Ramakrishna Hospital</h2>
          <p className="text-[11px] font-semibold text-slate-600">Department of Pediatrics</p>
          <p className="text-[10px] font-semibold text-slate-600">Realtime Monitoring and Clinical Handover Suite</p>
          <p className="text-[11px] font-semibold text-slate-600">Neonatal Discharge Summary · {losDays} days in unit</p>
        </div>
        <p className="mt-3 text-xs text-slate-700">
          {b.babyName} ({b.uhid}), {b.sex}, {b.gestWeeks}+{b.gestDays} wk, BW {b.birthWeight} g → {lastWeight} g.
          Consultant {b.consultant || "—"}. Energy {n.totalKcal} kcal/kg/day · protein {n.totalProtein} g/kg/day.
          Last vitals: BP {fmtBP(lastVital.sbp as number | null, lastVital.dbp as number | null, lastVital.map as number | null)} · temp {tempOut(lastVital.temp as number | null, "F") ?? "—"} °F.
          {c.triage && (
            <> Admission triage: {c.triage.label} ({c.triage.scale} {c.triage.score}, {c.triage.band}).</>
          )}
        </p>
        <h3 className="lbl mt-4 mb-1">Diagnoses</h3>
        <ul className="text-xs text-slate-700">
          {d.problems.map((p) => (
            <li key={p.id}>• {p.label} — {p.status}</li>
          ))}
        </ul>
        <h3 className="lbl mt-4 mb-1">Hospital course (day/night)</h3>
        <ol className="max-h-64 space-y-1 overflow-auto text-xs text-slate-700">
          {course.map((e, i) => (
            <li key={i}>
              Day {Math.max(0, Math.floor((+new Date(e.at) - +new Date(b.dob)) / 86400000))} · {fmtTime(e.at)} · {shiftTag(e.at)} · {e.text} — {e.author}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-center text-[9px] text-slate-400">Electronically generated · Dr. Suseender Durairaj</p>
      </div>
    </div>
  );
}

type ComposedAction = {
  text: string;
  when: string; // YYYY-MM-DD — manual only
  time: string; // HH:MM — manual only
  priority: string;
  owner: string;
  note: string;
};

const toComposed = (t: {
  text: string;
  scheduledAt?: string | null;
  priority?: string;
  owner?: string;
  note?: string;
}): ComposedAction => ({
  text: t.text,
  when: t.scheduledAt ? t.scheduledAt.slice(0, 10) : "",
  time: t.scheduledAt ? t.scheduledAt.slice(11, 16) : "",
  priority: t.priority ?? "today",
  owner: t.owner ?? "",
  note: t.note ?? "",
});

const blankAction = (text: string, owner = ""): ComposedAction => ({
  text,
  when: "",
  time: "",
  priority: "today",
  owner,
  note: "",
});

export function HandoverTab({ d, id, reload, user }: { d: Detail; id: string; reload: () => void; user: string }) {
  const b = d.baby;
  const c = useMemo(() => b.clinical ?? {}, [b.clinical]);
  const v = useMemo(() => d.vitals[0] ?? {}, [d.vitals]);
  const autoSummary = useMemo(
    () =>
      [
        `Primary consultant: ${b.consultant || "not assigned"}.`,
        `${b.gestWeeks}+${b.gestDays} wk ${b.sex}, BW ${b.birthWeight} g, DOL, wt ${b.currentWeight} g.`,
        `Support: ${c.resp?.mode ?? "room air"} FiO₂ ${c.resp?.settings?.fio2 ?? 21}%.`,
        `Last vitals: HR ${v.hr ?? "—"}, BP ${fmtBP(v.sbp as number | null, v.dbp as number | null, v.map as number | null)}, T ${tempOut(v.temp as number | null, "F") ?? "—"} °F.`,
        `Provisional: ${
          interpretVitals(b, v as unknown as VitalsInput)
            .map((fl) => fl.label)
            .join("; ") || "within expected range"
        }.`,
      ].join(" "),
    [b, c, v],
  );
  const [shift, setShift] = useState(SHIFTS[0]);
  const [toStaff, setToStaff] = useState("");
  const [illness, setIllness] = useState(b.acuity);
  const [summary, setSummary] = useState(autoSummary);
  const [actions, setActions] = useState<ComposedAction[]>(() => {
    const seen = new Set<string>();
    const out: ComposedAction[] = [];
    for (const t of d.tasks.filter((t) => !t.done)) {
      const text = t.text.trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out.push(toComposed(t));
    }
    return out;
  });
  const [actionDraft, setActionDraft] = useState("");
  const [synthesis, setSynthesis] = useState("Read-back completed at bedside with nurse in charge.");
  const [saving, setSaving] = useState(false);
  // Keep generated text current when source data changes while allowing manual edits.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSummary(autoSummary), [autoSummary]);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Section
          title="I-PASS handover composer"
          right={
            <button
              className="btn-primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await api(`/api/babies/${id}/handovers`, "POST", {
                  shift,
                  fromStaff: user || "Staff",
                  toStaff,
                  illness,
                  summary,
                  actions: actions.map((a) => a.text.trim()).filter(Boolean),
                  contingency: [],
                  synthesis,
                  snapshot: { clinical: c, vitals: v, problems: d.problems },
                });
                setSaving(false);
                reload();
              }}
            >
              Sign & send handover
            </button>
          }
        >
          <div className="lbl mb-1">Shift</div>
          <ChipGroup options={SHIFTS} value={shift} onChange={(v2: string) => setShift(v2 || SHIFTS[0])} />
          <div className="lbl mt-3 mb-1">Illness severity</div>
          <ChipGroup options={ILLNESS} value={illness} onChange={(v2: string) => setIllness(v2 || "stable")} tone="rose" />
          <div className="lbl mt-3 mb-1">To</div>
          <input className="inp" value={toStaff} onChange={(e) => setToStaff(e.target.value)} placeholder="Receiving doctor / nurse" />
          <div className="lbl mt-3 mb-1">Patient summary</div>
          <textarea className="inp h-28" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <div className="lbl mt-3 mb-1">Synthesis</div>
          <input className="inp" value={synthesis} onChange={(e) => setSynthesis(e.target.value)} />
        </Section>
        <Section
          title="Handover action list"
          sub="Tap a preset to add it as editable text — alter freely before signing."
        >
          <div className="lbl mb-1">Quick add (tapped text can be edited below)</div>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_PRESETS.filter((preset) => !actions.some((a) => a.text === preset)).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setActions((prev) => [...prev, blankAction(preset, toStaff)])}
                className="chip chip-off"
              >
                + {preset}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="inp"
              value={actionDraft}
              placeholder="Type a custom action…"
              onChange={(e) => setActionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const next = actionDraft.trim();
                  if (next) setActions((prev) => [...prev, blankAction(next, toStaff)]);
                  setActionDraft("");
                }
              }}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!actionDraft.trim()}
              onClick={() => {
                const next = actionDraft.trim();
                if (next) setActions((prev) => [...prev, blankAction(next, toStaff)]);
                setActionDraft("");
              }}
            >
              + Add
            </button>
          </div>
          {actions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {actions.map((action, index) => (
                <div
                  key={`action-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/30 px-2 py-1.5"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[10px] font-black text-emerald-300">
                    {index + 1}
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                    value={action.text}
                    placeholder="Edit action text…"
                    onChange={(e) =>
                      setActions((prev) =>
                        prev.map((a, i) => (i === index ? { ...a, text: e.target.value } : a)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="shrink-0 text-rose-300 hover:text-rose-200"
                    title="Remove"
                    onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      <Section title="Handover history" sub="Patient summary + action list">
        {d.handovers.map((h) => (
          <div key={h.id} className="mb-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs">
            <div className="text-[10px] text-slate-400">{h.shift} · {h.fromStaff} → {h.toStaff || "—"} · {fmtTime(h.createdAt)}</div>
            <div className="lbl mt-2">Patient summary</div>
            <p className="text-slate-200">{h.summary}</p>
            <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-2">
              <div className="lbl mb-1 text-emerald-300">Action list ({h.actions?.length ?? 0})</div>
              {h.actions?.length ? (
                <ol className="space-y-1.5 text-[11px] text-slate-100">
                  {h.actions.map((raw, index) => {
                    const a = typeof raw === "string" ? { text: raw } : (raw as Record<string, unknown>);
                    const text = String(a.text ?? "").trim();
                    if (!text) return null;
                    const sched = a.scheduledAt ? String(a.scheduledAt) : null;
                    const priority = String(a.priority ?? "today");
                    const owner = String(a.owner ?? "");
                    const note = String(a.note ?? "");
                    const task = d.tasks.find((t) => t.text.trim().toLowerCase() === text.toLowerCase());
                    const done = !!task?.done;
                    return (
                      <li key={`${text}-${index}`} className="rounded-lg border border-white/10 bg-slate-900/30 p-1.5">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            title={done ? "Re-open action" : "Mark as completed"}
                            onClick={async () => {
                              if (!task) return;
                              await api(`/api/babies/${id}/tasks`, "PATCH", {
                                id: task.id,
                                done: !done,
                                doneBy: user || "Team",
                              });
                              reload();
                            }}
                            className={`mt-0.5 shrink-0 ${done ? "text-emerald-300" : "text-slate-500 hover:text-emerald-300"}`}
                          >
                            {done ? <CheckCircle2 size={13} strokeWidth={2.4} /> : <Circle size={13} />}
                          </button>
                          <span className={`flex-1 ${done ? "text-slate-400 line-through" : ""}`}>{text}</span>
                          {done && task?.doneAt && (
                            <span className="shrink-0 text-[10px] text-emerald-300/90">
                              ✓ {fmtTime(task.doneAt)}
                              {task.doneBy ? ` · ${task.doneBy}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-[10px]">
                          <span
                            className={`rounded border px-1.5 py-0.5 font-bold ${
                              priority === "now"
                                ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                                : priority === "routine"
                                  ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                                  : "border-amber-400/40 bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {priority.toUpperCase()}
                          </span>
                          {sched && (
                            <span className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-bold text-cyan-200">
                              <Clock size={10} /> due {fmtTime(sched)}
                            </span>
                          )}
                          {owner && (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <User size={10} /> {owner}
                            </span>
                          )}
                          {note && <span className="italic text-slate-400">“{note}”</span>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-[11px] text-slate-500">No handover action recorded.</p>
              )}
            </div>
            {h.synthesis && (
              <p className="mt-2 text-[10px] text-slate-400">Read-back: {h.synthesis}</p>
            )}
          </div>
        ))}
        {d.handovers.length === 0 && <p className="text-xs text-slate-400">No handover recorded yet.</p>}
      </Section>
    </div>
  );
}

const QUICK_EVENTS = [
  "Desaturation episode – recovered with stimulation",
  "Apnoea – bag & mask given",
  "Bradycardia < 100 – self-resolved",
  "Seizure episode witnessed",
  "Consultant informed",
  "Parents updated",
  "KMC done 1 hour",
  "Weight recorded",
];

export function TimelineTab({ d, id, reload, user }: { d: Detail; id: string; reload: () => void; user: string }) {
  const [note, setNote] = useState("");
  const push = async (text: string, kind = "note") => {
    if (!text.trim()) return;
    await api(`/api/babies/${id}/events`, "POST", { text, kind, author: user || "Team" });
    setNote("");
    reload();
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section title="Log an event">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_EVENTS.map((e) => (
            <Chip key={e} label={e} onClick={() => push(e, "event")} />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="inp" placeholder="Free-text note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" onClick={() => push(note)}>Add</button>
        </div>
      </Section>
      <Section title="Chronological record">
        <ol className="relative space-y-3 border-l border-white/10 pl-4">
          {d.events.map((e) => {
            const dol = Math.max(0, Math.floor((+new Date(e.at) - +new Date(d.baby.dob)) / 86400000));
            return (
              <li key={e.id} className="text-xs">
                <span className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-cyan-400" />
                <div className="text-[10px] text-slate-500">
                  Day {dol} · {fmtTime(e.at)} · {shiftTag(e.at)} shift · {e.author}
                </div>
                <div className="text-slate-200">{e.text}</div>
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
