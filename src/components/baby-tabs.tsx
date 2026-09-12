"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Circle, Clock, Info, User, X } from "lucide-react";
import { WeightInput } from "@/components/weight-input";
import { Chip, ChipGroup, DialWithOther, NumField, Section, Stepper, api, useTempUnit } from "@/components/ui";
import { GrowthFlagsRow, LabsInterpretation, RespInterpretation, VitalsInterpretation } from "@/components/interpret-ui";
import { interpretVitals, neonatalDayFluidRange, type Flag, type VitalsInput } from "@/lib/interpret";
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
type ClinicalDrug = NonNullable<Clinical["drugs"]>[number];

function localDateIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function showFluid(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  // Do not round clinically meaningful decimal fluid values for display.
  return String(value);
}

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type MetricStatus = "safe" | "warn" | "crit" | "neutral";
type TrendKey = "fluids" | "kcal" | "gir";
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
}) {
  const ring = METRIC_RING[status];
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 shadow-lg shadow-black/10">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
        <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${ring}`} aria-label={`${status} status`} />
      </div>
      <div className="flex items-end justify-between gap-1">
        <div className="min-w-0">
          <FormulaValue onOpen={() => onFormula(label, formula)} className="block text-2xl font-black tabular-nums leading-none text-white sm:text-3xl">
            {value > 0 ? showFluid(value) : "—"}
          </FormulaValue>
          <span className="mt-1 block text-[10px] text-slate-500">{unit}</span>
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
              label="Temp °F"
              value={tempOut(v.temp, unit) ?? 0}
              onChange={(n) => set("temp")(tempIn(n, unit))}
              min={89.6}
              max={104}
              step={0.2}
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

export function FluidsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const f = d.baby.clinical?.fluids ?? {};
  const [s, setS] = useState<FluidValues>({ ...f });
  const [configOpen, setConfigOpen] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendKey | null>(null);
  const [formula, setFormula] = useState<{ title: string; text: string } | null>(null);
  const weightKg = Math.max(0, d.baby.currentWeight / 1000);
  const dailyMode = s.plan?.mode === "daily";
  const snapshot = calculateFluidPlan(s, weightKg);
  const nutritionFluids: FluidValues = {
    ...s,
    enteralMlKgDay: snapshot.enteralMlKgDay,
    ivMlKgDay: snapshot.ivMlKgDay,
    totalMlKgDay: snapshot.totalMlKgDay,
  };
  const nutrition = calcNutrition({ fluids: nutritionFluids });
  const totalFluid = snapshot.totalMlKgDay ?? s.totalMlKgDay ?? 0;
  const fluidRange = neonatalDayFluidRange(d.baby);
  const fluidStatus = rangeStatus(totalFluid, fluidRange[0], fluidRange[1]);
  const kcalStatus = rangeStatus(nutrition.totalKcal, nutrition.kcalTarget[0], nutrition.kcalTarget[1]);
  const girStatus = rangeStatus(nutrition.gir, 4, 12);
  const growthEntries = d.baby.clinical?.growth ?? [];
  const trends: Record<TrendKey, { label: string; unit: string; points: TrendPoint[] }> = {
    fluids: { label: "Total fluids", unit: "ml/kg/day", points: trendFor(growthEntries, "fluids", totalFluid) },
    kcal: { label: "Energy", unit: "kcal/kg/day", points: trendFor(growthEntries, "kcal", nutrition.totalKcal) },
    // GIR is not part of the existing growth snapshot data model. Show today's
    // value honestly until a prior GIR snapshot exists rather than inventing data.
    gir: { label: "GIR", unit: "mg/kg/min", points: [{ label: "Today", value: nutrition.gir }] },
  };
  const warnings: string[] = [];
  if (totalFluid <= 0) warnings.push("Total fluids has no entered target yet.");
  else if (fluidStatus !== "safe") warnings.push(`Total fluids ${showFluid(totalFluid)} ml/kg/day is ${totalFluid < fluidRange[0] ? "below" : "above"} the ${fluidRange[0]}–${fluidRange[1]} target.`);
  if (nutrition.totalKcal <= 0) warnings.push("Energy is not yet calculated from feed and TPN inputs.");
  else if (kcalStatus !== "safe") warnings.push(`Energy ${showFluid(nutrition.totalKcal)} kcal/kg/day is ${nutrition.totalKcal < nutrition.kcalTarget[0] ? "below" : "above"} the ${nutrition.kcalTarget[0]}–${nutrition.kcalTarget[1]} target.`);
  if (nutrition.gir <= 0) warnings.push("GIR has no entered target yet.");
  else if (girStatus !== "safe") warnings.push(`GIR ${showFluid(nutrition.gir)} mg/kg/min is outside the 4–12 target range.`);
  if (nutrition.totalProtein > 0 && nutrition.totalProtein < nutrition.proteinTarget[0]) warnings.push(`Protein ${showFluid(nutrition.totalProtein)} g/kg/day is below the ${nutrition.proteinTarget[0]}–${nutrition.proteinTarget[1]} target.`);
  const statusIsCritical = [fluidStatus, kcalStatus, girStatus].includes("crit");
  const set = (k: string) => (n: number) => setS((p) => ({ ...p, [k]: n }));
  const setPlanNumber = (section: "enteral" | "iv", key: keyof DailyFluidPlan) => (n: number) =>
    setS((p) => ({
      ...p,
      plan: {
        ...(p.plan ?? { mode: "daily", day: 1 }),
        mode: "daily",
        [section]: { ...(p.plan?.[section] ?? {}), [key]: n },
      },
    }));
  const enableDaily = () => {
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
    if (mode === "daily") enableDaily();
    else setS((p) => ({ ...p, plan: { ...p.plan, mode: "fixed" } }));
  };
  const advanceDay = () => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: (p.plan?.day ?? 1) + 1, holdToday: false } }));
  const holdToday = () => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", holdToday: !p.plan?.holdToday } }));
  const resetDay = () => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: 1, holdToday: false } }));
  const save = useCallback(() => {
    const resolved = calculateFluidPlan(s, weightKg);
    const fluids: FluidValues = dailyMode
      ? { ...s, enteralMlKgDay: resolved.enteralMlKgDay, ivMlKgDay: resolved.ivMlKgDay, totalMlKgDay: resolved.totalMlKgDay }
      : s;
    void patch({ clinical: { fluids } });
  }, [dailyMode, patch, s, weightKg]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const firstFluidRender = useRef(true);
  useEffect(() => {
    if (firstFluidRender.current) {
      firstFluidRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => saveRef.current(), 1000);
    return () => window.clearTimeout(timer);
  }, [s]);
  const day = s.plan?.day ?? 1;
  const todayLabel = s.plan?.holdToday ? "Held at previous target" : `Day ${day} target`;
  const totalFluidFormula = dailyMode
    ? `Total fluids = enteral target + IV target = ${showFluid(snapshot.enteralMlKgDay)} + ${showFluid(snapshot.ivMlKgDay)} = ${showFluid(totalFluid)} ml/kg/day.`
    : `Total fluids = the entered totalMlKgDay value (${showFluid(s.totalMlKgDay)} ml/kg/day).`;
  const kcalFormula = `Energy = enteral volume × ${nutrition.density} kcal/ml + GIR contribution + amino-acid contribution + lipid contribution = ${showFluid(nutrition.totalKcal)} kcal/kg/day.`;
  const girFormula = `GIR is the entered prescription value (${showFluid(nutrition.gir)} mg/kg/min); the existing record stores GIR directly and does not infer it from a new dextrose-rate field.`;
  const selectedTrend = trendMetric ? trends[trendMetric] : null;
  return (
    <div className="grid gap-3">
      <Section
        title="Fluids, TPN & nutrition"
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on</span>
            <button className="btn-primary" onClick={save}>Save 24-hour plan</button>
          </div>
        }
      >
        <div className="sticky top-2 z-20 -mx-1 rounded-2xl bg-slate-950/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
          <div className="mb-2 flex w-full rounded-xl border border-cyan-400/30 bg-slate-900 p-1" role="tablist" aria-label="Fluid prescription mode">
            <button type="button" role="tab" aria-selected={!dailyMode} onClick={() => setMode("fixed")} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black transition ${!dailyMode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>Fixed target</button>
            <button type="button" role="tab" aria-selected={dailyMode} onClick={() => setMode("daily")} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black transition ${dailyMode ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>Advance daily</button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <MetricCard label="Total fluids" value={totalFluid} unit="ml/kg/day" status={fluidStatus} trend={trends.fluids.points} trendKey="fluids" onTrend={setTrendMetric} formula={totalFluidFormula} onFormula={(title, text) => setFormula({ title, text })} />
            <MetricCard label="Energy" value={nutrition.totalKcal} unit="kcal/kg/day" status={kcalStatus} trend={trends.kcal.points} trendKey="kcal" onTrend={setTrendMetric} formula={kcalFormula} onFormula={(title, text) => setFormula({ title, text })} />
            <div className="col-span-2 md:col-span-1">
              <MetricCard label="GIR" value={nutrition.gir} unit="mg/kg/min" status={girStatus} trend={trends.gir.points} trendKey="gir" onTrend={setTrendMetric} formula={girFormula} onFormula={(title, text) => setFormula({ title, text })} />
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

        {selectedTrend && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><div><b className="text-xs text-slate-100">{selectedTrend.label} trend</b><span className="ml-2 text-[10px] text-slate-500">last {selectedTrend.points.length} recorded points · {selectedTrend.unit}</span></div><button type="button" className="text-[10px] text-slate-400 hover:text-white" onClick={() => setTrendMetric(null)}>Close</button></div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-7">
              {selectedTrend.points.map((point, index) => <div key={`${point.label}-${index}`} className="rounded-lg bg-slate-900/60 p-1.5 text-center"><span className="block truncate text-[9px] text-slate-500">{point.label}</span><b className="block text-[11px] tabular-nums text-slate-100">{showFluid(point.value)}</b></div>)}
            </div>
            {selectedTrend.points.length === 1 && <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><Info size={11} /> No prior snapshot is stored for this metric yet.</p>}
          </div>
        )}

        {dailyMode && (
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-2">
            <div className="mb-1 flex items-center justify-between gap-2"><b className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Plan metadata</b><span className="text-[9px] text-slate-500">compact context</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumField label="Plan day" value={day} onChange={(n) => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", day: Math.max(1, Math.round(n)) } }))} min={1} max={365} step={1} placeholder="1" />
              <label className="block rounded-lg border border-white/10 bg-slate-900/40 p-2"><span className="lbl mb-1 block">Plan starts</span><input className="inp !min-h-10 !py-1 text-sm" type="date" value={s.plan?.startDate ?? localDateIso()} onChange={(event) => setS((p) => ({ ...p, plan: { ...(p.plan ?? {}), mode: "daily", startDate: event.target.value } }))} /></label>
              <div className="rounded-lg border border-white/10 bg-slate-900/40 p-2 text-center"><span className="lbl block">Dosing weight</span><b className="mt-1 block text-sm text-slate-100">{weightKg ? `${showFluid(weightKg)} kg` : "Missing"}</b><small className="text-[9px] text-slate-500">from baby card</small></div>
            </div>
          </div>
        )}

        {dailyMode ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-2">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">Enteral feeds</b><span className="text-[9px] text-slate-500">ml/kg/day</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField label="Start" value={s.plan?.enteral?.startMlKgDay} onChange={setPlanNumber("enteral", "startMlKgDay")} min={0} max={300} step={1} placeholder="20" />
                <NumField label="Change /24h" value={s.plan?.enteral?.changePer24h} onChange={setPlanNumber("enteral", "changePer24h")} min={-300} max={300} step={1} placeholder="+20" />
                <NumField label="Maximum" value={s.plan?.enteral?.maximumMlKgDay} onChange={setPlanNumber("enteral", "maximumMlKgDay")} min={0} max={300} step={1} placeholder="160" />
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.04] p-2 text-[11px] text-slate-200"><b>{todayLabel}:</b> <FormulaValue onOpen={() => setFormula({ title: "Enteral target", text: `Enteral target = start ${showFluid(s.plan?.enteral?.startMlKgDay)} + change ${showFluid(s.plan?.enteral?.changePer24h)} × (day ${day} − 1), clamped by the plan limits.` })}>{showFluid(snapshot.enteralMlKgDay)}</FormulaValue> ml/kg/day · <FormulaValue onOpen={() => setFormula({ title: "Enteral volume", text: `Enteral ml/day = enteral ml/kg/day × dosing weight = ${showFluid(snapshot.enteralMlKgDay)} × ${showFluid(weightKg)}.` })}>{showFluid(snapshot.enteralMlDay)}</FormulaValue> ml/day</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/35 p-2">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">IV / TPN</b><span className="text-[9px] text-slate-500">ml/kg/day</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField label="Start" value={s.plan?.iv?.startMlKgDay} onChange={setPlanNumber("iv", "startMlKgDay")} min={0} max={300} step={1} placeholder="80" />
                <NumField label="Change /24h" value={s.plan?.iv?.changePer24h} onChange={setPlanNumber("iv", "changePer24h")} min={-300} max={300} step={1} placeholder="−10" />
                <NumField label="Minimum" value={s.plan?.iv?.minimumMlKgDay} onChange={setPlanNumber("iv", "minimumMlKgDay")} min={0} max={300} step={1} placeholder="40" />
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.04] p-2 text-[11px] text-slate-200"><b>{todayLabel}:</b> <FormulaValue onOpen={() => setFormula({ title: "IV target", text: `IV target = start ${showFluid(s.plan?.iv?.startMlKgDay)} + change ${showFluid(s.plan?.iv?.changePer24h)} × (day ${day} − 1), clamped by the plan limits.` })}>{showFluid(snapshot.ivMlKgDay)}</FormulaValue> ml/kg/day · <FormulaValue onOpen={() => setFormula({ title: "IV volume", text: `IV ml/day = IV ml/kg/day × dosing weight = ${showFluid(snapshot.ivMlKgDay)} × ${showFluid(weightKg)}.` })}>{showFluid(snapshot.ivMlDay)}</FormulaValue> ml/day</div>
            </div>
            <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/35 p-2 text-[11px] text-slate-200"><div className="mb-1 flex items-center justify-between"><b>Today&apos;s 24-hour plan</b><span className="text-[9px] text-slate-500">enteral + IV/TPN</span></div><div className="grid grid-cols-3 gap-2 text-center"><div><span className="block text-[9px] text-slate-500">Enteral</span><FormulaValue onOpen={() => setFormula({ title: "Enteral target", text: "Calculated from the advance-daily enteral start, change, day, and limits." })}>{showFluid(snapshot.enteralMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.enteralMlDay)} ml/day</small></div><div><span className="block text-[9px] text-slate-500">IV / TPN</span><FormulaValue onOpen={() => setFormula({ title: "IV target", text: "Calculated from the advance-daily IV start, change, day, and limits." })}>{showFluid(snapshot.ivMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.ivMlDay)} ml/day</small></div><div><span className="block text-[9px] text-slate-500">Total</span><FormulaValue onOpen={() => setFormula({ title: "Total fluids", text: totalFluidFormula })}>{showFluid(snapshot.totalMlKgDay)}</FormulaValue><small className="block text-[9px] text-slate-500">{showFluid(snapshot.totalMlDay)} ml/day</small></div></div><p className="mt-2 text-[10px] text-slate-500">{snapshot.feedMl !== undefined ? `${showFluid(snapshot.feedMl)} ml/feed at ${s.feedFreq}.` : snapshot.feedMlPerHour !== undefined ? `${showFluid(snapshot.feedMlPerHour)} ml/hour continuously.` : "Select a fixed hourly frequency to calculate volume per feed."}</p></div>
            <div className="md:col-span-2 flex flex-wrap gap-2"><button type="button" className="btn-secondary min-h-10" onClick={advanceDay}>Advance 24 h</button><button type="button" className={`btn-secondary min-h-10 ${s.plan?.holdToday ? "border-amber-300/50 text-amber-200" : ""}`} onClick={holdToday}>{s.plan?.holdToday ? "Release hold" : "Hold today"}</button><button type="button" className="btn-secondary min-h-10" onClick={resetDay}>Reset to day 1</button></div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <NumField label="Total fluids ml/kg/d" value={s.totalMlKgDay ?? undefined} onChange={set("totalMlKgDay")} min={0} max={300} step={1} placeholder="enter" />
            <NumField label="Enteral ml/kg/d" value={s.enteralMlKgDay ?? undefined} onChange={set("enteralMlKgDay")} min={0} max={300} step={1} placeholder="enter" />
            <NumField label="IV ml/kg/d" value={s.ivMlKgDay ?? undefined} onChange={set("ivMlKgDay")} min={0} max={300} step={1} placeholder="enter" />
            <NumField label="GIR mg/kg/min" value={s.gir ?? undefined} onChange={set("gir")} min={0} max={20} step={0.1} decimals={1} placeholder="enter" />
            <NumField label="Amino acid g/kg/d" value={s.aminoAcid ?? undefined} onChange={set("aminoAcid")} min={0} max={5} step={0.1} decimals={1} placeholder="enter" />
            <NumField label="Lipid g/kg/d" value={s.lipid ?? undefined} onChange={set("lipid")} min={0} max={5} step={0.1} decimals={1} placeholder="enter" />
            <NumField label="Energy kcal/kg/d" value={s.kcal ?? undefined} onChange={set("kcal")} min={0} max={200} step={1} placeholder="enter" />
            <NumField label="Feed volume / feed (ml)" value={s.feedVol ?? undefined} onChange={set("feedVol")} min={0} max={120} step={1} placeholder="enter" />
          </div>
        )}

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><b className="text-xs text-slate-100">Nutrition detail</b><span className="text-[9px] text-slate-500">calculated from current prescription</span></div>
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div><span className="block text-slate-500">Enteral energy</span><FormulaValue onOpen={() => setFormula({ title: "Enteral energy", text: `Enteral energy = ${showFluid(nutrition.enteralMl)} ml/kg/day × ${nutrition.density} kcal/ml.` })}>{showFluid(nutrition.enteralKcal)}</FormulaValue> kcal/kg/d</div>
            <div><span className="block text-slate-500">IV / TPN energy</span><FormulaValue onOpen={() => setFormula({ title: "IV / TPN energy", text: `IV energy combines dextrose (${showFluid(nutrition.dextroseKcal)}), amino acid (${showFluid(nutrition.aaKcal)}), and lipid (${showFluid(nutrition.lipidKcal)}) kcal/kg/day.` })}>{showFluid(nutrition.ivKcal)}</FormulaValue> kcal/kg/d</div>
            <div><span className="block text-slate-500">Protein</span><FormulaValue onOpen={() => setFormula({ title: "Protein", text: `Protein = enteral protein (${showFluid(nutrition.enteralProtein)}) + amino acid (${showFluid(nutrition.aaG)}) g/kg/day.` })}>{showFluid(nutrition.totalProtein)}</FormulaValue> g/kg/d</div>
            <div><span className="block text-slate-500">Dextrose</span><FormulaValue onOpen={() => setFormula({ title: "Dextrose", text: `Dextrose grams = GIR × 1.44 = ${showFluid(nutrition.gir)} × 1.44.` })}>{showFluid(nutrition.dextroseG)}</FormulaValue> g/kg/d</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35">
          <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={configOpen} onClick={() => setConfigOpen((open) => !open)}><span><span className="block text-xs font-black text-slate-100">Prescription details</span><span className="text-[10px] text-slate-500">Feed type · route · frequency</span></span><ChevronDown className={`h-4 w-4 text-cyan-300 transition-transform ${configOpen ? "rotate-180" : ""}`} /></button>
          {configOpen && <div className="space-y-2 border-t border-white/10 p-2"><div><div className="lbl mb-1">FEED TYPE</div><CompactPicker label="Feed type" options={FEED_TYPE} value={s.feedType} onChange={(value) => setS((p) => ({ ...p, feedType: value }))} otherPlaceholder="Other feed type…" /></div><div><div className="lbl mb-1">ROUTE</div><CompactPicker label="Route" options={FEED_ROUTE} value={s.feedRoute} onChange={(value) => setS((p) => ({ ...p, feedRoute: value }))} otherPlaceholder="Other route…" /></div><div><div className="lbl mb-1">FREQUENCY</div><CompactPicker label="Frequency" options={["1 hourly", "2 hourly", "3 hourly", "4 hourly", "continuous", "2–3 hourly on demand"]} value={s.feedFreq} onChange={(value) => setS((p) => ({ ...p, feedFreq: value }))} otherPlaceholder="Other frequency…" /></div></div>}
        </div>
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
