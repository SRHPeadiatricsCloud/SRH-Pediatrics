"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { Chip, DialWithOther, NumField, Section, api } from "@/components/ui";
import { girFromDextrose } from "@/lib/interpret";
import {
  FEED_PHASES,
  PROTOCOL_FIELDS,
  TARGET_FIELDS,
  applyProtocol,
  bandIntervalHours,
  mergeProtocols,
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
  FORMULA_COMPOSITION_TABLE,
  feedsPerDay,
  fortifierById,
  resolveFeedPlan,
} from "@/lib/clinical";
import { FEED_ROUTE, FEED_TYPE } from "@/lib/catalog";

/* ------------------------------------------------------------------ *
 * Small pieces shared by the tab.
 * ------------------------------------------------------------------ */

/** A gap reads better without a trailing ".0". */
function trimNum(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
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
        <span className={`text-right ${inBand ? "" : low ? "text-amber-200/80" : "text-rose-200/80"}`}>
          {note ??
            (value === 0
              ? "nothing recorded"
              : inBand
                ? "in range"
                : low
                  ? `${trimNum(lo - value, decimals)} short`
                  : `${trimNum(value - hi, decimals)} over`)}
        </span>
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
 * One protocol figure. A plain input rather than a stepper, because the empty
 * state is meaningful: blank means "fall through to the next layer", and the
 * sub-label says what that layer currently gives.
 */
function ProtocolRow({
  label,
  unit,
  value,
  published,
  inherited,
  hint,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  /** What the layer being edited holds. */
  value: number | undefined;
  /** The published guidance figure. */
  published: number;
  /** What the layer below already provides, e.g. the unit's figure. */
  inherited?: { value: number; from: string };
  hint: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number | undefined) => void;
}) {
  const overridden = value !== undefined;
  const fallback = overridden ? undefined : inherited ? `${inherited.from} ${inherited.value}` : `published ${published}`;
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
        placeholder={String(inherited?.value ?? published)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
      />
      <span className="mt-1 block text-[10px] leading-tight text-slate-500">
        {overridden ? `this ${inherited ? "baby" : "layer"} — published ${published}` : fallback} · {hint}
      </span>
    </label>
  );
}

