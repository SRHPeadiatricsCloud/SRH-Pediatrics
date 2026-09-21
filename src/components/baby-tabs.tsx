"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Circle, Clock, Info, User, X } from "lucide-react";
import { WeightInput } from "@/components/weight-input";
import { Chip, ChipGroup, DialWithOther, NumField, Section, Stepper, api, useTempUnit } from "@/components/ui";
import { FlagsList, GrowthFlagsRow, LabsInterpretation, RespInterpretation, VitalsInterpretation } from "@/components/interpret-ui";
import { girFromDextrose, interpretVitals, type Flag, type VitalsInput } from "@/lib/interpret";
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
import { FEED_PHASES, suggestFluids } from "@/lib/feed-guide";
import type { Detail } from "@/lib/types";
import {
  calcNutrition,
  fmtBP,
  fmtTime,
  FORTIFIER_CATALOG,
  FORTIFIER_KCAL_PER_UNIT,
  FORTIFIER_PROTEIN_G_PER_UNIT,
  fortifierById,
  gainGPerKgDay,
  pctOfBirth,
  resolveFeedPlan,
  tempIn,
  tempOut,
  type Clinical,
} from "@/lib/clinical";

function shiftTag(at: string): "Day" | "Night" {
  const h = new Date(at).getHours();
  return h >= 8 && h < 20 ? "Day" : "Night";
}

type ClinicalDrug = NonNullable<Clinical["drugs"]>[number];

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
          sub="Pre-filled with the last set - tap ± only for what changed, then save."
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
            <span className="text-[10px] text-slate-400">mmHg - systolic/diastolic (MAP)</span>
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
              Serial anthropometry - {d.baby.unit === "nicu" ? "daily weight - weekly HC & length" : d.baby.unit === "postnatal" ? "daily weight" : "weight on admission & weekly"}
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
                  <td>{r.hr ?? "-"}</td>
                  <td>{r.rr ?? "-"}</td>
                  <td>{r.spo2 ?? "-"}</td>
                  <td>{tempOut(r.temp as number | null, unit) ?? "-"}</td>
                  <td className="whitespace-nowrap">{fmtBP(r.sbp as number | null, r.dbp as number | null, r.map as number | null)}</td>
                  <td>{r.rbs ?? "-"}</td>
                  <td className="whitespace-nowrap">
                    {r.painRaw ?? r.painScore ?? "-"}
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
          options={["88-92%", "90-95%", "91-95%", "92-97%", "95-100%"]}
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
          <li>• CPAP failure: FiO₂ &gt; 0.40 with PEEP 6-7, pH &lt; 7.20 with pCO₂ &gt; 60 → intubate + surfactant.</li>
          <li>• Target SpO₂ 90-95% for preterm on oxygen (AAP/NNF).</li>
          <li>• Caffeine citrate for all &lt; 32 wk / &lt; 1250 g.</li>
        </ul>
      </Section>
    </div>
  );
}

/**
 * Actual value against its target band. The shaded band is the target and the
 * fill is where the baby is, so "are we there yet" is one glance.
 */
