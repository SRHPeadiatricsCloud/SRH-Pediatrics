"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Chip, NumField, Section, api } from "@/components/ui";
import { girFromDextrose } from "@/lib/interpret";
import {
  PROTOCOL_FIELDS,
  TARGET_FIELDS,
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
  feedsPerDay,
  fortifierById,
  FORTIFIER_CATALOG,
  FORTIFIER_KCAL_PER_UNIT,
  FORTIFIER_PROTEIN_G_PER_UNIT,
  FORMULA_COMPOSITION_TABLE,
  type Clinical,
} from "@/lib/clinical";
import { FEED_ROUTE, FEED_TYPE } from "@/lib/catalog";

type FluidsState = NonNullable<Clinical["fluids"]>;

/* ------------------------------------------------------------------ *
 * Small pieces shared by the tab.
 * ------------------------------------------------------------------ */

/** A gap reads better without a trailing ".0". */
function trimNum(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Legacy charts carried a Static/Increasing "feed plan" that derived today's
 * enteral volume from a TFI target. The redesigned tab edits the volumes
 * directly, so on open the plan's derived volume (the TFI minus what the IV is
 * actually running) is written into the Feeds box once, the plan itself is
 * dropped, and everything stays editable. The TFI number survives as a plain
 * target; the increment survives as tomorrow's default advance step.
 */
function withoutLegacyPlan(f: FluidsState, weightKg?: number): FluidsState {
  if (f.feedPlan === undefined) return f;
  const next: FluidsState = { ...f, feedPlan: undefined, increaseAppliesTo: undefined };
  if (f.tfiMlKgDay !== undefined && f.tfiMlKgDay > 0) {
    const iv = f.ivMlKgDay !== undefined ? Math.max(0, Math.min(250, f.ivMlKgDay)) : 0;
    next.enteralMlKgDay = round2(Math.max(0, Math.min(250, f.tfiMlKgDay - iv)));
  }
  const fpd = feedsPerDay(f.feedFreq);
  if (fpd && weightKg && weightKg > 0 && next.enteralMlKgDay !== undefined) {
    next.feedVol = round2((next.enteralMlKgDay * weightKg) / fpd);
    next.feedVolManual = false;
  }
  return next;
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

/** The bolus intervals the unit actually pumps, in hours. */
const FEED_INTERVALS = [1, 1.5, 2, 2.5, 3, 4] as const;

/**
 * One numbered step of the novice path. A module-level component — defining it
 * inside the render would re-create it (and its inputs) on every keystroke.
 */
function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-400/20 text-xs font-black text-cyan-100">{n}</span>
        <div>
          <div className="text-xs font-black text-white">{title}</div>
          {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** One of the three target pills under the one-line sentence. */
function TargetPill({
  label,
  value,
  unit,
  target,
  decimals = 1,
}: {
  label: string;
  value: number;
  unit: string;
  target: [number, number];
  decimals?: number;
}) {
  const [lo, hi] = target;
  const status = value >= lo && value <= hi ? "ok" : value < lo ? "low" : "high";
  const tone =
    status === "ok"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
      : status === "low"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
        : "border-rose-400/40 bg-rose-400/10 text-rose-100";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}>
      {label} {trimNum(value, decimals)} {unit} · {status === "ok" ? "OK" : status} (aim {lo}&ndash;{hi})
    </span>
  );
}

/**
 * Feeds (green) + IV (blue) stacked against a white TFI marker; anything past
 * the marker is the overflow, in red. The legend and the verdict sit below.
 */
