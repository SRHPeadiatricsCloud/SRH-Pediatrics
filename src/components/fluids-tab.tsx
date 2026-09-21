"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { Chip, DialWithOther, NumField, Section } from "@/components/ui";
import { girFromDextrose, type Flag } from "@/lib/interpret";
import {
  FEED_PHASES,
  PROTOCOL_FIELDS,
  TARGET_FIELDS,
  applyProtocol,
  bandIntervalHours,
  protocolInUse,
  suggestFluids,
  targetsFor,
  weightBand,
  type ProtocolOverrides,
} from "@/lib/feed-guide";
import type { Detail } from "@/lib/types";
import {
  calcNutrition,
  FORTIFIER_CATALOG,
  FORTIFIER_KCAL_PER_UNIT,
  FORTIFIER_PROTEIN_G_PER_UNIT,
  feedsPerDay,
  fortifierById,
  resolveFeedPlan,
} from "@/lib/clinical";
import { FEED_ROUTE, FEED_TYPE } from "@/lib/catalog";

/* ------------------------------------------------------------------ *
 * Small pieces shared by the tab.
 * ------------------------------------------------------------------ */

/** Signed difference against a target, coloured by whether it is short or over. */
function DeltaChip({ actual, target, decimals = 0 }: { actual: number; target: [number, number]; decimals?: number }) {
  const [lo, hi] = target;
  if (actual === 0) return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">nothing recorded</span>;
  if (actual < lo) {
    return (
      <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
        {Math.abs(actual - lo).toFixed(decimals)} short
      </span>
    );
  }
  if (actual > hi) {
    return (
      <span className="rounded bg-rose-400/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-200">
        {(actual - hi).toFixed(decimals)} over
      </span>
    );
  }
  return <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">in range</span>;
}

/**
 * One line of "actual against its target band". The shaded part of the track is
 * the target, the fill is where this baby is, so "are we there yet" is a glance
 * rather than a piece of mental arithmetic.
 */
function TargetRow({
  label,
  value,
  target,
  unit,
  decimals = 1,
  note,
}: {
  label: string;
  value: number;
  target: [number, number];
  unit: string;
  decimals?: number;
  note?: string;
}) {
  const [lo, hi] = target;
  const span = hi > 0 ? hi : 1;
  const pct = Math.max(0, Math.min(100, (value / span) * 100));
  const loPct = Math.max(0, Math.min(100, (lo / span) * 100));
  const inBand = value >= lo && value <= hi;
  const low = value < lo;
  const bar = value === 0 ? "bg-slate-600" : inBand ? "bg-emerald-400" : low ? "bg-amber-400" : "bg-rose-400";
  const text = value === 0 ? "text-slate-400" : inBand ? "text-emerald-200" : low ? "text-amber-200" : "text-rose-200";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-300">{label}</span>
        <span className={`text-sm font-black tabular-nums ${text}`}>
          {value.toFixed(decimals)} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 bg-emerald-400/25" style={{ left: `${loPct}%`, width: `${Math.max(0, 100 - loPct)}%` }} />
        <div className={`absolute inset-y-0 left-0 ${bar} opacity-80`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>target {lo}&ndash;{hi}</span>
        <span className="text-right">{note}</span>
      </div>
    </div>
  );
}