function TargetBar({
  label,
  value,
  target,
  unit,
  decimals = 1,
}: {
  label: string;
  value: number;
  target: [number, number];
  unit: string;
  decimals?: number;
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
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="lbl !mb-0">{label}</span>
        <span className={`text-sm font-black tabular-nums ${text}`}>
          {value.toFixed(decimals)} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 bg-emerald-400/20" style={{ left: `${loPct}%`, width: `${Math.max(0, 100 - loPct)}%` }} />
        <div className={`absolute inset-y-0 left-0 ${bar} opacity-80`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>target {lo}–{hi}</span>
        <span>
          {value === 0 ? "nothing recorded" : inBand ? "in range" : low ? `${(lo - value).toFixed(decimals)} short` : `${(value - hi).toFixed(decimals)} over`}
        </span>
      </div>
    </div>
  );
}

export function FluidsTab({ d, patch }: { d: Detail; patch: (b: Record<string, unknown>) => Promise<void> }) {
  const f = d.baby.clinical?.fluids ?? {};
  const [s, setS] = useState({ ...f });
  const [manualDerived, setManualDerived] = useState({
    gir: f.girManual === true,
    kcal: f.kcalManual === true,
    feedVol: f.feedVolManual === true,
  });
  const wt = d.baby.currentWeight / 1000;
  // Day of life, 1 = the day of birth. Drives the fluid ramp and the targets.
  // Captured once so the calculation is pure during render.
  const [now] = useState(() => Date.now());
  const dol = Math.max(1, Math.floor((now - +new Date(d.baby.dob)) / 86400000) + 1);
  const set = (k: string) => (n: number) => setS((p) => ({ ...p, [k]: n }));
  // The feed plan resolves today's enteral + IV volumes from the TFI target.
  // The same resolver runs inside calcNutrition, so the energy panel and the
  // feed volume can never disagree.
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
  // life and what they are already on. Nothing is written until "Apply" is used.
  const guide = suggestFluids({
    weightG: d.baby.currentWeight,
    dol,
    gestWeeks: d.baby.gestWeeks,
    enteralMlKgDay: enteralForNutrition,
    ivMlKgDay: s.ivMlKgDay,
    feedRoute: s.feedRoute,
    tfiMlKgDay: s.tfiMlKgDay,
    enteralProteinGKgDay: nutrition.enteralProtein,
  });
  const applyGuide = () =>
    setS((p) => ({
      ...p,
      ...guide.fields,
      feedType: p.feedType ?? "Expressed breast milk (EBM)",
      feedVolManual: false,
    }));
  const guideRows: { label: string; value: string; why: string }[] = [
    { label: "Feeds today", value: `${guide.fields.enteralMlKgDay} ml/kg/d`, why: guide.why.enteralMlKgDay },
    { label: "Total fluids", value: `${guide.fields.tfiMlKgDay} ml/kg/d`, why: guide.why.tfiMlKgDay },
    { label: "IV fluids", value: `${guide.fields.ivMlKgDay} ml/kg/d`, why: guide.why.ivMlKgDay },
    { label: "Dextrose", value: `D${guide.fields.dextrosePct}%`, why: guide.why.dextrosePct },
    { label: "Amino acids", value: `${guide.fields.aminoAcid} g/kg/d`, why: guide.why.aminoAcid },
    { label: "Lipid", value: `${guide.fields.lipid} g/kg/d`, why: guide.why.lipid },
    { label: "Step up tomorrow", value: `${guide.fields.feedIncrementMlKgDay} ml/kg/d`, why: guide.why.feedIncrementMlKgDay },
    { label: "Feed interval", value: guide.fields.feedFreq, why: guide.why.feedFreq },
    ...(guide.fields.fortifierProductId
      ? [{
          label: "Fortify",
          value: `${guide.fields.fortificationAmount} sachet in 25 ml x ${guide.fields.fortificationDosesPerDay}/day`,
          why: guide.why.fortificationAmount,
        }]
      : []),
  ];
  const hasEnergyInputs = enteralForNutrition !== undefined || s.feedType !== undefined || girValue !== undefined || s.aminoAcid !== undefined || s.lipid !== undefined;
  const autoKcal = hasEnergyInputs || s.kcal === undefined ? (hasEnergyInputs ? nutrition.totalKcal : undefined) : s.kcal;
  const kcalValue = manualDerived.kcal ? s.kcal : autoKcal;
  const setDerived = (key: "gir" | "kcal" | "feedVol") => (value: number) => {
    setManualDerived((current) => ({ ...current, [key]: true }));
    setS((p) => ({ ...p, [key]: value }));
  };
  const resetToAutomatic = (key: "gir" | "kcal" | "feedVol") => {
    setManualDerived((current) => ({ ...current, [key]: false }));
    setS((p) => ({ ...p, [key]: undefined }));
  };
  // totalMlKgDay is what the board, the handover sheet and the print sheet all
  // read, so keep it in step with the plan instead of leaving a stale total.
  const saveFluids = () => patch({ clinical: { fluids: { ...s, ...(plan.active && plan.enteralMlKgDay !== undefined ? { enteralMlKgDay: plan.enteralMlKgDay } : {}), totalMlKgDay: nutrition.totalFluids, gir: girValue, kcal: kcalValue, feedVol: feedVolumeValue, girManual: manualDerived.gir, kcalManual: manualDerived.kcal, feedVolManual: manualDerived.feedVol } } });

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
      : kcalValue < 110
        ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d below target 110-135`, sev: "warn" }
        : kcalValue <= 135
          ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d within target`, sev: "info" }
          : kcalValue <= 160
            ? { key: "kcal", label: `Energy ${kcalValue} kcal/kg/d above target`, sev: "warn" }
            : { key: "kcal", label: `Grossly high ${kcalValue} kcal/kg/d (>160)`, sev: "crit", note: "check ml/day vs ml/kg/day" };

  const protFlag: Flag = nutrition.totalProtein === 0
    ? { key: "prot", label: "Protein waiting for inputs", sev: "info" }
    : nutrition.totalProtein < 2
      ? { key: "prot", label: `Low protein ${nutrition.totalProtein} g/kg/d (<2)`, sev: "warn" }
      : nutrition.totalProtein < 3.5
        ? { key: "prot", label: `Protein ${nutrition.totalProtein} g/kg/d below 3.5-4.5`, sev: "warn" }
        : nutrition.totalProtein <= 4.5
          ? { key: "prot", label: `Protein ${nutrition.totalProtein} g/kg/d adequate (3.5-4.5)`, sev: "info" }
          : nutrition.totalProtein <= 6
            ? { key: "prot", label: `High protein ${nutrition.totalProtein} g/kg/d (>4.5)`, sev: "warn" }
            : { key: "prot", label: `Grossly high protein ${nutrition.totalProtein} g/kg/d (>6)`, sev: "crit", note: "check AA g/kg/d vs ml" };

  const nutritionFlags: Flag[] = [girFlag, kcalFlag, protFlag];

  const feedVolumeHint = manualDerived.feedVol
    ? "Manual override"
    : plan.active && plan.perFeedMl !== undefined
      ? `Auto from the feed plan - ${plan.feedsPerDay} feeds/day`
      : intervalHours && wt > 0 && s.enteralMlKgDay !== undefined
        ? `Auto from ${intervalHours} hourly feeds`
        : wt > 0
          ? "Choose an hourly frequency and enteral target"
          : "Needs a weight and an hourly frequency";
  return (
    <div className="grid gap-3">
      <Section
        title="Feeds & fluids"
        sub={`Day ${dol} of life - what this baby should be on today, what they are actually getting, and where it misses the target. Apply the plan or edit any value below.`}
        right={<button type="button" className="btn-primary" onClick={saveFluids}>Save</button>}
      >
        {/* --- 1. where this baby is on the feeding pathway ------------------ */}
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <div className="flex flex-wrap items-center gap-1">
            {FEED_PHASES.map((ph, i) => {
              const active = ph.id === guide.phase.id;
              const done = i < guide.phase.step;
              return (
                <span
                  key={ph.id}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                    active
                      ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40"
                      : done
                        ? "text-emerald-200/80"
                        : "text-slate-500"
                  }`}
                >
                  {done ? "✓" : i + 1} {ph.label}
                  {i < FEED_PHASES.length - 1 && <span className="text-slate-600">→</span>}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            <b className="text-white">{guide.phase.label}</b> &mdash; {guide.phase.blurb}
          </p>
        </div>

        {/* --- 2. today's plan, one click ----------------------------------- */}
        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-cyan-50">Suggested for today</div>
              <div className="text-[11px] text-cyan-200/80">{guide.headline}</div>
            </div>
            <button type="button" className="btn-primary" onClick={applyGuide}>
              Apply this plan
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {guideRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                <div className="lbl !mb-0">{row.label}</div>
                <div className="text-sm font-black text-white">{row.value}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-slate-400">{row.why}</div>
              </div>
            ))}
          </div>
          {guide.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[11px] leading-relaxed text-slate-300">
              {guide.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>

        {/* --- 3. against the target ---------------------------------------- */}
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <TargetBar label="Fluids" value={nutrition.totalFluids} target={nutrition.fluidsTarget} unit="ml/kg/d" />
          <TargetBar label="Energy" value={nutrition.totalKcal} target={nutrition.kcalTarget} unit="kcal/kg/d" />
          <TargetBar label="Protein" value={nutrition.totalProtein} target={nutrition.proteinTarget} unit="g/kg/d" decimals={2} />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Targets sized to this baby: {nutrition.targetsBasis}</p>

        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-cyan-50">Live calculations - corrected</b><span className="text-[10px] font-bold text-cyan-200">Edit to override, automatic uses clamped physiological ranges</span></div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs leading-relaxed text-slate-200 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
              <div className="lbl !mb-1">GIR</div>
              <div className="text-sm font-black text-white">{girValue ?? "-"} <span className="text-[10px] font-normal">mg/kg/min</span></div>
              <div className="text-[10px] text-slate-400">{girValue !== undefined ? `${nutrition.dextroseG} g/kg/day dextrose → ${nutrition.dextroseKcal} kcal` : "waiting for dextrose% & IV"}</div>
              <div className="text-[9px] text-slate-500">source: {nutrition.girSource} - formula (D%xIVx10)/1440</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
              <div className="lbl !mb-1">Energy</div>
              <div className="text-sm font-black text-white">{kcalValue ?? "-"} <span className="text-[10px] font-normal">kcal/kg/day</span></div>
              <div className="text-[10px] text-slate-400">enteral {nutrition.enteralKcal} + IV {nutrition.ivKcal} (dex {nutrition.dextroseKcal} + AA {nutrition.aaKcal} + lipid {nutrition.lipidKcal})</div>
              <div className="text-[9px] text-slate-500">target 110-135 - density {nutrition.density} kcal/ml ({nutrition.feedType})</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
              <div className="lbl !mb-1">Protein</div>
              <div className="text-sm font-black text-white">{nutrition.totalProtein} <span className="text-[10px] font-normal">g/kg/day</span></div>
              <div className="text-[10px] text-slate-400">enteral {nutrition.enteralProtein} g + AA {nutrition.aaG} g</div>
              <div className="text-[9px] text-slate-500">target 3.5-4.5 - {nutrition.proteinPerMl} g/ml ({nutrition.feedType})</div>
            </div>
          </div>
        </div>

        {nutrition.warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-200"><AlertTriangle size={14} /> Nutrition warnings - rectified limits</div>
            <ul className="mt-1 list-disc pl-5 text-[11px] text-amber-100">
              {nutrition.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <fieldset className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
          <legend className="px-1 text-base font-black text-slate-100">Feed plan - enteral feeds</legend>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Sets the enteral feed volume only. <b className="text-slate-200">Increasing:</b> enter the total fluid
            target (TFI) and the planned increase, then choose whether the increase is given IV today or becomes
            tomorrow&apos;s feed target. <b className="text-slate-200">Static:</b> the whole TFI is enteral and
            simply divided across the day by the chosen frequency. IV fluids are always entered by you below, in
            Prescription inputs.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip
              label="Static - whole 24 h divided"
              on={planMode !== "increasing"}
              onClick={() => setS((p) => ({ ...p, feedPlan: "static" }))}
            />
            <Chip
              label="Increasing - step up over 24 h"
              on={planMode === "increasing"}
              onClick={() => setS((p) => ({ ...p, feedPlan: "increasing" }))}
            />
          </div>

          {planMode === "increasing" && (
            <div className="mt-3">
              <span className="lbl mb-1 block">Increase applies to</span>
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  label="Given IV today"
                  on={increaseAppliesTo !== "tomorrow-target"}
                  onClick={() => setS((p) => ({ ...p, increaseAppliesTo: "iv-today" }))}
                />
                <Chip
                  label="Tomorrow's feed target"
                  on={increaseAppliesTo === "tomorrow-target"}
                  onClick={() => setS((p) => ({ ...p, increaseAppliesTo: "tomorrow-target" }))}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {increaseAppliesTo === "tomorrow-target"
                  ? "Feeds run at the full TFI today and step up to TFI plus the increase over the next 24 h."
                  : "Feeds run at TFI minus the increase today — enter the IV that covers the difference in Prescription inputs below."}
              </p>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <NumField
              label="TFI target ml/kg/d (0-250)"
              value={s.tfiMlKgDay ?? undefined}
              onChange={set("tfiMlKgDay")}
              min={0}
              max={250}
              step={1}
              placeholder="e.g. 150"
            />
            {planMode === "increasing" && (
              <NumField
                label="Increase over next 24 h ml/kg/d"
                value={s.feedIncrementMlKgDay ?? undefined}
                onChange={set("feedIncrementMlKgDay")}
                min={0}
                max={250}
                step={1}
                placeholder="e.g. 20"
              />
            )}
          </div>

          {plan.active && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed">
                <div className="lbl !mb-1">Today</div>
                <div className="font-black text-white">
                  Enteral {plan.enteralMlKgDay} ml/kg/d
                </div>
                <div className="text-slate-400">
                  {plan.perFeedMl !== undefined && plan.feedsPerDay !== undefined
                    ? `${plan.perFeedMl} ml per feed x ${plan.feedsPerDay} feeds/24 h`
                    : "Choose an hourly frequency to split the day"}
                </div>
                <div className="text-slate-400">
                  IV entered {plan.ivMlKgDay ?? 0} ml/kg/d - total fluids {plan.totalFluidsMlKgDay} ml/kg/d
                </div>
                {plan.ivSuggestedMlKgDay !== undefined && plan.ivSuggestedMlKgDay > 0 && (
                  <div className="text-slate-500">
                    {plan.ivSuggestedMlKgDay} ml/kg/d of IV would bring the day to the TFI target
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed">
                <div className="lbl !mb-1">Next 24 h</div>
                <div className="font-black text-white">Enteral {plan.tomorrowEnteralMlKgDay} ml/kg/d</div>
                <div className="text-slate-400">
                  {plan.mode === "increasing" && plan.increment !== undefined
                    ? `step up of ${plan.increment} ml/kg/d`
                    : "unchanged - static plan"}
                </div>
                <div className={plan.reconciled ? "text-slate-400" : "font-bold text-amber-200"}>
                  {plan.reconciled
                    ? `enteral + IV reconciles to TFI ${plan.tfi} ml/kg/d`
                    : `enteral + IV is ${plan.totalFluidsMlKgDay}, TFI target ${plan.tfi} ml/kg/d`}
                </div>
              </div>
            </div>
          )}
          {!plan.active && (
            <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/50 p-2 text-[11px] text-slate-400">
              Enter a TFI target to set the enteral feed volume from the plan
            </div>
          )}
          {plan.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[11px] text-amber-100">
              {plan.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-base font-black text-slate-100">Prescription inputs - caps 0-250 ml/kg/day, AA/lipid 0-6 g/kg/day</legend>
          <p className="mt-1 text-xs text-slate-400">Enter ml/kg/day (not ml/day). AA and lipid are g/kg/day, not ml. Grossly high values flagged.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {/* TFI already lives in the feed plan above — only ask for a total
                here for legacy records that have no plan driving them. */}
            {!plan.active && (
              <NumField label="Total fluids ml/kg/d (0-250)" value={s.totalMlKgDay ?? undefined} onChange={set("totalMlKgDay")} min={0} max={250} step={1} placeholder="enter" />
            )}
            <NumField label={`Enteral ml/kg/d (0-250)${plan.active ? ` - set by the feed plan (${plan.enteralMlKgDay})` : ""}`} value={plan.active ? plan.enteralMlKgDay : s.enteralMlKgDay ?? undefined} onChange={set("enteralMlKgDay")} min={0} max={250} step={1} placeholder="enter" readOnly={plan.active} />
            <NumField label="IV ml/kg/d (0-250) - entered by you" value={s.ivMlKgDay ?? undefined} onChange={set("ivMlKgDay")} min={0} max={250} step={1} placeholder="enter" />
            <NumField label="Dextrose % (0-25) for auto GIR" value={s.dextrosePct ?? undefined} onChange={set("dextrosePct")} min={0} max={25} step={0.5} decimals={1} placeholder="for auto GIR" />
            <NumField label="Amino acid g/kg/d (0-4.5, cap 6)" value={s.aminoAcid ?? undefined} onChange={set("aminoAcid")} min={0} max={6} step={0.1} decimals={1} placeholder="g/kg/d, not ml" />
            <NumField label="Lipid g/kg/d (0-4, cap 6)" value={s.lipid ?? undefined} onChange={set("lipid")} min={0} max={6} step={0.1} decimals={1} placeholder="g/kg/d, not ml" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <label className="block"><span className="lbl mb-1 block">Feed type</span><DialWithOther options={FEED_TYPE} value={s.feedType} onChange={(v: string) => setS((p) => ({ ...p, feedType: v }))} otherPlaceholder="Other feed type…" /></label>
            <label className="block"><span className="lbl mb-1 block">Route</span><DialWithOther options={FEED_ROUTE} value={s.feedRoute} onChange={(v: string) => setS((p) => ({ ...p, feedRoute: v }))} otherPlaceholder="Other route…" /></label>
            <label className="block"><span className="lbl mb-1 block">Frequency</span><DialWithOther options={["1 hourly", "1.5 hourly", "2 hourly", "2.5 hourly", "3 hourly", "4 hourly", "continuous", "2-3 hourly on demand"]} value={s.feedFreq} onChange={(v: string) => setS((p) => ({ ...p, feedFreq: v }))} otherPlaceholder="Other frequency…" /></label>
          </div>
        </fieldset>

        <details className="mt-6 border-t border-white/10 pt-5">
          <summary className="cursor-pointer text-base font-black text-slate-100">
            Manual overrides &amp; formulas
          </summary>
          <p className="mt-1 text-xs text-slate-400">
            Only needed when the automatic value is wrong for this baby. Automatic recalculates from the
            source inputs with physiological clamps.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><NumField label={`GIR mg/kg/min - ${manualDerived.gir ? "manual" : "automatic"} (0-20)`} value={girValue} onChange={setDerived("gir")} min={0} max={20} step={0.1} decimals={2} placeholder="waiting" />{manualDerived.gir && <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("gir")}>Use automatic GIR</button>}</div>
            <div><NumField label={`Energy kcal/kg/d - ${manualDerived.kcal ? "manual" : "automatic"} (0-300)`} value={kcalValue} onChange={setDerived("kcal")} min={0} max={300} step={1} decimals={1} placeholder="waiting" />{manualDerived.kcal && <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("kcal")}>Use automatic energy</button>}</div>
            <div><NumField label={`Feed volume / feed ml - ${manualDerived.feedVol ? "manual" : "automatic"}`} value={feedVolumeValue} onChange={setDerived("feedVol")} min={0} max={120} step={0.1} decimals={1} placeholder="waiting" />{manualDerived.feedVol && <button type="button" className="mt-1 text-[10px] font-bold text-cyan-200 underline" onClick={() => resetToAutomatic("feedVol")}>Use automatic feed volume</button>}<span className="mt-1 block text-[10px] text-slate-500">{feedVolumeHint}</span></div>
          </div>
          <p className="mt-3 rounded-lg bg-white/[0.03] p-2 text-[10px] leading-relaxed text-slate-400">Formulas: GIR = D% x IV ml/kg/day x10 /1440 . dextrose g = GIR x1.44 . kcal = enteral ml x density + dextrose g x3.4 + AA x4 + lipid x9 . protein = enteral ml x protein/ml + AA . caps: GIR 0-20, AA/lipid 0-6, fluids 0-250. Gross {">"}300 kcal or {">"}10g protein flagged.</p>
        </details>

        <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm text-cyan-100">Total {wt > 0 ? `~ ${Math.round(nutrition.totalFluids * wt)} ml/day` : "per kg - no weight on record"} ({nutrition.totalFluids} ml/kg/d = enteral {nutrition.enteralMl} + IV {nutrition.ivMl}) - Energy {kcalValue ?? "-"} kcal/kg/day - Protein {nutrition.totalProtein} g/kg/day {nutrition.isAbnormal && <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-200">abnormal - check warnings</span>}</div>
        {/* Every kcal and gram of protein, traced to its source. */}
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs">
            <div className="lbl !mb-1">Energy breakdown kcal/kg/day</div>
            <ul className="space-y-1 leading-relaxed text-slate-200">
              <li className="flex justify-between gap-2"><span>Milk / feeds {nutrition.enteralMl} ml × {nutrition.density} kcal/ml</span><b>{nutrition.milkKcal}</b></li>
              {nutrition.fortified && (
                <li className="flex justify-between gap-2 text-cyan-100"><span>Fortifier {nutrition.enteralMl} ml × {nutrition.fortKcalPerMl} kcal/ml</span><b>+{nutrition.fortKcal}</b></li>
              )}
              <li className="flex justify-between gap-2"><span>IV dextrose {nutrition.dextroseG} g × 3.4 (GIR {nutrition.gir})</span><b>{nutrition.dextroseKcal}</b></li>
              <li className="flex justify-between gap-2"><span>IV amino acids {nutrition.aaG} g × 4</span><b>{nutrition.aaKcal}</b></li>
              <li className="flex justify-between gap-2"><span>IV lipid {nutrition.lipidG} g × 9</span><b>{nutrition.lipidKcal}</b></li>
              <li className="mt-1 flex justify-between gap-2 border-t border-white/10 pt-1 font-black text-white"><span>Total (enteral {nutrition.enteralKcal} + IV {nutrition.ivKcal})</span><span>{nutrition.totalKcal}</span></li>
              <li className="text-[10px] text-slate-400">Target {nutrition.kcalTarget[0]}–{nutrition.kcalTarget[1]} kcal/kg/day</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs">
            <div className="lbl !mb-1">Protein breakdown g/kg/day</div>
            <ul className="space-y-1 leading-relaxed text-slate-200">
              <li className="flex justify-between gap-2"><span>Milk / feeds {nutrition.enteralMl} ml × {nutrition.proteinPerMl} g/ml</span><b>{nutrition.milkProtein}</b></li>
              {nutrition.fortified && (
                <li className="flex justify-between gap-2 text-emerald-100"><span>Fortifier {nutrition.enteralMl} ml × {nutrition.fortProteinPerMl} g/ml</span><b>+{nutrition.fortProtein}</b></li>
              )}
              <li className="flex justify-between gap-2"><span>IV amino acids (Aminoven / Vaminolact)</span><b>{nutrition.aaProtein}</b></li>
              <li className="flex justify-between gap-2 text-slate-400"><span>IV lipid emulsion (no usable protein)</span><b>{nutrition.lipidProtein}</b></li>
              <li className="mt-1 flex justify-between gap-2 border-t border-white/10 pt-1 font-black text-white"><span>Total (enteral {nutrition.enteralProtein} + IV {nutrition.aaProtein})</span><span>{nutrition.totalProtein}</span></li>
              <li className="text-[10px] text-slate-400">Target {nutrition.proteinTarget[0]}–{nutrition.proteinTarget[1]} g/kg/day</li>
            </ul>
          </div>
        </div>
        <div className="mt-3"><FlagsList flags={nutritionFlags} /></div>

        <fieldset className="mt-6 border-t border-white/10 pt-5">
          <legend className="text-base font-black text-slate-100">Fortification</legend>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
            <b className="text-slate-100">Record exactly as prepared.</b> Product, amount, and the volume it was mixed
            into. The amount and mixed volume are never rescaled — they are used as entered to add the
            fortifier&apos;s energy and protein to the day&apos;s enteral feeds.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <input className="inp min-h-11" value={s.fortificationName ?? ""} onChange={(event) => setS((p) => ({ ...p, fortificationName: event.target.value }))} placeholder="e.g. human milk fortifier" />
            </label>

            {fortProduct && (
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="lbl mb-1 block">
                  Dose per feed — {fortProduct.unit === "sachet" ? "sachet" : "grams of powder"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {fortProduct.steps.map((step) => (
                    <button
                      key={step}
                      type="button"
                      className={`chip ${s.fortificationAmount === step ? "chip-on" : "chip-off"}`}
                      onClick={() => setS((p) => ({ ...p, fortificationAmount: step }))}
                    >
                      {fortProduct.stepLabel(step)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{fortProduct.note}</p>
              </div>
            )}

            <NumField label="Amount per dose" value={s.fortificationAmount ?? undefined} onChange={set("fortificationAmount")} min={0} max={100} step={0.05} decimals={2} placeholder="enter" />
            <label className="block"><span className="lbl mb-1 block">Amount unit</span><select className="inp min-h-11" value={s.fortificationAmountUnit ?? "sachet"} onChange={(event) => setS((p) => ({ ...p, fortificationAmountUnit: event.target.value as NonNullable<typeof p.fortificationAmountUnit> }))}><option value="sachet">sachet</option><option value="g">g</option><option value="ml">ml</option><option value="scoop">scoop</option><option value="measure">measure</option></select></label>
            <NumField label="Feed volume mixed (ml)" value={s.fortificationFeedVolumeMl ?? undefined} onChange={set("fortificationFeedVolumeMl")} min={0} max={1000} step={1} decimals={1} placeholder="required for energy" />
            <NumField
              label={`Times per day - ${nutrition.fortFeedsPerDay ? `${nutrition.fortFeedsPerDay} feeds total` : "feed frequency unknown"}`}
              value={s.fortificationDosesPerDay ?? undefined}
              onChange={set("fortificationDosesPerDay")}
              min={0}
              max={48}
              step={1}
              decimals={0}
              placeholder={nutrition.fortFeedsPerDay ? String(nutrition.fortFeedsPerDay) : "every feed"}
            />
            <NumField label={`kcal per unit - ${s.fortifierKcalPerUnit === undefined ? `label ${fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT}` : "custom"}`} value={s.fortifierKcalPerUnit ?? undefined} onChange={set("fortifierKcalPerUnit")} min={0} max={50} step={0.05} decimals={3} placeholder={String(fortProduct?.kcalPerUnit ?? FORTIFIER_KCAL_PER_UNIT)} />
            <NumField label={`Protein g per unit - ${s.fortifierProteinPerUnit === undefined ? `label ${fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT}` : "custom"}`} value={s.fortifierProteinPerUnit ?? undefined} onChange={set("fortifierProteinPerUnit")} min={0} max={10} step={0.01} decimals={3} placeholder={String(fortProduct?.proteinPerUnit ?? FORTIFIER_PROTEIN_G_PER_UNIT)} />
            <label className="block sm:col-span-2 lg:col-span-2"><span className="lbl mb-1 block">Preparation note</span><input className="inp min-h-11" value={s.fortificationNotes ?? ""} onChange={(event) => setS((p) => ({ ...p, fortificationNotes: event.target.value }))} placeholder="Optional" /></label>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/50 p-2 text-[11px] leading-relaxed text-slate-300">
            {nutrition.fortified
              ? <>
                  <b className="text-white">Counted in the totals:</b> {s.fortificationAmount} {s.fortificationAmountUnit ?? "sachet"} in{" "}
                  {s.fortificationFeedVolumeMl ?? fortProduct?.mixedWithMl} ml, given{" "}
                  <b className="text-white">{nutrition.fortDosesPerDay} time{nutrition.fortDosesPerDay === 1 ? "" : "s"}/day</b> —{" "}
                  {s.fortificationFeedVolumeMl || fortProduct ? `${(s.fortificationFeedVolumeMl ?? fortProduct!.mixedWithMl) * nutrition.fortDosesPerDay} ml/day fortified, ` : ""}
                  {(nutrition.fortFraction * 100).toFixed(0)}% of the enteral volume. Inside a fortified feed that is{" "}
                  <b className="text-cyan-200">{nutrition.fortKcalPerMlInFeed} kcal/ml</b> and{" "}
                  <b className="text-emerald-200">{nutrition.fortProteinPerMlInFeed} g protein/ml</b>; spread over the day it adds{" "}
                  <b className="text-cyan-200">+{nutrition.fortKcalPerMl} kcal/ml</b> and{" "}
                  <b className="text-emerald-200">+{nutrition.fortProteinPerMl} g protein/ml</b> to {nutrition.feedType} —
                  effective density {nutrition.effectiveKcalPerMl} kcal/ml, {nutrition.effectiveProteinPerMl} g protein/ml.
                </>
              : "No fortifier recorded — the base milk density is used."}
          </div>
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100"><b>Safety:</b> the amount is a single dose and stays linked to the stated mixed volume — nothing is rescaled. Only the feeds it is actually given in are uplifted, so &ldquo;0.5 g twice a day&rdquo; is not credited to every feed. Product values come from the manufacturer label and can be overridden per baby.</div>
        </fieldset>
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
              logEvent: { kind: "growth", text: `Weights updated - birth ${bw} g, current ${cw} g`, author: user },
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
        Change from birth: {pctOfBirth(bw, cw) ?? 0}% - {entries.length} serial entries. Use Daily progress for the full calculator.
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
        <Section title="Include a diagnosis / problem - vertical list easy to read" right={<input className="inp w-56 text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          {!results && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SYSTEMS.map((s) => (
                <Chip key={s} label={s} on={sys === s} onClick={() => setSys(s)} />
              ))}
            </div>
          )}
          {/* ONE BELOW OTHER vertical stacked list for easy reading */}
          <div className="flex max-h-[420px] flex-col gap-2 overflow-auto pr-1">
            {options.map((option) => {
              const existing = existingFor(option.label);
              const isIncluded = existing?.status === "active" || existing?.status === "watch";
              return (
                <div key={option.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2.5 transition hover:border-cyan-400/30 hover:bg-slate-800/60">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-snug text-slate-100">{option.label}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{option.system}</div>
                  </div>
                  {isIncluded ? (
                    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">✓ Included</span>
                  ) : (
                    <button className="btn-primary shrink-0 !px-3 !py-1.5 text-[11px]" onClick={() => include(option.system, option.label)}>
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
      <Section title="Baby’s problem record - one below other" sub={`${active.length} active, vertical stacked`}>
        <div className="flex flex-col gap-2.5">
          {d.problems.length === 0 && <p className="text-xs text-slate-400">No diagnosis added yet. Add from left list.</p>}
          {d.problems.map((p, idx) => (
            <div key={p.id} className={`rounded-xl border p-3 transition ${p.status === "resolved" ? "border-emerald-400/30 bg-emerald-400/10" : p.status === "watch" ? "border-amber-400/30 bg-amber-400/10" : "border-rose-400/30 bg-rose-400/10"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-2.5">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${p.status === "resolved" ? "bg-emerald-400/20 text-emerald-300" : p.status === "watch" ? "bg-amber-400/20 text-amber-300" : "bg-rose-400/20 text-rose-300"}`}>{idx+1}</span>
                  <div>
                    <div className="text-[13px] font-bold leading-snug text-white">{p.label}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`rounded-full border px-2 py-0.5 font-bold uppercase tracking-wide ${p.status === "resolved" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-200" : p.status === "watch" ? "border-amber-400/30 bg-amber-400/15 text-amber-200" : "border-rose-400/30 bg-rose-400/15 text-rose-200"}`}>{p.status}</span>
                      <span className="text-slate-400">{p.system ?? ""}</span>
                      <span className="text-slate-500">- {fmtTime(p.onsetAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.status !== "resolved" && (
                  <button className="btn-ghost !px-2.5 !py-1 text-[11px]" onClick={() => setStatus(p, "resolved")}>
                    ✓ Mark resolved
                  </button>
                )}
                {p.status === "resolved" && (
                  <button className="btn-ghost !px-2.5 !py-1 text-[11px]" onClick={() => setStatus(p, "active")}>
                    Re-open
                  </button>
                )}
                <button className="btn-ghost !px-2.5 !py-1 text-[11px] text-rose-300" onClick={() => remove(p)}>
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
            value={drugs.map((x) => x.dose ? `${x.name} - ${x.dose}` : x.name)}
            onChange={(names: string[]) =>
              setDrugs(names.filter((n) => n.trim()).map((n) => {
                const existing = drugs.find((x) => x.name === n || `${x.name} - ${x.dose ?? ""}` === n);
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
        <div className="lbl mt-4 mb-1">Running medications - current as of now</div>
        <div className="space-y-2">
          {drugs.map((x, i) => {
            const derived = Boolean(x.startedAt && x.dayOverride === undefined);
            return <div key={`${x.name}-${i}`} className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-slate-100">{x.name}{x.dose ? ` - ${x.dose}` : ""}</span>
                {x.ofDays !== undefined && <span className="shrink-0 text-amber-200">D{currentDrugDay(x)}/{x.ofDays}</span>}
                <button className="shrink-0 text-rose-300" onClick={() => setDrugs((p) => p.filter((_, j) => j !== i))}>✕</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="block"><span className="lbl mb-1 block !text-[9px]">First dose</span><input className="inp !min-h-0 !py-1 text-[11px]" type="datetime-local" value={localDateTimeValue(x.startedAt)} onChange={(event) => updateDrug(i, { startedAt: isoFromDateTimeInput(event.target.value), dayOverride: undefined })} /></label>
                <label className="block"><span className="lbl mb-1 block !text-[9px]">Planned days</span><input className="inp !min-h-0 !py-1 text-[11px]" type="number" min={1} max={365} value={x.ofDays ?? ""} placeholder="e.g. 7" onChange={(event) => updateDrug(i, { ofDays: event.target.value ? Number(event.target.value) : undefined })} /></label>
                <label className="block"><span className="lbl mb-1 block !text-[9px]">Manual day if date unknown</span><input className="inp !min-h-0 !py-1 text-[11px]" type="number" min={1} max={365} value={x.dayOverride ?? ""} placeholder={derived ? `Auto D${currentDrugDay(x)}` : "e.g. 4"} onChange={(event) => updateDrug(i, { dayOverride: event.target.value ? Number(event.target.value) : undefined })} /></label>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-slate-500"><span>{derived ? "Calculated from first dose" : x.dayOverride !== undefined ? "Manual therapy day" : "Enter first-dose date"}</span>{x.source && <span>- {x.source}</span>}</div>
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
  const n = calcNutrition(c, lastWeight);
  const course = [
    ...d.problems.map((p) => ({ at: p.onsetAt, text: `${p.label} - ${p.status}`, author: "Clinical record" })),
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
                logEvent: { kind: "discharge", text: `Discharged from NICU - summary by ${user}`, author: user },
              });
              setDischarging(false);
            }}
          >
            🏥 Discharge baby - finalise summary
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
          <p className="text-[11px] font-semibold text-slate-600">Neonatal Discharge Summary - {losDays} days in unit</p>
        </div>
        <p className="mt-3 text-xs text-slate-700">
          {b.babyName} ({b.uhid}), {b.sex}, {b.gestWeeks}+{b.gestDays} wk, BW {b.birthWeight} g → {lastWeight} g.
          Consultant {b.consultant || "-"}. Energy {n.totalKcal} kcal/kg/day - protein {n.totalProtein} g/kg/day.
          Last vitals: BP {fmtBP(lastVital.sbp as number | null, lastVital.dbp as number | null, lastVital.map as number | null)} - temp {tempOut(lastVital.temp as number | null, "F") ?? "-"} °F.
          {c.triage && (
            <> Admission triage: {c.triage.label} ({c.triage.scale} {c.triage.score}, {c.triage.band}).</>
          )}
        </p>
        <h3 className="lbl mt-4 mb-1">Diagnoses - one below other, easy to read</h3>
        <div className="flex flex-col gap-2">
          {d.problems.map((p, idx) => (
            <div key={p.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-black text-white">{idx+1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-slate-900">{p.label}</div>
                <div className="text-[10px] text-slate-600">{p.system ?? ""} - {p.status} - onset {fmtTime(p.onsetAt)}</div>
              </div>
            </div>
          ))}
          {d.problems.length===0 && <div className="text-[11px] text-slate-500">No diagnosis recorded.</div>}
        </div>
        <h3 className="lbl mt-4 mb-1">Hospital course (day/night)</h3>
        <ol className="max-h-64 space-y-1 overflow-auto text-xs text-slate-700">
          {course.map((e, i) => (
            <li key={i}>
              Day {Math.max(0, Math.floor((+new Date(e.at) - +new Date(b.dob)) / 86400000))} - {fmtTime(e.at)} - {shiftTag(e.at)} - {e.text} - {e.author}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-center text-[9px] text-slate-400">Electronically generated - Dr. Suseender Durairaj</p>
      </div>
    </div>
  );
}

type ComposedAction = {
  text: string;
  when: string; // YYYY-MM-DD - manual only
  time: string; // HH:MM - manual only
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
        `Last vitals: HR ${v.hr ?? "-"}, BP ${fmtBP(v.sbp as number | null, v.dbp as number | null, v.map as number | null)}, T ${tempOut(v.temp as number | null, "F") ?? "-"} °F.`,
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
  const [summaryDraft, setSummaryDraft] = useState("");
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
  const [summaryEdited, setSummaryEdited] = useState(false);
  // Show the generated summary until the clinician types over it. Once they
  // have, their note wins and no re-render or autosave elsewhere can replace
  // it — the previous version synced this through an effect, which silently
  // discarded a handover note whenever the underlying data changed.
  const summary = summaryEdited ? summaryDraft : autoSummary;
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
          <div className="mt-3 mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="lbl">Patient summary</span>
            <button
              type="button"
              className="text-[10px] font-bold text-cyan-200 underline"
              onClick={() => {
                setSummaryDraft("");
                setSummaryEdited(false);
              }}
            >
              Regenerate from current data
            </button>
          </div>
          <textarea
            className="inp h-28"
            value={summary}
            onChange={(e) => {
              setSummaryDraft(e.target.value);
              setSummaryEdited(true);
            }}
          />
          {summaryEdited && (
            <p className="mt-1 text-[10px] text-emerald-200">
              Your note is kept — the generated summary will not overwrite it.
            </p>
          )}
          <div className="lbl mt-3 mb-1">Synthesis</div>
          <input className="inp" value={synthesis} onChange={(e) => setSynthesis(e.target.value)} />
        </Section>
        <Section
          title="Handover action list"
          sub="Tap a preset to add it as editable text - alter freely before signing."
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
            <div className="text-[10px] text-slate-400">{h.shift} - {h.fromStaff} → {h.toStaff || "-"} - {fmtTime(h.createdAt)}</div>
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
                              {task.doneBy ? ` - ${task.doneBy}` : ""}
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
  "Desaturation episode - recovered with stimulation",
  "Apnoea - bag & mask given",
  "Bradycardia < 100 - self-resolved",
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
                  Day {dol} - {fmtTime(e.at)} - {shiftTag(e.at)} shift - {e.author}
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