/** The fallback a cleared box falls through to, labelled by where it came from. */
function unitValueFor(value: number | undefined, from: string) {
  return typeof value === "number" && Number.isFinite(value) ? { value, from } : undefined;
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
  // The unit's own figures, shared by every baby in it. A baby's own override
  // still wins, so one chart can depart from the unit without changing it.
  const [unitProtocol, setUnitProtocol] = useState<ProtocolOverrides | undefined>(undefined);
  const [unitDraft, setUnitDraft] = useState<ProtocolOverrides | undefined>(undefined);
  const [unitSaving, setUnitSaving] = useState(false);
  const [protocolScope, setProtocolScope] = useState<"baby" | "unit">("baby");
  useEffect(() => {
    let live = true;
    fetch(`/api/unit-protocol?unit=${encodeURIComponent(d.baby.unit)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { row?: { protocol?: ProtocolOverrides } | null }) => {
        if (!live) return;
        const loaded = (json?.row?.protocol ?? undefined) as ProtocolOverrides | undefined;
        setUnitProtocol(loaded);
        setUnitDraft(loaded);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [d.baby.unit]);
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
  // This baby's figures beat the unit's, which beat the published guidance.
  const protocol = mergeProtocols(s.protocol, unitProtocol);
  const nutrition = calcNutrition(
    {
      fluids: {
        ...s,
        protocol,
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

  /** 1-Tap Daily Feed Advancement with automatic IV weaning compensation */
  const stepIncrement = guide.band?.increment ?? 20;
  const currentEnteral = s.enteralMlKgDay ?? guide.fields.enteralMlKgDay ?? 0;
  const currentIv = s.ivMlKgDay ?? 0;
  const fullFeedsCap = guide.band?.fullFeeds ?? 150;
  const canAdvance = currentEnteral < fullFeedsCap;
  const actualStep = Math.min(stepIncrement, Math.max(0, fullFeedsCap - currentEnteral));

  const hasToleranceIssue = (s.feedsHeldToday ?? 0) > 0 || (s.residualMl ?? 0) > 2;

  const advanceFeeds = () => {
    const nextEnteral = currentEnteral + actualStep;
    const nextIv = Math.max(0, currentIv - actualStep);
    setS((p) => ({
      ...p,
      enteralMlKgDay: nextEnteral,
      ivMlKgDay: nextIv,
      feedVolManual: false,
      // If passing fortification threshold (100 ml/kg/day), prime fortifier if not already set
      ...(nextEnteral >= 100 && !p.fortifierProductId && guide.fields.fortifierProductId
        ? {
            fortifierProductId: guide.fields.fortifierProductId,
            fortificationAmount: guide.fields.fortificationAmount ?? 1,
            fortificationDosesPerDay: guide.fields.fortificationDosesPerDay ?? 8,
          }
        : {}),
    }));
  };

  const setUnitProtocolValue = (key: keyof ProtocolOverrides) => (v: number | undefined) =>
    setUnitDraft((current) => {
      const next = { ...(current ?? {}) };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });

  const saveUnitProtocol = async () => {
    setUnitSaving(true);
    try {
      const result = (await api("/api/unit-protocol", "POST", {
        unit: d.baby.unit,
        protocol: unitDraft ?? {},
      })) as { row?: { protocol?: ProtocolOverrides } } | undefined;
      if (result?.row?.protocol !== undefined) setUnitProtocol(result.row.protocol as ProtocolOverrides);
    } finally {
      setUnitSaving(false);
    }
  };

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

  // The protocol editor edits one layer at a time; the other layers still show
  // through as the fallback a cleared box falls back to.
  const activeLayer = protocolScope === "baby" ? s.protocol : unitDraft;
  const babyHasOverrides = protocolInUse(s.protocol);
  const unitHasOverrides = protocolInUse(unitDraft);
  const unitDirty = JSON.stringify(unitDraft ?? {}) !== JSON.stringify(unitProtocol ?? {});

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
        {/* Line removal safety reminder when feeds reach >= 120 ml/kg/day */}
        {(s.enteralMlKgDay ?? 0) >= 120 && (d.baby.clinical?.lines ?? []).length > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            <span className="font-semibold">⚠️ Feeds ≥ 120 ml/kg/day: Review vascular lines ({(d.baby.clinical?.lines ?? []).map((l) => l.name).join(", ")}) for timely removal to prevent CLABSI.</span>
          </div>
        )}
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
        {/* --- today: the whole order on one card -------------------------- */}
        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black text-cyan-50">Today</div>
              <div className="text-[10px] text-cyan-200/80">{guide.headline}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {canAdvance && actualStep > 0 && (
                <button
                  type="button"
                  onClick={advanceFeeds}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition ${
                    hasToleranceIssue
                      ? "border border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                      : "border border-emerald-400/40 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                  }`}
                  title={hasToleranceIssue ? "Feeds held or residual high — review tolerance before advancing" : `Advance feeds by +${actualStep} ml/kg/day and wean IV`}
                >
                  {hasToleranceIssue ? "⚠️ Check tolerance & advance" : `+ Advance feeds (+${actualStep} ml/kg/d)`}
                </button>
              )}
              <button type="button" className="btn-primary" onClick={copyGuide}>
                Use the guideline
              </button>
            </div>
          </div>

          {/* Feeds */}
          <div className="mt-3">
            <div className="lbl !mb-1.5">Feeds</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="Feeds ml/kg/day"
                value={plan.active ? plan.enteralMlKgDay : (manualEnteralFromVolume ?? s.enteralMlKgDay)}
                onChange={setEnteral}
                min={0}
                max={250}
                step={5}
                placeholder="enter"
              />
              <NumField
                label="Per feed ml"
                value={feedVolumeValue}
                onChange={setPerFeed}
                min={0}
                max={120}
                step={0.5}
                decimals={1}
                placeholder="—"
              />
              <label className="block">
                <span className="lbl mb-1 block">Interval</span>
                <select
                  className="inp min-h-11"
                  value={s.feedFreq ?? ""}
                  onChange={(event) => setField("feedFreq", event.target.value)}
                >
                  <option value="">not set</option>
                  {FEED_INTERVALS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {s.feedFreq && !FEED_INTERVALS.includes(s.feedFreq as never) && (
                    <option value={s.feedFreq}>{s.feedFreq}</option>
                  )}
                </select>
              </label>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              {feedsToday && perFeedMl
                ? `${perFeedMl} ml × ${feedsToday} feeds`
                : "set an interval to split the day into feeds"}
              {totalMlDay !== undefined && nutrition.enteralMl > 0 ? ` · ≈ ${Math.round(nutrition.enteralMl * wt)} ml/day` : ""}
              {s.feedType ? ` · ${s.feedType}` : ""}
              {s.feedRoute ? ` via ${s.feedRoute}` : ""}
              {clockLabel ? (
                <span className={feedOverdue ? "font-bold text-rose-200" : ""}>
                  {" · "}
                  {clockLabel}
                  {feedOverdue && " — feed is late"}
                </span>
              ) : (
                ""
              )}
              {plan.active ? " · set by the feed plan" : ""}
            </p>
          </div>

          {/* IV */}
          <div className="mt-3">
            <div className="lbl !mb-1.5">IV fluids</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="IV ml/kg/day"
                value={s.ivMlKgDay ?? undefined}
                onChange={setNum("ivMlKgDay")}
                min={0}
                max={250}
                step={5}
                placeholder="enter"
              />
              <NumField
                label="Dextrose %"
                value={s.dextrosePct ?? undefined}
                onChange={setNum("dextrosePct")}
                min={0}
                max={25}
                step={0.5}
                decimals={1}
                placeholder="—"
              />
              <NumField
                label={`GIR mg/kg/min${manualDerived.gir ? " — manual" : ""}`}
                value={girValue}
                onChange={setDerived("gir")}
                min={0}
                max={20}
                step={0.1}
                decimals={2}
                placeholder={`${nutrition.gir} calculated`}
              />
            </div>
          </div>

          {/* Parenteral nutrition */}
          <div className="mt-3">
            <div className="lbl !mb-1.5">Parenteral nutrition</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="Amino acids g/kg/day"
                value={s.aminoAcid ?? undefined}
                onChange={setNum("aminoAcid")}
                min={0}
                max={6}
                step={0.1}
                decimals={1}
                placeholder="—"
              />
              <NumField
                label="Lipid g/kg/day"
                value={s.lipid ?? undefined}
                onChange={setNum("lipid")}
                min={0}
                max={6}
                step={0.1}
                decimals={1}
                placeholder="—"
              />
              <div className="flex flex-col justify-end rounded-xl border border-white/10 bg-slate-900/50 p-2 text-[10px] leading-relaxed text-slate-400">
                <div>
                  Protein <b className="text-slate-100">{nutrition.totalProtein}</b> g/kg/day
                </div>
                <div>
                  {nutrition.fortified
                    ? `fortified ${s.fortificationAmount} ${s.fortificationAmountUnit ?? "sachet"} × ${nutrition.fortDosesPerDay}/day`
                    : "not fortified"}
                </div>
              </div>
            </div>
          </div>

          {/* The day's total, against the target for this baby */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="lbl !mb-0">
                Total today {totalFluidsShown} ml/kg/day
                {totalMlDay !== undefined ? ` ≈ ${totalMlDay} ml` : ""}
              </div>
              <div className="text-[10px] text-slate-500">{nutrition.targetsBasis}</div>
            </div>
            <div className="mt-2 grid gap-3 lg:grid-cols-3">
              <TargetRow label="Fluids" value={nutrition.totalFluids} target={nutrition.fluidsTarget} unit="ml/kg/d" />
              <TargetRow label="Energy" value={kcalValue ?? 0} target={nutrition.kcalTarget} unit="kcal/kg/d" />
              <TargetRow label="Protein" value={nutrition.totalProtein} target={nutrition.proteinTarget} unit="g/kg/d" decimals={2} />
            </div>
            {manualDerived.kcal && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-slate-400">Energy is overridden — the calculated figure is {nutrition.totalKcal} kcal/kg/d.</span>
                <button type="button" className="text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("kcal")}>
                  Use the calculated energy
                </button>
              </div>
            )}
            <details className="quiet mt-2">
              <summary>Override the calculated energy</summary>
              <NumField
                label="Energy kcal/kg/d"
                value={kcalValue}
                onChange={setDerived("kcal")}
                min={0}
                max={300}
                step={1}
                decimals={1}
                placeholder={`${nutrition.totalKcal} calculated`}
              />
            </details>
          </div>

          {/* The guideline, as one sentence, with the reasoning behind it */}
          <details className="mt-3 border-t border-white/10 pt-2">
            <summary className="cursor-pointer text-[10px] leading-relaxed text-slate-400">
              Guideline for {guide.band?.label ?? "this baby"} on day {dol}: feeds {guide.fields.enteralMlKgDay} · IV{" "}
              {guide.fields.ivMlKgDay} · D{guide.fields.dextrosePct}% · amino acids {guide.fields.aminoAcid} · lipid{" "}
              {guide.fields.lipid} · {guide.fields.feedFreq} · step up {guide.fields.feedIncrementMlKgDay} tomorrow
              {guide.fields.fortifierProductId ? ` · fortify ${guide.fields.fortificationAmount} sachet × ${guide.fields.fortificationDosesPerDay}` : ""}
              {" — why?"}
            </summary>
            <ul className="mt-2 space-y-1 pl-4 text-[10px] leading-relaxed text-slate-400">
              <li>Feeds: {guide.why.enteralMlKgDay}</li>
              <li>Fluids: {guide.why.tfiMlKgDay}</li>
              <li>IV: {guide.why.ivMlKgDay}</li>
              <li>Dextrose: {guide.why.dextrosePct}</li>
              <li>Amino acids: {guide.why.aminoAcid}</li>
              <li>Lipid: {guide.why.lipid}</li>
              <li>Interval: {guide.why.feedFreq}</li>
              {guide.notes.map((note, i) => (
                <li key={i} className="text-slate-300">
                  {note}
                </li>
              ))}
            </ul>
          </details>
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
              } ml — review for feed intolerance before the next increase.`}
            </p>
          )}

          <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/50 p-2">
            <div className="text-[11px] font-black text-slate-200">Feed plan {plan.active ? "— active" : "— off"}</div>
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
              <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/40 p-2 text-[10px] leading-relaxed text-slate-400">
                <b className="text-white">Today</b> enteral {plan.enteralMlKgDay}
                {plan.perFeedMl !== undefined && plan.feedsPerDay !== undefined
                  ? ` (${plan.perFeedMl} ml × ${plan.feedsPerDay})`
                  : ""}{" "}
                · <b className="text-white">next 24 h</b> {plan.tomorrowEnteralMlKgDay}
                {plan.mode === "increasing" && plan.increment !== undefined ? ` (+${plan.increment})` : ""} ·{" "}
                <span className={plan.reconciled ? "" : "font-bold text-amber-200"}>
                  total {plan.totalFluidsMlKgDay} / TFI {plan.tfi}
                </span>
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
                <b className="text-white">Adds</b> <b className="text-cyan-200">+{nutrition.fortKcalPerMl} kcal/ml</b> and{" "}
                <b className="text-emerald-200">+{nutrition.fortProteinPerMl} g protein/ml</b> across the day ·{" "}
                {nutrition.fortDosesPerDay} dose{nutrition.fortDosesPerDay === 1 ? "" : "s"}/day ·{" "}
                {(nutrition.fortFraction * 100).toFixed(0)}% of the enteral volume · effective density{" "}
                {nutrition.effectiveKcalPerMl} kcal/ml.
              </>
            ) : (
              "No fortifier recorded — the base milk density is used."
            )}
          </div>
        </details>

        {/* --- the unit's own figures -------------------------------------- */}
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">
            Protocol figures {usingProtocol ? "— using your figures" : "— published values"}
          </summary>
          <div className="mt-2.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-2.5 text-[11px] text-cyan-200">
            <div className="flex items-center gap-1.5 font-bold text-cyan-300">
              <span>📄 Unit Feeding Protocol Reference (Level IIIB NICU)</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-300">
              Guideline practicing in NICU: Enteral feeds advanced incrementally per birth weight band with trophic priming (10–20 ml/kg/day). Human milk fortification initiated at 100 ml/kg/day enteral tolerance. Custom figures saved below override baseline values for this baby or unit-wide.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip label="This baby only" on={protocolScope === "baby"} onClick={() => setProtocolScope("baby")} />
            <Chip
              label={`Whole unit — ${d.baby.unit.toUpperCase()}`}
              on={protocolScope === "unit"}
              onClick={() => setProtocolScope("unit")}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROTOCOL_FIELDS.map((field) => (
              <ProtocolRow
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={activeLayer?.[field.key]}
                published={field.published(publishedBand ?? weightBand(1500)!)}
                inherited={protocolScope === "baby" ? unitValueFor(unitProtocol?.[field.key], "unit") : undefined}
                hint={field.hint}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={protocolScope === "baby" ? setProtocolValue(field.key) : setUnitProtocolValue(field.key)}
              />
            ))}
            {TARGET_FIELDS.map((field) => (
              <ProtocolRow
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={activeLayer?.[field.key]}
                published={field.published(publishedTargets)}
                inherited={protocolScope === "baby" ? unitValueFor(unitProtocol?.[field.key], "unit") : undefined}
                hint={field.hint}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={protocolScope === "baby" ? setProtocolValue(field.key) : setUnitProtocolValue(field.key)}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {protocolScope === "baby" ? (
              <>
                {babyHasOverrides && (
                  <button type="button" className="btn-ghost" onClick={() => setField("protocol", undefined)}>
                    Clear this baby&apos;s figures
                  </button>
                )}
                <span className="text-[10px] text-slate-500">This baby only.</span>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary" onClick={saveUnitProtocol} disabled={unitSaving}>
                  {unitSaving ? "Saving…" : `Save for the whole ${d.baby.unit.toUpperCase()}`}
                </button>
                {unitHasOverrides && (
                  <button type="button" className="btn-ghost" onClick={() => setUnitDraft(undefined)}>
                    Clear the unit&apos;s figures
                  </button>
                )}
                <span className="text-[10px] text-slate-500">
                  {unitDirty
                    ? "unsaved — applies to every baby in this unit once saved"
                    : unitHasOverrides
                      ? `saved for every baby in ${d.baby.unit.toUpperCase()}`
                      : `no unit figures saved — every baby uses the published band`}
                </span>
              </>
            )}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            {usingProtocol
              ? `${Object.values(protocol ?? {}).filter((v) => v !== undefined).length} figure(s) in force.`
              : publishedBand
                ? `${publishedBand.label} · ${bandIntervalHours(publishedBand)}-hourly, full feeds ${publishedBand.fullFeeds} ml/kg/day.`
                : "Enter a weight to see the published band."}
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

      <details className="quiet px-1">
        <summary>Nutritional Composition Breakdown (SRH Laboratory Reference)</summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-900/40 p-2">
          <div className="mb-2 text-[11px] font-bold text-slate-200">
            Sri Ramakrishna Hospital Department of Laboratory: Nutritional Composition Comparison (per 100 ml)
          </div>
          <table className="w-full text-left text-[10px] text-slate-300">
            <thead>
              <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-400">
                <th className="py-1">Formula / Milk</th>
                <th>Energy</th>
                <th>Carb</th>
                <th>Protein</th>
                <th>Fat</th>
                <th>Ca / P</th>
                <th>Vit D</th>
                <th>Iron</th>
                <th>Na</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {FORMULA_COMPOSITION_TABLE.map((row) => (
                <tr key={row.name} className="hover:bg-white/5">
                  <td className="py-1 font-sans font-semibold text-slate-200">{row.name}</td>
                  <td>{row.kcalPer100ml} kcal</td>
                  <td>{row.carbG} g</td>
                  <td className="text-emerald-300">{row.proteinG} g</td>
                  <td>{row.fatG} g</td>
                  <td>{row.calciumMg} / {row.phosphorusMg}</td>
                  <td>{row.vitDIu} IU</td>
                  <td>{row.ironMg} mg</td>
                  <td>{row.sodiumMg} mg</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[9px] text-slate-500">
            Values transcribed from SRH Multi-Speciality Department of Laboratory reference. Calorie and protein densities automatically feed into the daily nutritional calculations above.
          </p>
        </div>
      </details>

      <details className="quiet px-1 mt-2">
        <summary>Sources &amp; Protocols</summary>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Sri Ramakrishna Hospital Laboratory Nutrition Catalog · NICU Unit Feeding Protocol · Patel et al. <i>Nutrients</i> 2015 · ESPGHAN / AAP enteral and parenteral targets · UC Davis and CHOP NICU
          protocols · WHO KMC guidance, in <code>src/lib/feed-guide.ts</code>
          {usingProtocol ? ", with this unit's protocol applied" : ""}. Decision support only — every figure is editable.
        </p>
      </details>
    </div>
  );
}