function FluidSplitBar({ feeds, iv, tfi }: { feeds: number; iv: number; tfi?: number }) {
  const total = feeds + iv;
  const max = Math.max(tfi ?? 0, total, 1) * 1.08;
  const feedsPct = (feeds / max) * 100;
  const ivPct = (iv / max) * 100;
  const tfiPct = tfi !== undefined && tfi > 0 ? (tfi / max) * 100 : undefined;
  const overflowPct = tfiPct !== undefined && tfi !== undefined && total > tfi ? ((total - tfi) / max) * 100 : 0;
  const ivSolidPct = Math.max(0, ivPct - overflowPct);
  const verdict =
    tfi === undefined || !(tfi > 0)
      ? { text: "no TFI target set yet", tone: "text-slate-400" }
      : Math.abs(total - tfi) < 0.5
        ? { text: "on the TFI target", tone: "text-emerald-200" }
        : total < tfi
          ? { text: `${trimNum(tfi - total, 1)} short of the TFI target`, tone: "text-amber-200" }
          : { text: `${trimNum(total - tfi, 1)} OVER the TFI target`, tone: "text-rose-200" };
  return (
    <div>
      <div className="relative h-5 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-0 bg-emerald-400/80" style={{ width: `${feedsPct}%` }} />
        <div className="absolute inset-y-0 bg-sky-400/80" style={{ left: `${feedsPct}%`, width: `${ivSolidPct}%` }} />
        {overflowPct > 0 && (
          <div className="absolute inset-y-0 bg-rose-500/80" style={{ left: `${feedsPct + ivSolidPct}%`, width: `${overflowPct}%` }} />
        )}
        {tfiPct !== undefined && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${tfiPct}%` }} />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-slate-400">
        <span>
          <span className="text-emerald-300">■</span> feeds {trimNum(feeds, 1)}
        </span>
        <span>
          <span className="text-sky-300">■</span> IV {trimNum(iv, 1)}
        </span>
        <span>total {trimNum(total, 1)}</span>
        {tfi !== undefined && tfi > 0 && <span className="font-bold text-white">| TFI {tfi}</span>}
      </div>
      <div className={`mt-0.5 text-[11px] font-bold ${verdict.tone}`}>{verdict.text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The tab.
 * ------------------------------------------------------------------ */

export function FluidsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const raw: FluidsState = d.baby.clinical?.fluids ?? {};
  const wt = d.baby.currentWeight / 1000;
  // Legacy charts are migrated once, on open: the plan's derived volume goes
  // into the Feeds box, the plan is dropped, and every box is editable.
  const f = withoutLegacyPlan(raw, wt);
  const [s, setS] = useState({ ...f });
  const [manualDerived, setManualDerived] = useState({
    gir: f.girManual === true,
    kcal: f.kcalManual === true,
    feedVol: f.feedVolManual === true,
  });
  const [saving, setSaving] = useState(false);
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

  /* --------------------------- the raw split ---------------------------- */

  const intervalHours = (() => {
    const match = s.feedFreq?.trim().match(/^(\d+(?:\.5)?) hourly$/i);
    return match ? Number(match[1]) : undefined;
  })();
  const feedsToday = intervalHours && intervalHours < 24 ? 24 / intervalHours : undefined;

  // The total is what the two boxes say right now. A legacy chart that only
  // ever recorded a total keeps showing that total until the split is entered.
  const hasVolumes = s.enteralMlKgDay !== undefined || s.ivMlKgDay !== undefined;
  const liveTotal = hasVolumes ? round1((s.enteralMlKgDay ?? 0) + (s.ivMlKgDay ?? 0)) : (s.totalMlKgDay ?? 0);
  const totalMlDay = wt > 0 ? Math.round(liveTotal * wt) : undefined;

  const autoGir =
    s.dextrosePct !== undefined && (s.ivMlKgDay ?? 0) > 0
      ? girFromDextrose(s.dextrosePct, Math.min(250, s.ivMlKgDay ?? 0))
      : s.gir;
  const girValue = manualDerived.gir ? s.gir : autoGir;

  // Per feed ↔ ml/kg/day stay in sync through the interval and the weight.
  const autoFeedVolume =
    feedsToday && wt > 0 && s.enteralMlKgDay !== undefined
      ? round2((Math.min(250, s.enteralMlKgDay) * wt) / feedsToday)
      : undefined;
  const feedVolumeValue = manualDerived.feedVol ? s.feedVol : autoFeedVolume;
  const manualEnteralFromVolume =
    manualDerived.feedVol && feedVolumeValue !== undefined && feedsToday && wt > 0
      ? round2((feedVolumeValue * feedsToday) / wt)
      : undefined;
  const enteralForNutrition = manualEnteralFromVolume ?? s.enteralMlKgDay;

  // The pump rate and the ml/kg/day are two faces of the same prescription.
  const pumpRate = s.ivMlKgDay !== undefined && wt > 0 ? round1((s.ivMlKgDay * wt) / 24) : undefined;

  const fortProduct = fortifierById(s.fortifierProductId);
  // This baby's figures beat the unit's, which beat the published guidance.
  const protocol = mergeProtocols(s.protocol, unitProtocol);
  const nutrition = calcNutrition(
    {
      fluids: {
        ...s,
        protocol,
        totalMlKgDay: liveTotal,
        gir: girValue,
        girManual: manualDerived.gir,
        ...(enteralForNutrition !== undefined ? { enteralMlKgDay: enteralForNutrition } : {}),
      },
    },
    d.baby.currentWeight,
    { dol },
  );

  // The guideline-based prescription for today, from this baby's size, day of
  // life, the unit's protocol and what they are already on. Nothing is written
  // until the clinician taps "Use the guideline".
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
  const setField = (key: string, value: unknown) => setS((p) => ({ ...p, [key]: value }));

  /** Typing the ml/kg/day figure: the per-feed box re-derives from it. */
  const setFeeds = (v: number) => setS((p) => ({ ...p, enteralMlKgDay: v, feedVolManual: false }));

  /** Typing a per-feed volume: ml per feed converts back to ml/kg/day. */
  const setPerFeed = (v: number) => {
    setManualDerived((current) => ({ ...current, feedVol: true }));
    setS((p) => ({
      ...p,
      feedVol: v,
      ...(feedsToday && wt > 0 ? { enteralMlKgDay: round2((v * feedsToday) / wt) } : {}),
    }));
  };

  /** Changing the interval re-derives the ml/kg/day when a manual per-feed volume is in force. */
  const setFreq = (v: string) =>
    setS((p) => {
      const fpd = feedsPerDay(v);
      if (p.feedVolManual && p.feedVol !== undefined && fpd && wt > 0) {
        return { ...p, feedFreq: v, enteralMlKgDay: round2((p.feedVol * fpd) / wt) };
      }
      return { ...p, feedFreq: v };
    });

  /** Pump rate ↔ IV ml/kg/day, bidirectional through the weight. */
  const setPumpRate = (v: number) =>
    setS((p) => (wt > 0 ? { ...p, ivMlKgDay: round2((v * 24) / wt) } : p));

  /**
   * Copy the whole suggestion in. The volumes are written directly and the TFI
   * target is the guideline's fluid target — never a feed plan, so nothing can
   * take the typed volumes back over.
   */
  const useGuideline = () =>
    setS((p) => ({
      ...p,
      enteralMlKgDay: guide.fields.enteralMlKgDay,
      ivMlKgDay: guide.fields.ivMlKgDay,
      dextrosePct: guide.fields.dextrosePct,
      aminoAcid: guide.fields.aminoAcid,
      lipid: guide.fields.lipid,
      feedFreq: guide.fields.feedFreq,
      feedIncrementMlKgDay: guide.fields.feedIncrementMlKgDay,
      feedType: p.feedType && !/NPO|nil per oral/i.test(p.feedType) ? p.feedType : "Expressed breast milk (EBM)",
      tfiMlKgDay: guide.fluidTarget,
      feedPlan: undefined,
      increaseAppliesTo: undefined,
      feedVolManual: false,
      ...(guide.fields.fortifierProductId
        ? {
            fortifierProductId: guide.fields.fortifierProductId,
            fortificationAmount: guide.fields.fortificationAmount,
            fortificationDosesPerDay: guide.fields.fortificationDosesPerDay,
          }
        : {}),
    }));

  /* --------------------------- advance the feeds ------------------------- */

  const stepUnit: "mlkg" | "mlfeed" = s.feedAdvanceStepUnit === "mlfeed" ? "mlfeed" : "mlkg";
  const stepMlKgDay = s.feedIncrementMlKgDay ?? guide.band?.increment ?? 20;
  const currentEnteral = s.enteralMlKgDay ?? 0;
  const currentIv = s.ivMlKgDay ?? 0;
  const fullFeedsCap = guide.band?.fullFeeds ?? 150;
  const nextEnteral = Math.min(250, currentEnteral + stepMlKgDay);
  const nextIv = Math.max(0, currentIv - stepMlKgDay);
  const perFeedOf = (mlkgday: number) => (feedsToday && wt > 0 ? round2((mlkgday * wt) / feedsToday) : undefined);
  const mlHOf = (mlkgday: number) => (wt > 0 ? round1((mlkgday * wt) / 24) : undefined);

  /** The step in whatever unit the advance field is shown in. */
  const setFeedStepMlFeed = (v: number) =>
    setS((p) => ({
      ...p,
      feedIncrementMlKgDay: feedsToday && wt > 0 ? round2((v * feedsToday) / wt) : v,
      feedAdvanceStepUnit: "mlfeed",
    }));

  const hasToleranceIssue = (s.feedsHeldToday ?? 0) > 0 || (s.residualMl ?? 0) > 2;

  /** One tap: feeds step up, the IV weans by the same amount. */
  const advanceFeeds = () => {
    setS((p) => ({
      ...p,
      enteralMlKgDay: Math.min(250, (p.enteralMlKgDay ?? 0) + stepMlKgDay),
      ivMlKgDay: Math.max(0, (p.ivMlKgDay ?? 0) - stepMlKgDay),
      feedVolManual: false,
      feedIncrementMlKgDay: stepMlKgDay,
      // If passing the fortification threshold (100 ml/kg/day), prime the
      // guideline fortifier once, if not already set.
      ...(nextEnteral >= 100 && !p.fortifierProductId && guide.fields.fortifierProductId
        ? {
            fortifierProductId: guide.fields.fortifierProductId,
            fortificationAmount: guide.fields.fortificationAmount ?? 1,
            fortificationDosesPerDay: guide.fields.fortificationDosesPerDay ?? 8,
          }
        : {}),
    }));
  };

  const setProtocolValue = (key: keyof ProtocolOverrides) => (v: number | undefined) =>
    setS((p) => {
      const next = { ...(p.protocol ?? {}) };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return { ...p, protocol: Object.keys(next).length ? next : undefined };
    });

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
            totalMlKgDay: nutrition.totalFluids,
            gir: girValue,
            kcal: kcalValue,
            feedVol: feedVolumeValue,
            girManual: manualDerived.gir,
            kcalManual: manualDerived.kcal,
            feedVolManual: manualDerived.feedVol,
            // The redesigned tab edits volumes directly; a save from here must
            // never leave a feed plan behind, on legacy or new charts alike.
            feedPlan: undefined,
            increaseAppliesTo: undefined,
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const hasEnergyInputs =
    enteralForNutrition !== undefined || s.feedType !== undefined || girValue !== undefined || s.aminoAcid !== undefined || s.lipid !== undefined;
  const autoKcal = hasEnergyInputs || s.kcal === undefined ? (hasEnergyInputs ? nutrition.totalKcal : undefined) : s.kcal;
  const kcalValue = manualDerived.kcal ? s.kcal : autoKcal;

  /* --------------------------- derived labels ---------------------------- */

  const MILK_SHORT: Record<string, string> = {
    "Expressed breast milk (EBM)": "EBM",
    "Direct breastfeeding": "breast milk",
    "Donor human milk": "donor milk",
    "Trophic feeds": "trophic feeds",
  };
  const milkName = s.feedType ? (MILK_SHORT[s.feedType] ?? s.feedType) : undefined;
  const tfi = s.tfiMlKgDay;
  const hasFeeds = (s.enteralMlKgDay ?? 0) > 0;
  const hasIv = (s.ivMlKgDay ?? 0) > 0;
  const tfiVerdict =
    tfi === undefined || !(tfi > 0)
      ? "no TFI target set yet"
      : Math.abs(liveTotal - tfi) < 0.5
        ? "exactly the TFI target"
        : liveTotal < tfi
          ? `${trimNum(round1(tfi - liveTotal), 1)} short of the TFI target`
          : `${trimNum(round1(liveTotal - tfi), 1)} OVER the TFI target`;
  // The day's whole prescription, in one plain sentence a first-week resident
  // can read aloud at the handover.
  const oneLine = (() => {
    const ivPhrase = hasIv
      ? `IV ${wt > 0 ? trimNum(round1(((s.ivMlKgDay ?? 0) * wt) / 24), 1) : "?"} ml/h${s.dextrosePct !== undefined ? ` of D${s.dextrosePct}%` : ""} (${trimNum(s.ivMlKgDay ?? 0, 1)} ml/kg/day)`
      : "no IV fluids";
    if (/NPO|nil per oral/i.test(s.feedType ?? "")) {
      return `Nil by mouth, ${ivPhrase} = ${trimNum(liveTotal, 1)} ml/kg/day — ${tfiVerdict}.`;
    }
    if (!hasFeeds && !hasIv) {
      if (liveTotal > 0) {
        return `Total on file ${trimNum(liveTotal, 1)} ml/kg/day, but no feeds or IV split yet — ${tfiVerdict}.`;
      }
      return `No feeds or IV recorded yet — ${tfiVerdict}.`;
    }
    const feedsPhrase = hasFeeds
      ? feedVolumeValue !== undefined && intervalHours
        ? `${trimNum(feedVolumeValue, 1)} ml every ${intervalHours} h of ${milkName ?? "milk"} by ${s.feedRoute ?? "the usual route"} (${trimNum(s.enteralMlKgDay ?? 0, 1)} ml/kg/day)`
        : `${trimNum(s.enteralMlKgDay ?? 0, 1)} ml/kg/day of ${milkName ?? "milk"}${s.feedRoute ? ` by ${s.feedRoute}` : ""}`
      : "no enteral feeds yet";
    return `${feedsPhrase} + ${ivPhrase} = ${trimNum(liveTotal, 1)} ml/kg/day — ${tfiVerdict}.`;
  })();

  const girLine = (() => {
    const iv = s.ivMlKgDay ?? 0;
    if (!(iv > 0)) return "No IV running — nothing to calculate.";
    if (s.dextrosePct === undefined) return "No dextrose % yet — the sugar delivery (GIR) can't be calculated.";
    const gir = girValue ?? 0;
    if (!(gir > 0)) return "Sugar delivery (GIR) 0 mg/kg/min — this IV carries no sugar.";
    if (gir < 4) return `Sugar delivery (GIR) ${gir} mg/kg/min — LOW, below the usual 4–8: hypoglycaemia risk.`;
    if (gir <= 8) return `Sugar delivery (GIR) ${gir} mg/kg/min — usual range 4–8.`;
    if (gir <= 12) return `Sugar delivery (GIR) ${gir} mg/kg/min — above the usual 4–8: monitor glucose, consider a central line above 10.`;
    return `Sugar delivery (GIR) ${gir} mg/kg/min — very high, above 12: needs a central line.`;
  })();
  const girTone =
    girLine.includes("LOW") || girLine.includes("very high")
      ? "text-rose-200"
      : girLine.includes("above the usual")
        ? "text-amber-200"
        : "text-slate-400";

  const guidance =
    tfi !== undefined && tfi > 0
      ? liveTotal < tfi - 0.5
        ? `To reach ${tfi}: add ${trimNum(round1(tfi - liveTotal), 1)} ml/kg/day to the IV (≈ +${
            wt > 0 ? trimNum(round1(((tfi - liveTotal) * wt) / 24), 1) : "?"
          } ml/h) or to the feeds`
        : liveTotal > tfi + 0.5
          ? `Over target by ${trimNum(round1(liveTotal - tfi), 1)} — bring the IV down by ≈ ${
              wt > 0 ? trimNum(round1(((liveTotal - tfi) * wt) / 24), 1) : "?"
            } ml/h`
          : undefined
      : undefined;
  const guidanceTone = liveTotal < (tfi ?? 0) ? "text-cyan-200" : "text-rose-200";

  const feedsPreview =
    perFeedOf(currentEnteral) !== undefined
      ? `${trimNum(perFeedOf(currentEnteral) as number, 1)} → ${trimNum(perFeedOf(nextEnteral) as number, 1)} ml/feed (${currentEnteral} → ${nextEnteral} ml/kg/day)`
      : `${currentEnteral} → ${nextEnteral} ml/kg/day`;
  const ivPreview =
    currentIv <= 0
      ? "IV off"
      : nextIv <= 0
        ? `${mlHOf(currentIv) ?? 0} → off (nothing left to wean)`
        : `${mlHOf(currentIv) ?? 0} → ${mlHOf(nextIv) ?? 0} ml/h (${currentIv} → ${nextIv} ml/kg/day)`;

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
    s.lipid === undefined;

  // The protocol editor edits one layer at a time; the other layers still show
  // through as the fallback a cleared box falls back to.
  const activeLayer = protocolScope === "baby" ? s.protocol : unitDraft;
  const babyHasOverrides = protocolInUse(s.protocol);
  const unitHasOverrides = protocolInUse(unitDraft);
  const unitDirty = JSON.stringify(unitDraft ?? {}) !== JSON.stringify(unitProtocol ?? {});

  // The published figures, for the protocol editor's placeholders.
  const publishedBand = weightBand(d.baby.currentWeight);
  const publishedTargets = targetsFor({ weightG: d.baby.currentWeight, dol });
  const usingProtocol = protocolInUse(protocol);

  const pristine = JSON.stringify(f);
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
        title="Fluids & feeds"
        sub={`Day ${dol} · ${d.baby.currentWeight ? `${d.baby.currentWeight} g · ` : ""}${guide.band?.label ?? "no weight"}`}
        right={saveButtons}
      >
        {/* --- today in one line ------------------------------------------ */}
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">Today in one line</div>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-white">{oneLine}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TargetPill label="Fluids" value={liveTotal} unit="ml/kg/d" target={nutrition.fluidsTarget} />
            <TargetPill label="Energy" value={kcalValue ?? 0} unit="kcal/kg/d" target={nutrition.kcalTarget} />
            <TargetPill label="Protein" value={nutrition.totalProtein} unit="g/kg/d" target={nutrition.proteinTarget} decimals={2} />
            {clockLabel !== undefined && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  feedOverdue ? "border-rose-400/40 bg-rose-400/10 text-rose-100" : "border-white/15 bg-white/5 text-slate-200"
                }`}
              >
                {clockLabel}
                {feedOverdue ? " — feed is late" : ""}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={useGuideline}>
              Use the guideline
            </button>
            <span className="text-[10px] text-slate-400">{guide.headline}</span>
          </div>
        </div>

        {/* Line removal safety reminder when feeds reach >= 120 ml/kg/day */}
        {(s.enteralMlKgDay ?? 0) >= 120 && (d.baby.clinical?.lines ?? []).length > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            <span className="font-semibold">
              ⚠️ Feeds ≥ 120 ml/kg/day: Review vascular lines ({(d.baby.clinical?.lines ?? []).map((l) => l.name).join(", ")}) for timely removal to prevent CLABSI.
            </span>
          </div>
        )}
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
              Nothing recorded yet. <b>Use the guideline</b> to fill every box for a {d.baby.currentWeight} g baby on
              day {dol}, then change anything your unit does differently and save.
            </span>
          </p>
        )}

        {/* --- the four steps ---------------------------------------------- */}
        <div className="mt-3 grid gap-3">
          {/* ① Feeds */}
          <Step n={1} title="Feeds" sub="what goes in, and how often">
            <div className="grid gap-2 sm:grid-cols-3">
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
              <label className="block rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <span className="lbl mb-1 block">How often</span>
                <select className="inp min-h-11 w-full" value={s.feedFreq ?? ""} onChange={(event) => setFreq(event.target.value)}>
                  <option value="">not set</option>
                  {FEED_INTERVALS.map((h) => (
                    <option key={h} value={`${h} hourly`}>
                      {h} hourly
                    </option>
                  ))}
                  {s.feedFreq && !FEED_INTERVALS.some((h) => `${h} hourly` === s.feedFreq) && (
                    <option value={s.feedFreq}>{s.feedFreq}</option>
                  )}
                </select>
              </label>
              <NumField
                label="Feeds ml/kg/day"
                value={s.enteralMlKgDay}
                onChange={setFeeds}
                min={0}
                max={250}
                step={5}
                placeholder="enter"
              />
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              {feedsToday && feedVolumeValue !== undefined && wt > 0 && hasFeeds
                ? `${trimNum(feedVolumeValue, 1)} ml × ${feedsToday} feeds ≈ ${Math.round(Math.min(250, s.enteralMlKgDay ?? 0) * wt)} ml a day`
                : "set an interval to split the day into feeds"}
              {s.feedType ? ` · ${s.feedType}` : ""}
              {s.feedRoute ? ` via ${s.feedRoute}` : ""}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <span className="lbl mb-1 block">What milk</span>
                <select className="inp min-h-11 w-full" value={s.feedType ?? ""} onChange={(event) => setField("feedType", event.target.value)}>
                  <option value="">not set</option>
                  {FEED_TYPE.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {s.feedType && !FEED_TYPE.includes(s.feedType) && <option value={s.feedType}>{s.feedType}</option>}
                </select>
              </label>
              <label className="block rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <span className="lbl mb-1 block">How given</span>
                <select className="inp min-h-11 w-full" value={s.feedRoute ?? ""} onChange={(event) => setField("feedRoute", event.target.value)}>
                  <option value="">not set</option>
                  {FEED_ROUTE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {s.feedRoute && !FEED_ROUTE.includes(s.feedRoute) && <option value={s.feedRoute}>{s.feedRoute}</option>}
                </select>
              </label>
            </div>
          </Step>

          {/* ② IV fluids */}
          <Step n={2} title="IV fluids" sub="the pump, and the sugar in it">
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="Pump rate ml/hour"
                value={pumpRate}
                onChange={setPumpRate}
                min={0}
                max={40}
                step={0.5}
                decimals={1}
                placeholder="—"
              />
              <NumField
                label="IV ml/kg/day"
                value={s.ivMlKgDay}
                onChange={setNum("ivMlKgDay")}
                min={0}
                max={250}
                step={5}
                placeholder="enter"
              />
              <NumField
                label="Dextrose %"
                value={s.dextrosePct}
                onChange={setNum("dextrosePct")}
                min={0}
                max={25}
                step={0.5}
                decimals={1}
                placeholder="—"
              />
            </div>
            <p className={`mt-1 text-[10px] leading-relaxed ${girTone}`}>{girLine}</p>
          </Step>

          {/* ③ Check the total */}
          <Step n={3} title="Check the total" sub="feeds + IV against the TFI target">
            <div className="text-lg font-black text-white">
              Total today {trimNum(liveTotal, 1)} ml/kg/day
              {totalMlDay !== undefined ? ` ≈ ${totalMlDay} ml` : ""}
            </div>
            <div className="mt-2">
              <FluidSplitBar feeds={s.enteralMlKgDay ?? 0} iv={s.ivMlKgDay ?? 0} tfi={s.tfiMlKgDay} />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-52">
                <NumField
                  label="TFI target ml/kg/day"
                  value={s.tfiMlKgDay}
                  onChange={setNum("tfiMlKgDay")}
                  min={0}
                  max={250}
                  step={5}
                  placeholder="e.g. 150"
                />
              </div>
              <button
                type="button"
                className="mb-2 text-[10px] font-bold text-cyan-200 underline"
                onClick={() => setField("tfiMlKgDay", guide.fluidTarget)}
              >
                use the guideline&apos;s {guide.fluidTarget}
              </button>
            </div>
            {guidance && (
              <p className={`mt-2 text-[11px] font-semibold ${guidanceTone}`}>{guidance}</p>
            )}
          </Step>

          {/* ④ Tomorrow: advance the feeds */}
          <Step n={4} title="Tomorrow: advance the feeds" sub="step the feeds up and wean the IV">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip label="ml/kg/day" on={stepUnit !== "mlfeed"} onClick={() => setField("feedAdvanceStepUnit", "mlkg")} />
              <Chip label="ml/feed" on={stepUnit === "mlfeed"} onClick={() => setField("feedAdvanceStepUnit", "mlfeed")} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <NumField
                label={stepUnit === "mlfeed" ? "Advance by ml/feed" : "Advance by ml/kg/day"}
                value={stepUnit === "mlfeed" ? (perFeedOf(stepMlKgDay) ?? undefined) : stepMlKgDay}
                onChange={stepUnit === "mlfeed" ? setFeedStepMlFeed : setNum("feedIncrementMlKgDay")}
                min={0}
                max={stepUnit === "mlfeed" ? 60 : 60}
                step={stepUnit === "mlfeed" ? 0.5 : 5}
                decimals={stepUnit === "mlfeed" ? 1 : 0}
                placeholder={stepUnit === "mlfeed" && !(feedsToday && wt > 0) ? "set an interval first" : String(guide.band?.increment ?? 20)}
              />
              {stepUnit === "mlfeed" && feedsToday && wt > 0 && (
                <div className="flex items-end pb-3 text-[10px] leading-tight text-slate-400">
                  {trimNum(stepMlKgDay, 2)} ml/kg/day at this weight and interval
                </div>
              )}
            </div>
            <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                <div className="lbl mb-1">Feeds {feedsToday ? "(ml/feed)" : "(ml/kg/day)"}</div>
                <div className="font-bold tabular-nums text-white">{feedsPreview}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                <div className="lbl mb-1">IV (ml/h)</div>
                <div className="font-bold tabular-nums text-white">{ivPreview}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                <div className="lbl mb-1">Total</div>
                <div className="font-bold tabular-nums text-white">
                  {round1(currentEnteral + currentIv)} → {round1(nextEnteral + nextIv)} ml/kg/day
                  {s.tfiMlKgDay ? ` (TFI ${s.tfiMlKgDay})` : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={advanceFeeds}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition ${
                hasToleranceIssue
                  ? "border border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                  : "border border-emerald-400/40 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
              }`}
              title={hasToleranceIssue ? "Feeds held or residual high — review tolerance before advancing" : `Advance feeds by +${stepMlKgDay} ml/kg/day and wean IV`}
            >
              {hasToleranceIssue ? "⚠️ Check tolerance & advance" : `+ Advance feeds (+${trimNum(stepMlKgDay, 2)} ml/kg/d)`}
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <NumField
                label="Last residual ml"
                value={s.residualMl}
                onChange={setNum("residualMl")}
                min={0}
                max={100}
                step={0.5}
                decimals={1}
                placeholder="not checked"
              />
              <NumField
                label="Feeds held today"
                value={s.feedsHeldToday}
                onChange={setNum("feedsHeldToday")}
                min={0}
                max={24}
                step={1}
                decimals={0}
                placeholder="0"
              />
              <label className="block rounded-xl border border-white/10 bg-slate-900/50 p-2">
                <span className="lbl mb-1 block">Last feed given</span>
                <input
                  type="datetime-local"
                  className="inp min-h-11"
                  value={localDateTimeValue(s.lastFeedAt)}
                  onChange={(event) => setS((p) => ({ ...p, lastFeedAt: event.target.value ? new Date(event.target.value).toISOString() : undefined }))}
                />
              </label>
            </div>
            {hasToleranceIssue && (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-200">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>
                  {(s.feedsHeldToday ?? 0)} feed{(s.feedsHeldToday ?? 0) === 1 ? "" : "s"} held and a residual of {s.residualMl ?? 0} ml —
                  review for feed intolerance before the next increase.
                </span>
              </p>
            )}
            {currentEnteral >= fullFeedsCap && (
              <p className="mt-1 text-[10px] text-emerald-200/90">
                Already at full feeds for {guide.band?.label ?? "this weight"} ({fullFeedsCap} ml/kg/day) — no further advance.
              </p>
            )}
            {s.tfiMlKgDay !== undefined && nextEnteral + nextIv > s.tfiMlKgDay + 0.01 && (
              <p className="mt-1 text-[10px] text-amber-200/90">
                The next total ({trimNum(nextEnteral + nextIv, 1)} ml/kg/day) would be over the TFI target ({s.tfiMlKgDay}).
              </p>
            )}
            {currentEnteral + stepMlKgDay > 250 && (
              <p className="mt-1 text-[10px] text-amber-200/90">
                Capped at the 250 ml/kg/day maximum — this advance steps only {trimNum(250 - currentEnteral, 1)} ml/kg/day.
              </p>
            )}
          </Step>
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

        {/* --- everything that is not needed on day one -------------------- */}
        <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-200">
            Advanced — TPN, fortifier, protocol figures &amp; why the guideline says what it says
          </summary>

          {/* Parenteral nutrition */}
          <div className="mt-3">
            <div className="lbl !mb-1.5">Parenteral nutrition</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumField
                label="Amino acids g/kg/day"
                value={s.aminoAcid}
                onChange={setNum("aminoAcid")}
                min={0}
                max={6}
                step={0.1}
                decimals={1}
                placeholder="—"
              />
              <NumField
                label="Lipid g/kg/day"
                value={s.lipid}
                onChange={setNum("lipid")}
                min={0}
                max={6}
                step={0.1}
                decimals={1}
                placeholder="—"
              />
              <div>
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
                {manualDerived.gir && (
                  <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("gir")}>
                    recalculate from dextrose %
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Against the targets */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="lbl !mb-1.5">Against the targets</div>
            <div className="grid gap-3 lg:grid-cols-3">
              <TargetRow label="Fluids" value={liveTotal} target={nutrition.fluidsTarget} unit="ml/kg/d" />
              <TargetRow label="Energy" value={kcalValue ?? 0} target={nutrition.kcalTarget} unit="kcal/kg/d" />
              <TargetRow label="Protein" value={nutrition.totalProtein} target={nutrition.proteinTarget} unit="g/kg/d" decimals={2} />
            </div>
            <div className="mt-1 text-[10px] text-slate-500">{nutrition.targetsBasis}</div>
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
            <details className="quiet mt-2">
              <summary className="cursor-pointer text-[10px] leading-relaxed text-slate-400">
                Guideline for {guide.band?.label ?? "this baby"} on day {dol}: feeds {guide.fields.enteralMlKgDay} · IV {guide.fields.ivMlKgDay} · TFI{" "}
                {guide.fluidTarget} · D{guide.fields.dextrosePct}% · amino acids {guide.fields.aminoAcid} · lipid {guide.fields.lipid} · {guide.fields.feedFreq} · step up{" "}
                {guide.fields.feedIncrementMlKgDay} tomorrow
                {guide.fields.fortifierProductId
                  ? ` · fortify ${guide.fields.fortificationAmount} ${s.fortificationAmountUnit ?? "sachet"} × ${guide.fields.fortificationDosesPerDay}`
                  : ""}
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

          {/* Fortification */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="lbl !mb-1.5">
              Fortification {nutrition.fortified ? `— ${s.fortificationAmount} ${s.fortificationAmountUnit ?? "sachet"} × ${nutrition.fortDosesPerDay}/day` : "— none recorded"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    // Auto-reset manual energy override so total calories automatically calculate from the new fortifier
                    setManualDerived((current) => ({ ...current, kcal: false }));
                    setS((p) => ({
                      ...p,
                      fortifierProductId: id || undefined,
                      fortificationName: product ? product.name : p.fortificationName,
                      fortificationAmount: p.fortificationAmount ?? (product ? product.steps[product.steps.length - 1] : 1),
                      fortificationAmountUnit: product ? product.unit : p.fortificationAmountUnit,
                      fortificationFeedVolumeMl: product ? product.mixedWithMl : p.fortificationFeedVolumeMl,
                      fortifierKcalPerUnit: product ? product.kcalPerUnit : undefined,
                      fortifierProteinPerUnit: product ? product.proteinPerUnit : undefined,
                      kcal: undefined, // Clear any stored manual calorie value so calculated energy takes over immediately
                      kcalManual: false,
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

              <NumField label="Amount per dose" value={s.fortificationAmount} onChange={setNum("fortificationAmount")} min={0} max={100} step={0.05} decimals={2} placeholder="enter" />
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
              <NumField label="Feed volume mixed (ml)" value={s.fortificationFeedVolumeMl} onChange={setNum("fortificationFeedVolumeMl")} min={0} max={1000} step={1} decimals={1} placeholder="required for energy" />
              <NumField
                label={`Times per day — ${nutrition.fortFeedsPerDay ? `${nutrition.fortFeedsPerDay} feeds total` : "feed frequency unknown"}`}
                value={s.fortificationDosesPerDay}
                onChange={setNum("fortificationDosesPerDay")}
                min={0}
                max={48}
                step={1}
                decimals={0}
                placeholder={nutrition.fortFeedsPerDay ? String(nutrition.fortFeedsPerDay) : "every feed"}
              />
              <NumField
                label={`kcal per unit — ${s.fortifierKcalPerUnit === undefined ? `label ${fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT}` : "custom"}`}
                value={s.fortifierKcalPerUnit}
                onChange={setNum("fortifierKcalPerUnit")}
                min={0}
                max={50}
                step={0.05}
                decimals={3}
                placeholder={String(fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT)}
              />
              <NumField
                label={`Protein g per unit — ${s.fortifierProteinPerUnit === undefined ? `label ${fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT}` : "custom"}`}
                value={s.fortifierProteinPerUnit}
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
          </div>

          {/* The unit's own figures */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="lbl !mb-1.5">Protocol figures {usingProtocol ? "— using your figures" : "— published values"}</div>
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-2.5 text-[11px] text-cyan-200">
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
                        : "no unit figures saved — every baby uses the published band"}
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
          </div>

          {/* Feeding note */}
          <label className="mt-3 block border-t border-white/10 pt-3">
            <span className="lbl mb-1 block">Feeding note</span>
            <input className="inp min-h-11" value={s.feedNotes ?? ""} onChange={(event) => setField("feedNotes", event.target.value)} placeholder="vomits, abdomen, tolerance…" />
          </label>
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
        <summary>Formulation reference</summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-900/40 p-2">
          <div className="mb-2 text-[11px] font-bold text-slate-200">
            Formulation reference: Nutritional composition comparison (per 100 ml)
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
            Values transcribed from formulation reference. Calorie and protein densities automatically feed into the daily nutritional calculations above.
          </p>
        </div>
      </details>

      <details className="quiet px-1 mt-2">
        <summary>Sources &amp; Protocols</summary>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Formulation reference · NICU Unit Feeding Protocol · Patel et al. <i>Nutrients</i> 2015 · ESPGHAN / AAP enteral and parenteral targets · UC Davis and CHOP NICU
          protocols · WHO KMC guidance, in <code>src/lib/feed-guide.ts</code>
          {usingProtocol ? ", with this unit's protocol applied" : ""}. Decision support only — every figure is editable.
        </p>
      </details>
    </div>
  );
}