/** The feeding pathway this baby is on, one compact row. */
function PhaseRail({ step, activeId }: { step: number; activeId: string }) {
  return (
    <div className="flex items-center overflow-x-auto">
      {FEED_PHASES.map((ph, i) => {
        const active = ph.id === activeId;
        const done = i < step;
        return (
          <div key={ph.id} className="flex flex-1 items-center">
            <span
              className={`flex min-w-max items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-wide ${
                active ? "text-cyan-200" : done ? "text-emerald-200/70" : "text-slate-500"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] ${
                  active
                    ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50"
                    : done
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-white/10 bg-white/5"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {ph.label}
            </span>
            {i < FEED_PHASES.length - 1 && (
              <span className={`mx-1 h-px w-full min-w-2 ${done ? "bg-emerald-400/40" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * An editable prescription field with the guideline value beside it.
 *
 * The field is never locked: the number on the chart is the number that is
 * used. The guideline sits underneath as a nudge with a one-tap "use", so
 * adopting it is a choice rather than the default.
 */
function RxField({
  label,
  value,
  onValue,
  suggested,
  suggestedText,
  onUseSuggested,
  min,
  max,
  step,
  decimals = 0,
  placeholder,
  note,
}: {
  label: string;
  value: number | undefined;
  onValue: (v: number) => void;
  suggested?: number;
  suggestedText?: string;
  onUseSuggested?: () => void;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  placeholder?: string;
  note?: string;
}) {
  const matches = suggested !== undefined && value !== undefined && Math.abs(suggested - value) < 1e-9;
  return (
    <div>
      <NumField
        label={label}
        value={value}
        onChange={onValue}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        placeholder={placeholder}
      />
      <div className="mt-1 flex min-h-4 items-start justify-between gap-1 text-[10px] leading-tight">
        <span className="truncate text-slate-500">{note}</span>
        {suggested !== undefined && onUseSuggested && (
          matches ? (
            <span className="shrink-0 text-emerald-200/80">✓ guideline</span>
          ) : (
            <button type="button" className="shrink-0 font-bold text-cyan-200 underline" onClick={onUseSuggested}>
              guideline {suggestedText ?? suggested} &rarr; use
            </button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * One unit-protocol figure. A plain input rather than a stepper, because the
 * empty state is meaningful: blank means "use the published value", and the
 * placeholder shows what that value is.
 */
function ProtocolRow({
  label,
  unit,
  value,
  published,
  hint,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  published: number;
  hint: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number | undefined) => void;
}) {
  const overridden = value !== undefined;
  return (
    <label className={`block rounded-xl border p-2 ${overridden ? "border-cyan-400/30 bg-cyan-400/5" : "border-white/10 bg-slate-900/50"}`}>
      <span className="lbl mb-1 block truncate">
        {label} <span className="text-slate-500">{unit}</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        className="inp min-h-11"
        value={value ?? ""}
        placeholder={String(published)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
      />
      <span className="mt-1 block text-[10px] leading-tight text-slate-500">
        {overridden ? `yours — published ${published}` : `published ${published}`} · {hint}
      </span>
    </label>
  );
}

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(+date)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const FEED_INTERVALS = ["1 hourly", "1.5 hourly", "2 hourly", "2.5 hourly", "3 hourly", "4 hourly"] as const;

/* ------------------------------------------------------------------ *
 * The tab.
 * ------------------------------------------------------------------ */

export function FluidsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const f = d.baby.clinical?.fluids ?? {};
  const [s, setS] = useState({ ...f });
  const [manualDerived, setManualDerived] = useState({
    gir: f.girManual === true,
    kcal: f.kcalManual === true,
    feedVol: f.feedVolManual === true,
  });
  const wt = d.baby.currentWeight / 1000;
  const [saving, setSaving] = useState(false);
  const feedDetailsRef = useRef<HTMLDetailsElement>(null);
  // The feed-due clock has to move, so this one state is allowed to tick.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  // Day of life, 1 = the day of birth. Drives the fluid ramp and the targets.
  // Captured once so the calculation is pure during render.
  const [now] = useState(() => Date.now());
  const dol = Math.max(1, Math.floor((now - +new Date(d.baby.dob)) / 86400000) + 1);

  // The feed plan resolves today's enteral + IV volumes from the TFI target.
  // The same resolver runs inside calcNutrition, so the summary and the feed
  // volume can never disagree.
  const plan = resolveFeedPlan(s, wt);
  const planMode = s.feedPlan === "increasing" ? "increasing" : "static";
  const increaseAppliesTo = s.increaseAppliesTo === "tomorrow-target" ? "tomorrow-target" : "iv-today";
  const intervalHours = (() => {
    const match = s.feedFreq?.trim().match(/^(\d+(?:\.5)?) hourly$/i);
    return match ? Number(match[1]) : undefined;
  })();
  const feedsToday = intervalHours && intervalHours < 24 ? 24 / intervalHours : undefined;
  const planIv = plan.active ? plan.ivMlKgDay : s.ivMlKgDay;
  const autoGir = s.dextrosePct !== undefined && planIv !== undefined && planIv > 0
    ? girFromDextrose(s.dextrosePct, Math.min(250, planIv))
    : s.gir;
  const girValue = manualDerived.gir ? s.gir : autoGir;
  const autoFeedVolume = plan.active
    ? plan.perFeedMl ?? s.feedVol
    : feedsToday && wt > 0 && s.enteralMlKgDay !== undefined
      ? Number(((Math.min(250, s.enteralMlKgDay) * wt) / feedsToday).toFixed(2))
      : s.feedVol;
  const feedVolumeValue = manualDerived.feedVol ? s.feedVol : autoFeedVolume;
  // A manual per-feed volume converts back to ml/kg/day, but only when the plan
  // is not driving the volumes — there the plan stays authoritative.
  const manualEnteralFromVolume =
    !plan.active && manualDerived.feedVol && feedVolumeValue !== undefined && feedsToday && wt > 0
      ? Number(((feedVolumeValue * feedsToday) / wt).toFixed(4))
      : undefined;
  const enteralForNutrition = plan.active
    ? plan.enteralMlKgDay
    : manualEnteralFromVolume !== undefined
      ? manualEnteralFromVolume
      : s.enteralMlKgDay;
  const fortProduct = fortifierById(s.fortifierProductId);
  const protocol = s.protocol;
  const nutrition = calcNutrition(
    {
      fluids: {
        ...s,
        gir: girValue,
        girManual: manualDerived.gir,
        ivMlKgDay: planIv,
        ...(manualEnteralFromVolume !== undefined ? { enteralMlKgDay: manualEnteralFromVolume } : {}),
      },
    },
    d.baby.currentWeight,
    { dol },
  );

  // A guideline-based prescription for today, from this baby's size, day of
  // life, the unit's protocol and what they are already on. Nothing is written
  // until the clinician adopts a value or copies the whole thing in.
  const guide = suggestFluids({
    weightG: d.baby.currentWeight,
    dol,
    gestWeeks: d.baby.gestWeeks,
    enteralMlKgDay: enteralForNutrition,
    ivMlKgDay: s.ivMlKgDay,
    feedRoute: s.feedRoute,
    tfiMlKgDay: s.tfiMlKgDay,
    enteralProteinGKgDay: nutrition.enteralProtein,
    protocol,
  });

  /* --------------------------- writing values ---------------------------- */

  const setNum = (key: string) => (n: number) => setS((p) => ({ ...p, [key]: n }));
  const setProtocolValue = (key: keyof ProtocolOverrides) => (v: number | undefined) =>
    setS((p) => {
      const next = { ...(p.protocol ?? {}) };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return { ...p, protocol: Object.keys(next).length ? next : undefined };
    });

  /**
   * Editing the enteral volume means the volume is what the clinician wants. A
   * TFI target would silently take it back on the next render, so the plan is
   * released instead of the field being locked.
   */
  const setEnteral = (v: number) =>
    setS((p) => ({
      ...p,
      enteralMlKgDay: v,
      feedVolManual: false,
      ...(plan.active ? { feedPlan: undefined, tfiMlKgDay: undefined } : {}),
    }));

  /** The same, from the per-feed volume: ml per feed converts back to ml/kg/day. */
  const setPerFeed = (v: number) => {
    setManualDerived((current) => ({ ...current, feedVol: true }));
    setS((p) => ({
      ...p,
      feedVol: v,
      ...(feedsToday && wt > 0 ? { enteralMlKgDay: Number(((v * feedsToday) / wt).toFixed(2)) } : {}),
      ...(plan.active ? { feedPlan: undefined, tfiMlKgDay: undefined } : {}),
    }));
  };

  const setField = (key: string, value: unknown) => setS((p) => ({ ...p, [key]: value }));

  /**
   * Copy the whole suggestion in. The volumes are written directly and the feed
   * plan is left alone — arming it would let the TFI target take the enteral
   * volume back over, which is exactly what a typed prescription must not do.
   */
  const copyGuide = () =>
    setS((p) => ({
      ...p,
      ...guide.fields,
      feedPlan: undefined,
      tfiMlKgDay: undefined,
      feedIncrementMlKgDay: guide.fields.feedIncrementMlKgDay,
      feedType: p.feedType ?? "Expressed breast milk (EBM)",
      feedVolManual: false,
    }));

  const setDerived = (key: "gir" | "kcal") => (value: number) => {
    setManualDerived((current) => ({ ...current, [key]: true }));
    setS((p) => ({ ...p, [key]: value }));
  };
  const resetToAutomatic = (key: "gir" | "kcal") => {
    setManualDerived((current) => ({ ...current, [key]: false }));
    setS((p) => ({ ...p, [key]: undefined }));
  };

  // totalMlKgDay is what the board, the handover sheet and the print sheet all
  // read, so keep it in step instead of leaving a stale total.
  const saveFluids = async () => {
    setSaving(true);
    try {
      await patch({
        clinical: {
          fluids: {
            ...s,
            ...(plan.active && plan.enteralMlKgDay !== undefined ? { enteralMlKgDay: plan.enteralMlKgDay } : {}),
            totalMlKgDay: nutrition.totalFluids,
            gir: girValue,
            kcal: kcalValue,
            feedVol: feedVolumeValue,
            girManual: manualDerived.gir,
            kcalManual: manualDerived.kcal,
            feedVolManual: manualDerived.feedVol,
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const hasEnergyInputs = enteralForNutrition !== undefined || s.feedType !== undefined || girValue !== undefined || s.aminoAcid !== undefined || s.lipid !== undefined;
  const autoKcal = hasEnergyInputs || s.kcal === undefined ? (hasEnergyInputs ? nutrition.totalKcal : undefined) : s.kcal;
  const kcalValue = manualDerived.kcal ? s.kcal : autoKcal;

  /* ----------------------------- the flags ------------------------------- */

  const girFlag: Flag = girValue === undefined || girValue === 0
    ? { key: "gir", label: "GIR waiting for dextrose% and IV ml/kg/day", sev: "info" }
    : girValue < 4
      ? { key: "gir", label: `Low GIR ${girValue} mg/kg/min (<4)`, sev: "warn", note: "hypoglycaemia risk" }
      : girValue <= 8
        ? { key: "gir", label: `GIR ${girValue} mg/kg/min (target 4-8)`, sev: "info", note: `${nutrition.dextroseG} g/kg/day dextrose` }
        : girValue <= 12
          ? { key: "gir", label: `High GIR ${girValue} mg/kg/min (>8)`, sev: "warn", note: "monitor glucose, central line if >10" }
          : { key: "gir", label: `Very high GIR ${girValue} mg/kg/min (>12)`, sev: "crit", note: "central line required" };

  const kcalFlag: Flag = kcalValue === undefined
    ? { key: "kcal", label: "Energy waiting for feed or TPN inputs", sev: "info" }
    : kcalValue < 80
      ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d low (<80)`, sev: "warn", note: "below basal" }
      : kcalValue < nutrition.kcalTarget[0]
        ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d below target ${nutrition.kcalTarget[0]}-${nutrition.kcalTarget[1]}`, sev: "warn" }
        : kcalValue <= nutrition.kcalTarget[1]
          ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d within target`, sev: "info" }
          : kcalValue <= 160
            ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d above target`, sev: "warn" }
            : { key: "kcal", label: `Grossly high ${kcalValue} kcal/kg/d (>160)`, sev: "crit", note: "check ml/day vs ml/kg/day" };

  const protFlag: Flag = nutrition.totalProtein === 0
    ? { key: "prot", label: "Protein waiting for inputs", sev: "info" }
    : nutrition.totalProtein < 2
      ? { key: "prot", label: `Low protein ${nutrition.totalProtein} g/kg/d (<2)`, sev: "warn" }
      : nutrition.totalProtein < nutrition.proteinTarget[0]
        ? { key: "prot", label: `Protein ${nutrition.totalProtein} g/kg/d below ${nutrition.proteinTarget[0]}-${nutrition.proteinTarget[1]}`, sev: "warn" }
        : nutrition.totalProtein <= nutrition.proteinTarget[1]
          ? { key: "prot", label: `Protein ${nutrition.totalProtein} g/kg/d adequate`, sev: "info" }
          : nutrition.totalProtein <= 6
            ? { key: "prot", label: `High protein ${nutrition.totalProtein} g/kg/d`, sev: "warn" }
            : { key: "prot", label: `Grossly high protein ${nutrition.totalProtein} g/kg/d (>6)`, sev: "crit", note: "check AA g/kg/d vs ml" };

  /* --------------------------- derived labels ---------------------------- */

  const perFeedMl = feedVolumeValue ?? autoFeedVolume;
  const feedsRunning = enteralForNutrition !== undefined && enteralForNutrition > 0;
  const totalFluidsShown = nutrition.totalFluids;
  const totalMlDay = wt > 0 ? Math.round(totalFluidsShown * wt) : undefined;
  const guideFeedsPerDay = feedsPerDay(guide.fields.feedFreq);
  const guidePerFeed = wt > 0 && guideFeedsPerDay ? Math.round(((guide.fields.enteralMlKgDay * wt) / guideFeedsPerDay) * 10) / 10 : undefined;

  const lastFeedAt = s.lastFeedAt ? new Date(s.lastFeedAt) : undefined;
  const sinceLastFeed = lastFeedAt && !Number.isNaN(+lastFeedAt) ? (clock - +lastFeedAt) / 60000 : undefined;
  const nextFeedIn = sinceLastFeed !== undefined && intervalHours ? intervalHours * 60 - sinceLastFeed : undefined;
  const feedOverdue = nextFeedIn !== undefined && nextFeedIn < -10;
  const clockLabel =
    nextFeedIn === undefined
      ? undefined
      : nextFeedIn >= 0
        ? `next feed in ${Math.floor(nextFeedIn / 60)} h ${Math.round(nextFeedIn % 60)} min`
        : `${Math.floor(-nextFeedIn / 60)} h ${Math.round(-nextFeedIn % 60)} min since it was due`;

  const missingWeight = !(d.baby.currentWeight > 0);
  const nothingRecorded =
    s.enteralMlKgDay === undefined &&
    s.ivMlKgDay === undefined &&
    s.tfiMlKgDay === undefined &&
    s.totalMlKgDay === undefined &&
    s.dextrosePct === undefined &&
    s.aminoAcid === undefined &&
    s.lipid === undefined &&
    !plan.active;

  // The published figures, for the protocol editor's placeholders.
  const publishedBand = weightBand(d.baby.currentWeight);
  const effectiveBand = applyProtocol(publishedBand, protocol);
  const publishedTargets = targetsFor({ weightG: d.baby.currentWeight, dol });
  const usingProtocol = protocolInUse(protocol);

  const pristine = JSON.stringify(d.baby.clinical?.fluids ?? {});
  const dirty = JSON.stringify(s) !== pristine;

  const saveButtons = (
    <div className="flex shrink-0 items-center gap-2">
      <span className={`hidden text-[10px] sm:inline ${dirty ? "text-amber-200" : "text-slate-500"}`}>
        {dirty ? "unsaved" : "saved"}
      </span>
      <button type="button" className="btn-ghost" onClick={() => setS({ ...f })}>Discard</button>
      <button type="button" className="btn-primary" onClick={saveFluids} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <div className="grid gap-3">
      <Section
        title="Feeds & fluids"
        sub={`Day ${dol} · ${d.baby.currentWeight ? `${d.baby.currentWeight} g · ` : ""}${guide.phase.label}`}
        right={saveButtons}
      >
        <PhaseRail step={guide.phase.step} activeId={guide.phase.id} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.phase.blurb}</p>

        {missingWeight && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 p-2 text-[11px] leading-relaxed text-rose-100">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              No weight on record, so nothing here can be dosed &mdash; the targets fall back to {nutrition.targetsBasis}.
              Enter today&apos;s weight on the <b>Growth</b> tab.
            </span>
          </p>
        )}
        {nothingRecorded && !missingWeight && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2 text-[11px] leading-relaxed text-cyan-100">
            <Check size={13} className="mt-0.5 shrink-0" />
            <span>
              Nothing recorded yet. <b>Copy the guideline in</b> to fill every box for a {d.baby.currentWeight} g baby on
              day {dol}, then change anything your unit does differently and save.
            </span>
          </p>
        )}

        {/* --- today's prescription: one editable grid --------------------- */}
        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black text-cyan-50">Today&apos;s prescription</div>
              <div className="text-[10px] text-cyan-200/80">
                Every box is editable &mdash; what you type is what is used. The guideline sits under each one.
              </div>
            </div>
            <button type="button" className="btn-primary" onClick={copyGuide}>Copy the guideline in</button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <RxField
              label="Feeds ml/kg/day"
              value={plan.active ? plan.enteralMlKgDay : (manualEnteralFromVolume ?? s.enteralMlKgDay)}
              onValue={setEnteral}
              suggested={guide.fields.enteralMlKgDay}
              onUseSuggested={() => setEnteral(guide.fields.enteralMlKgDay)}
              min={0}
              max={250}
              step={5}
              placeholder="enter"
              note={plan.active ? "set by the feed plan — edit to take over" : guide.why.enteralMlKgDay}
            />
            <RxField
              label="Per feed ml"
              value={feedVolumeValue}
              onValue={setPerFeed}
              suggested={guidePerFeed}
              suggestedText={guidePerFeed !== undefined ? `${guidePerFeed} ml` : undefined}
              onUseSuggested={() => guidePerFeed !== undefined && setPerFeed(guidePerFeed)}
              min={0}
              max={120}
              step={0.5}
              decimals={1}
              placeholder="waiting"
              note={
                feedsToday
                  ? `${feedsToday} feeds/24 h${wt > 0 ? ` · ≈ ${Math.round((perFeedMl ?? 0) * feedsToday)} ml/day` : ""}`
                  : "choose an interval to split the day"
              }
            />
            <div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <div className="lbl mb-1 truncate">Feed interval</div>
                <div className="flex flex-wrap gap-1">
                  {FEED_INTERVALS.map((option) => (
                    <Chip
                      key={option}
                      label={option.replace(" hourly", " h")}
                      on={s.feedFreq === option}
                      onClick={() => setField("feedFreq", option)}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-1 flex min-h-4 items-start justify-between gap-1 text-[10px] leading-tight">
                <span className="truncate text-slate-500">{s.feedFreq && !FEED_INTERVALS.includes(s.feedFreq as never) ? s.feedFreq : "continuous / on demand in Feed details"}</span>
                {s.feedFreq !== guide.fields.feedFreq && (
                  <button
                    type="button"
                    className="shrink-0 font-bold text-cyan-200 underline"
                    onClick={() => setField("feedFreq", guide.fields.feedFreq)}
                  >
                    guideline {guide.fields.feedFreq} &rarr; use
                  </button>
                )}
              </div>
            </div>

            {/* Total fluids is worked out, not typed: it is enteral + IV, and
                save writes exactly this number. A box you can type into here
                would show one thing and store another. */}
            <div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <div className="lbl mb-1 truncate">Total fluids ml/kg/day</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-black tabular-nums text-white">{totalFluidsShown}</span>
                  {totalMlDay !== undefined && <span className="text-[10px] text-slate-400">≈ {totalMlDay} ml/day</span>}
                </div>
              </div>
              <div className="mt-1 min-h-4 text-[10px] leading-tight text-slate-500">
                {nutrition.enteralMl + nutrition.ivMl > 0
                  ? `enteral ${nutrition.enteralMl} + IV ${nutrition.ivMl} — worked out, not typed`
                  : totalFluidsShown > 0
                    ? "recorded total — no enteral/IV split on the chart yet"
                    : "enter the feeds and the IV above"}
              </div>
            </div>
            <RxField
              label="IV fluids ml/kg/day"
              value={s.ivMlKgDay ?? undefined}
              onValue={setNum("ivMlKgDay")}
              suggested={guide.fields.ivMlKgDay}
              onUseSuggested={() => setNum("ivMlKgDay")(guide.fields.ivMlKgDay)}
              min={0}
              max={250}
              step={5}
              placeholder="enter"
              note={guide.why.ivMlKgDay}
            />
            <RxField
              label="Dextrose %"
              value={s.dextrosePct ?? undefined}
              onValue={setNum("dextrosePct")}
              suggested={guide.fields.dextrosePct}
              suggestedText={`D${guide.fields.dextrosePct}%`}
              onUseSuggested={() => setNum("dextrosePct")(guide.fields.dextrosePct)}
              min={0}
              max={25}
              step={0.5}
              decimals={1}
              placeholder="for auto GIR"
              note={girValue !== undefined ? `GIR ${girValue} mg/kg/min · ${nutrition.dextroseG} g/kg/day` : "needs an IV volume"}
            />

            <RxField
              label="Amino acids g/kg/day"
              value={s.aminoAcid ?? undefined}
              onValue={setNum("aminoAcid")}
              suggested={guide.fields.aminoAcid}
              onUseSuggested={() => setNum("aminoAcid")(guide.fields.aminoAcid)}
              min={0}
              max={6}
              step={0.1}
              decimals={1}
              placeholder="g/kg/day"
              note={guide.why.aminoAcid}
            />
            <RxField
              label="Lipid g/kg/day"
              value={s.lipid ?? undefined}
              onValue={setNum("lipid")}
              suggested={guide.fields.lipid}
              onUseSuggested={() => setNum("lipid")(guide.fields.lipid)}
              min={0}
              max={6}
              step={0.1}
              decimals={1}
              placeholder="g/kg/day"
              note={guide.why.lipid}
            />
            <RxField
              label="Increase planned tomorrow ml/kg/day"
              value={s.feedIncrementMlKgDay ?? undefined}
              onValue={setNum("feedIncrementMlKgDay")}
              suggested={guide.fields.feedIncrementMlKgDay}
              onUseSuggested={() => setNum("feedIncrementMlKgDay")(guide.fields.feedIncrementMlKgDay)}
              min={0}
              max={250}
              step={5}
              placeholder="0"
              note={guide.why.feedIncrementMlKgDay}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[11px] text-slate-300">
            <span>
              <b className="text-slate-100">{s.feedType ?? "no feed type"}</b> via {s.feedRoute ?? "no route"}
            </span>
            <span className="text-slate-500">·</span>
            <span>
              {nutrition.fortified
                ? `fortified ${s.fortificationAmount} ${s.fortificationAmountUnit ?? "sachet"} × ${nutrition.fortDosesPerDay}/day`
                : guide.fields.fortifierProductId
                  ? "not fortified yet"
                  : "no fortifier"}
            </span>
            <button
              type="button"
              className="font-bold text-cyan-200 underline"
              onClick={() => {
                if (feedDetailsRef.current) feedDetailsRef.current.open = true;
              }}
            >
              change feed details
            </button>
          </div>

          {guide.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[10px] leading-relaxed text-slate-400">
              {guide.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>

        {/* --- against the target ------------------------------------------ */}
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-black text-slate-100">Against the target</div>
            <div className="text-[10px] text-slate-400">{nutrition.targetsBasis}</div>
          </div>
          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            <TargetRow
              label="Total fluids"
              value={nutrition.totalFluids}
              target={nutrition.fluidsTarget}
              unit="ml/kg/d"
              note={nutrition.feedPlan.active ? "set by the feed plan" : `enteral ${nutrition.enteralMl} + IV ${nutrition.ivMl}`}
            />
            <TargetRow
              label="Energy"
              value={kcalValue ?? 0}
              target={nutrition.kcalTarget}
              unit="kcal/kg/d"
              note={`enteral ${nutrition.enteralKcal} + IV ${nutrition.ivKcal}`}
            />
            <TargetRow
              label="Protein"
              value={nutrition.totalProtein}
              target={nutrition.proteinTarget}
              unit="g/kg/d"
              decimals={2}
              note={`milk ${nutrition.enteralProtein} + AA ${nutrition.aaProtein}`}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2 text-[10px]">
            <DeltaChip actual={nutrition.totalFluids} target={nutrition.fluidsTarget} />
            <DeltaChip actual={kcalValue ?? 0} target={nutrition.kcalTarget} />
            <DeltaChip actual={nutrition.totalProtein} target={nutrition.proteinTarget} decimals={2} />
            {clockLabel && (
              <span className={`flex items-center gap-1 font-bold ${feedOverdue ? "text-rose-200" : "text-slate-400"}`}>
                <Clock size={11} /> {clockLabel}
                {feedOverdue && " — feed is late"}
              </span>
            )}
          </div>
        </div>

        {nutrition.warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-200">
              <AlertTriangle size={14} /> {nutrition.warnings.length} thing{nutrition.warnings.length === 1 ? "" : "s"} the calculation had to assume
            </div>
            <ul className="mt-1 list-disc pl-5 text-[11px] leading-relaxed text-amber-100">
              {nutrition.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* --- feed details, one disclosure -------------------------------- */}
        <details ref={feedDetailsRef} className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">Feed details &amp; tolerance</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="lbl mb-1 block">Feed type</span>
              <DialWithOther options={FEED_TYPE} value={s.feedType} onChange={(v: string) => setField("feedType", v)} otherPlaceholder="Other feed type…" />
            </label>
            <label className="block">
              <span className="lbl mb-1 block">Route</span>
              <DialWithOther options={FEED_ROUTE} value={s.feedRoute} onChange={(v: string) => setField("feedRoute", v)} otherPlaceholder="Other route…" />
            </label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="lbl mb-1 block">Frequency</span>
              <DialWithOther
                options={["1 hourly", "1.5 hourly", "2 hourly", "2.5 hourly", "3 hourly", "4 hourly", "continuous", "2-3 hourly on demand"]}
                value={s.feedFreq}
                onChange={(v: string) => setField("feedFreq", v)}
                otherPlaceholder="Other frequency…"
              />
            </label>
            <label className="block">
              <span className="lbl mb-1 block">Last feed given</span>
              <input
                type="datetime-local"
                className="inp min-h-11"
                value={localDateTimeValue(s.lastFeedAt)}
                onChange={(event) => setS((p) => ({ ...p, lastFeedAt: event.target.value ? new Date(event.target.value).toISOString() : undefined }))}
              />
            </label>
            <NumField label="Last residual ml" value={s.residualMl ?? undefined} onChange={setNum("residualMl")} min={0} max={100} step={0.5} decimals={1} placeholder="not checked" />
            <NumField label="Feeds held today" value={s.feedsHeldToday ?? undefined} onChange={setNum("feedsHeldToday")} min={0} max={24} step={1} decimals={0} placeholder="0" />
          </div>
          <label className="mt-2 block">
            <span className="lbl mb-1 block">Feeding note</span>
            <input className="inp min-h-11" value={s.feedNotes ?? ""} onChange={(event) => setField("feedNotes", event.target.value)} placeholder="vomits, abdomen, tolerance…" />
          </label>
          {((s.feedsHeldToday ?? 0) > 0 || (s.residualMl ?? 0) > 0) && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {`${s.feedsHeldToday ?? 0} feed${(s.feedsHeldToday ?? 0) === 1 ? "" : "s"} held and a residual of ${
                s.residualMl ?? 0
              } ml recorded — review for feed intolerance before the next increase, and record the decision in the note.`}
            </p>
          )}

          <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/50 p-2">
            <div className="text-[11px] font-black text-slate-200">Feed plan {plan.active ? "— active" : "— off"}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              Optional. Drives the enteral volume from a total fluid intake target instead of typing it.{" "}
              <b className="text-slate-200">Static</b>: the whole TFI is enteral, divided across the day.{" "}
              <b className="text-slate-200">Increasing</b>: enter the TFI and the step-up, then choose whether the step-up is
              given IV today or becomes tomorrow&apos;s feed target. Editing the feed volume above releases the plan.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip label="Static" on={planMode !== "increasing"} onClick={() => setField("feedPlan", "static")} />
              <Chip label="Increasing" on={planMode === "increasing"} onClick={() => setField("feedPlan", "increasing")} />
              {plan.active && (
                <Chip
                  label="Turn the plan off"
                  on={false}
                  onClick={() =>
                    setS((p) => ({
                      ...p,
                      feedPlan: undefined,
                      tfiMlKgDay: undefined,
                      feedIncrementMlKgDay: undefined,
                      enteralMlKgDay: p.enteralMlKgDay ?? plan.enteralMlKgDay,
                    }))
                  }
                />
              )}
            </div>
            {planMode === "increasing" && (
              <div className="mt-2">
                <span className="lbl mb-1 block">Increase applies to</span>
                <div className="flex flex-wrap gap-1.5">
                  <Chip label="Given IV today" on={increaseAppliesTo !== "tomorrow-target"} onClick={() => setField("increaseAppliesTo", "iv-today")} />
                  <Chip label="Tomorrow's feed target" on={increaseAppliesTo === "tomorrow-target"} onClick={() => setField("increaseAppliesTo", "tomorrow-target")} />
                </div>
              </div>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <NumField label="TFI target ml/kg/day" value={s.tfiMlKgDay ?? undefined} onChange={setNum("tfiMlKgDay")} min={0} max={250} step={1} placeholder="e.g. 150" />
              {planMode === "increasing" && (
                <NumField label="Increase over next 24 h ml/kg/day" value={s.feedIncrementMlKgDay ?? undefined} onChange={setNum("feedIncrementMlKgDay")} min={0} max={250} step={1} placeholder="e.g. 20" />
              )}
            </div>
            {plan.active && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-[10px] leading-relaxed">
                  <div className="lbl !mb-1">Today</div>
                  <div className="font-black text-white">Enteral {plan.enteralMlKgDay} ml/kg/day</div>
                  <div className="text-slate-400">
                    {plan.perFeedMl !== undefined && plan.feedsPerDay !== undefined
                      ? `${plan.perFeedMl} ml per feed × ${plan.feedsPerDay} feeds/24 h`
                      : "choose an interval to split the day"}
                  </div>
                  <div className="text-slate-400">
                    IV entered {plan.ivMlKgDay ?? 0} ml/kg/day — total {plan.totalFluidsMlKgDay} ml/kg/day
                  </div>
                  {plan.ivSuggestedMlKgDay !== undefined && plan.ivSuggestedMlKgDay > 0 && (
                    <div className="text-slate-500">{plan.ivSuggestedMlKgDay} ml/kg/day of IV would bring the day to the TFI target</div>
                  )}
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-[10px] leading-relaxed">
                  <div className="lbl !mb-1">Next 24 h</div>
                  <div className="font-black text-white">Enteral {plan.tomorrowEnteralMlKgDay} ml/kg/day</div>
                  <div className="text-slate-400">
                    {plan.mode === "increasing" && plan.increment !== undefined ? `step up of ${plan.increment} ml/kg/day` : "unchanged — static plan"}
                  </div>
                  <div className={plan.reconciled ? "text-slate-400" : "font-bold text-amber-200"}>
                    {plan.reconciled
                      ? `enteral + IV reconciles to TFI ${plan.tfi} ml/kg/day`
                      : `enteral + IV is ${plan.totalFluidsMlKgDay}, TFI target ${plan.tfi} ml/kg/day`}
                  </div>
                </div>
              </div>
            )}
            {plan.notes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[10px] text-amber-100">
                {plan.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        </details>

        {/* --- fortification ---------------------------------------------- */}
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">
            Fortification {nutrition.fortified ? `— ${s.fortificationAmount} ${s.fortificationAmountUnit ?? "sachet"} × ${nutrition.fortDosesPerDay}/day` : "— none recorded"}
          </summary>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            Record exactly as prepared — product, amount, and the volume it was mixed into. Nothing is rescaled: only the feeds
            the fortifier is actually given in are uplifted.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Picking a stocked product fills the per-unit values, the dose unit
                and the mix volume from the label, and clears any override. */}
            <label className="block lg:col-span-2">
              <span className="lbl mb-1 block">Fortification product</span>
              <select
                className="inp min-h-11"
                value={s.fortifierProductId ?? ""}
                onChange={(event) => {
                  const id = event.target.value;
                  const product = fortifierById(id);
                  setS((p) => ({
                    ...p,
                    fortifierProductId: id || undefined,
                    fortificationName: product ? product.name : p.fortificationName,
                    fortificationAmountUnit: product ? product.unit : p.fortificationAmountUnit,
                    fortificationFeedVolumeMl: product ? product.mixedWithMl : p.fortificationFeedVolumeMl,
                    fortifierKcalPerUnit: product ? undefined : p.fortifierKcalPerUnit,
                    fortifierProteinPerUnit: product ? undefined : p.fortifierProteinPerUnit,
                  }));
                }}
              >
                <option value="">— Select the product on the label —</option>
                {FORTIFIER_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block lg:col-span-2">
              <span className="lbl mb-1 block">Free-text name (if not listed)</span>
              <input className="inp min-h-11" value={s.fortificationName ?? ""} onChange={(event) => setField("fortificationName", event.target.value)} placeholder="e.g. human milk fortifier" />
            </label>

            {fortProduct && (
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="lbl mb-1 block">Dose per feed — {fortProduct.unit === "sachet" ? "sachet" : "grams of powder"}</span>
                <div className="flex flex-wrap gap-1.5">
                  {fortProduct.steps.map((step) => (
                    <button
                      key={step}
                      type="button"
                      className={`chip ${s.fortificationAmount === step ? "chip-on" : "chip-off"}`}
                      onClick={() => setNum("fortificationAmount")(step)}
                    >
                      {fortProduct.stepLabel(step)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{fortProduct.note}</p>
              </div>
            )}

            <NumField label="Amount per dose" value={s.fortificationAmount ?? undefined} onChange={setNum("fortificationAmount")} min={0} max={100} step={0.05} decimals={2} placeholder="enter" />
            <label className="block">
              <span className="lbl mb-1 block">Amount unit</span>
              <select
                className="inp min-h-11"
                value={s.fortificationAmountUnit ?? "sachet"}
                onChange={(event) => setS((p) => ({ ...p, fortificationAmountUnit: event.target.value as NonNullable<typeof p.fortificationAmountUnit> }))}
              >
                <option value="sachet">sachet</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="scoop">scoop</option>
                <option value="measure">measure</option>
              </select>
            </label>
            <NumField label="Feed volume mixed (ml)" value={s.fortificationFeedVolumeMl ?? undefined} onChange={setNum("fortificationFeedVolumeMl")} min={0} max={1000} step={1} decimals={1} placeholder="required for energy" />
            <NumField
              label={`Times per day — ${nutrition.fortFeedsPerDay ? `${nutrition.fortFeedsPerDay} feeds total` : "feed frequency unknown"}`}
              value={s.fortificationDosesPerDay ?? undefined}
              onChange={setNum("fortificationDosesPerDay")}
              min={0}
              max={48}
              step={1}
              decimals={0}
              placeholder={nutrition.fortFeedsPerDay ? String(nutrition.fortFeedsPerDay) : "every feed"}
            />
            <NumField
              label={`kcal per unit — ${s.fortifierKcalPerUnit === undefined ? `label ${fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT}` : "custom"}`}
              value={s.fortifierKcalPerUnit ?? undefined}
              onChange={setNum("fortifierKcalPerUnit")}
              min={0}
              max={50}
              step={0.05}
              decimals={3}
              placeholder={String(fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT)}
            />
            <NumField
              label={`Protein g per unit — ${s.fortifierProteinPerUnit === undefined ? `label ${fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT}` : "custom"}`}
              value={s.fortifierProteinPerUnit ?? undefined}
              onChange={setNum("fortifierProteinPerUnit")}
              min={0}
              max={10}
              step={0.01}
              decimals={3}
              placeholder={String(fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT)}
            />
            <label className="block sm:col-span-2 lg:col-span-2">
              <span className="lbl mb-1 block">Preparation note</span>
              <input className="inp min-h-11" value={s.fortificationNotes ?? ""} onChange={(event) => setField("fortificationNotes", event.target.value)} placeholder="Optional" />
            </label>
          </div>
          {!nutrition.fortified && guide.fields.fortifierProductId && (
            <button
              type="button"
              className="btn-ghost mt-3"
              onClick={() =>
                setS((p) => ({
                  ...p,
                  fortifierProductId: guide.fields.fortifierProductId,
                  fortificationAmount: guide.fields.fortificationAmount,
                  fortificationDosesPerDay: guide.fields.fortificationDosesPerDay,
                }))
              }
            >
              Start fortification as suggested
            </button>
          )}
          <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[10px] leading-relaxed text-slate-300">
            {nutrition.fortified ? (
              <>
                <b className="text-white">Counted in the totals:</b> {s.fortificationAmount} {s.fortificationAmountUnit ?? "sachet"} in{" "}
                {s.fortificationFeedVolumeMl ?? fortProduct?.mixedWithMl} ml, given{" "}
                <b className="text-white">
                  {nutrition.fortDosesPerDay} time{nutrition.fortDosesPerDay === 1 ? "" : "s"}/day
                </b>{" "}
                —{" "}
                {s.fortificationFeedVolumeMl || fortProduct
                  ? `${(s.fortificationFeedVolumeMl ?? fortProduct!.mixedWithMl) * nutrition.fortDosesPerDay} ml/day fortified, `
                  : ""}
                {(nutrition.fortFraction * 100).toFixed(0)}% of the enteral volume. Inside a fortified feed that is{" "}
                <b className="text-cyan-200">{nutrition.fortKcalPerMlInFeed} kcal/ml</b> and{" "}
                <b className="text-emerald-200">{nutrition.fortProteinPerMlInFeed} g protein/ml</b>; spread over the day it adds{" "}
                <b className="text-cyan-200">+{nutrition.fortKcalPerMl} kcal/ml</b> and{" "}
                <b className="text-emerald-200">+{nutrition.fortProteinPerMl} g protein/ml</b> to {nutrition.feedType} — effective
                density {nutrition.effectiveKcalPerMl} kcal/ml, {nutrition.effectiveProteinPerMl} g protein/ml.
              </>
            ) : (
              "No fortifier recorded — the base milk density is used."
            )}
          </div>
        </details>

        {/* --- the unit's own figures -------------------------------------- */}
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">
            Unit protocol for this baby {usingProtocol ? "— using your figures" : "— published values"}
          </summary>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            The published figures are guidance, and units differ. Replace any of them here and every suggestion, target and
            phase for <b className="text-slate-200">this baby</b> follows your numbers. Leave a box empty to use the published
            value; the placeholder shows what that is. Nothing here changes another baby&apos;s chart.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROTOCOL_FIELDS.map((field) => (
              <ProtocolRow
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={protocol?.[field.key]}
                published={field.published(effectiveBand ?? publishedBand ?? weightBand(1500)!)}
                hint={field.hint}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={setProtocolValue(field.key)}
              />
            ))}
            {TARGET_FIELDS.map((field) => (
              <ProtocolRow
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={protocol?.[field.key]}
                published={field.published(publishedTargets)}
                hint={field.hint}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={setProtocolValue(field.key)}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {usingProtocol && (
              <button type="button" className="btn-ghost" onClick={() => setField("protocol", undefined)}>
                Use the published values
              </button>
            )}
            <span className="text-[10px] text-slate-500">
              {usingProtocol
                ? `${Object.values(protocol ?? {}).filter((v) => v !== undefined).length} figure(s) replaced — the suggestion says so in its notes.`
                : `Published band for this weight: ${publishedBand?.label ?? "no weight"} · ${publishedBand ? `${bandIntervalHours(publishedBand)}-hourly feeds, full feeds ${publishedBand.fullFeeds} ml/kg/day` : "enter a weight to see the band"}.`}
            </span>
          </div>
        </details>

        {/* --- the audit trail -------------------------------------------- */}
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">How these numbers are worked out</summary>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed">
              <div className="lbl !mb-1">GIR</div>
              <div className="text-sm font-black text-white">
                {girValue ?? "-"} <span className="text-[10px] font-normal text-slate-400">mg/kg/min</span>
              </div>
              <div className="text-slate-400">{girFlag.note ?? girFlag.label}</div>
              <div className="text-[10px] text-slate-500">source: {nutrition.girSource} — (D% × IV × 10) ÷ 1440</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed">
              <div className="lbl !mb-1">Energy</div>
              <div className="text-sm font-black text-white">
                {kcalValue ?? "-"} <span className="text-[10px] font-normal text-slate-400">kcal/kg/day</span>
              </div>
              <div className="text-slate-400">{kcalFlag.label}</div>
              <div className="text-[10px] text-slate-500">
                density {nutrition.density} kcal/ml ({nutrition.feedType})
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed">
              <div className="lbl !mb-1">Protein</div>
              <div className="text-sm font-black text-white">
                {nutrition.totalProtein} <span className="text-[10px] font-normal text-slate-400">g/kg/day</span>
              </div>
              <div className="text-slate-400">{protFlag.label}</div>
              <div className="text-[10px] text-slate-500">{nutrition.proteinPerMl} g/ml ({nutrition.feedType})</div>
            </div>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2 text-[11px]">
              <div className="lbl !mb-1">Energy kcal/kg/day</div>
              <ul className="space-y-1 leading-relaxed text-slate-200">
                <li className="flex justify-between gap-2">
                  <span>Milk / feeds {nutrition.enteralMl} ml × {nutrition.density} kcal/ml</span>
                  <b>{nutrition.milkKcal}</b>
                </li>
                {nutrition.fortified && (
                  <li className="flex justify-between gap-2 text-cyan-100">
                    <span>Fortifier {nutrition.enteralMl} ml × {nutrition.fortKcalPerMl} kcal/ml</span>
                    <b>+{nutrition.fortKcal}</b>
                  </li>
                )}
                <li className="flex justify-between gap-2">
                  <span>IV dextrose {nutrition.dextroseG} g × 3.4 (GIR {nutrition.gir})</span>
                  <b>{nutrition.dextroseKcal}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span>IV amino acids {nutrition.aaG} g × 4</span>
                  <b>{nutrition.aaKcal}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span>IV lipid {nutrition.lipidG} g × 9</span>
                  <b>{nutrition.lipidKcal}</b>
                </li>
                <li className="mt-1 flex justify-between gap-2 border-t border-white/10 pt-1 font-black text-white">
                  <span>Total (enteral {nutrition.enteralKcal} + IV {nutrition.ivKcal})</span>
                  <span>{nutrition.totalKcal}</span>
                </li>
                <li className="text-[10px] text-slate-400">Target {nutrition.kcalTarget[0]}–{nutrition.kcalTarget[1]} kcal/kg/day</li>
              </ul>
            </div>
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2 text-[11px]">
              <div className="lbl !mb-1">Protein g/kg/day</div>
              <ul className="space-y-1 leading-relaxed text-slate-200">
                <li className="flex justify-between gap-2">
                  <span>Milk / feeds {nutrition.enteralMl} ml × {nutrition.proteinPerMl} g/ml</span>
                  <b>{nutrition.milkProtein}</b>
                </li>
                {nutrition.fortified && (
                  <li className="flex justify-between gap-2 text-emerald-100">
                    <span>Fortifier {nutrition.enteralMl} ml × {nutrition.fortProteinPerMl} g/ml</span>
                    <b>+{nutrition.fortProtein}</b>
                  </li>
                )}
                <li className="flex justify-between gap-2">
                  <span>IV amino acids (Aminoven / Vaminolact)</span>
                  <b>{nutrition.aaProtein}</b>
                </li>
                <li className="flex justify-between gap-2 text-slate-400">
                  <span>IV lipid emulsion (no usable protein)</span>
                  <b>{nutrition.lipidProtein}</b>
                </li>
                <li className="mt-1 flex justify-between gap-2 border-t border-white/10 pt-1 font-black text-white">
                  <span>Total (enteral {nutrition.enteralProtein} + IV {nutrition.aaProtein})</span>
                  <span>{nutrition.totalProtein}</span>
                </li>
                <li className="text-[10px] text-slate-400">Target {nutrition.proteinTarget[0]}–{nutrition.proteinTarget[1]} g/kg/day</li>
              </ul>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <NumField
                label={`GIR mg/kg/min — ${manualDerived.gir ? "manual" : "automatic"} (0-20)`}
                value={girValue}
                onChange={setDerived("gir")}
                min={0}
                max={20}
                step={0.1}
                decimals={2}
                placeholder="waiting"
              />
              {manualDerived.gir && (
                <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("gir")}>
                  Use automatic GIR
                </button>
              )}
            </div>
            <div>
              <NumField
                label={`Energy kcal/kg/d — ${manualDerived.kcal ? "manual" : "automatic"} (0-300)`}
                value={kcalValue}
                onChange={setDerived("kcal")}
                min={0}
                max={300}
                step={1}
                decimals={1}
                placeholder="waiting"
              />
              {manualDerived.kcal && (
                <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("kcal")}>
                  Use automatic energy
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-white/[0.03] p-2 text-[10px] leading-relaxed text-slate-400">
            Formulas: GIR = D% × IV ml/kg/day × 10 ÷ 1440 · dextrose g = GIR × 1.44 · kcal = enteral ml × density + dextrose g × 3.4
            + AA × 4 + lipid × 9 · protein = enteral ml × protein/ml + AA. Caps: GIR 0-20, AA/lipid 0-6, fluids 0-250. Gross values
            over 300 kcal or 10 g protein are flagged. These overrides exist for the rare baby the formula does not fit.
          </p>
        </details>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <button type="button" className="btn-primary" onClick={saveFluids} disabled={saving}>
            {saving ? "Saving…" : "Save feeds & fluids"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setS({ ...f })}>
            Discard changes
          </button>
          <span className="text-[10px] text-slate-500">{dirty ? "unsaved changes on this tab" : "no unsaved changes"}</span>
        </div>
      </Section>

      <p className="px-1 text-[10px] leading-relaxed text-slate-500">
        Guideline values are drawn from published preterm nutrition guidance (Patel et al. <i>Nutrients</i> 2015, ESPGHAN/AAP
        enteral and parenteral targets, UC Davis and CHOP NICU nutrition protocols, WHO KMC guidance) and live in{" "}
        <code>src/lib/feed-guide.ts</code>{usingProtocol ? ", with this baby's unit protocol applied on top" : ""}. They are
        decision support only — the prescription is the clinician&apos;s, and every figure can be changed on this tab.
      </p>
    </div>
  );
}
