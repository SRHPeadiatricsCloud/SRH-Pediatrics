"use client";

import { HeartPulse } from "lucide-react";
import { useState } from "react";

type ScaleItem = { key: string; label: string; options: { v: number; text: string }[] };

const NIPS: ScaleItem[] = [
  { key: "face", label: "Facial expression", options: [{ v: 0, text: "Relaxed" }, { v: 1, text: "Grimace" }] },
  { key: "cry", label: "Cry", options: [{ v: 0, text: "No cry" }, { v: 1, text: "Whimper" }, { v: 2, text: "Vigorous cry" }] },
  { key: "breath", label: "Breathing", options: [{ v: 0, text: "Relaxed" }, { v: 1, text: "Change in pattern" }] },
  { key: "arms", label: "Arms", options: [{ v: 0, text: "Relaxed/restrained" }, { v: 1, text: "Flexed/extended" }] },
  { key: "legs", label: "Legs", options: [{ v: 0, text: "Relaxed/restrained" }, { v: 1, text: "Flexed/extended" }] },
  { key: "state", label: "State of arousal", options: [{ v: 0, text: "Sleeping/awake" }, { v: 1, text: "Fussy" }] },
];

const PIPP: ScaleItem[] = [
  { key: "ga", label: "Gestational age (wks)", options: [{ v: 0, text: "≥ 36" }, { v: 1, text: "32–35+6" }, { v: 2, text: "28–31+6" }, { v: 3, text: "< 28" }] },
  { key: "beh", label: "Behavioural state", options: [{ v: 0, text: "Active/awake, eyes open, facial movements" }, { v: 1, text: "Quiet/awake, eyes open, no facial movements" }, { v: 2, text: "Active/asleep, eyes closed, facial movements" }, { v: 3, text: "Quiet/asleep, eyes closed, no facial movements" }] },
  { key: "hr", label: "Max HR rise from baseline", options: [{ v: 0, text: "0–4 bpm" }, { v: 1, text: "5–14" }, { v: 2, text: "15–24" }, { v: 3, text: "≥ 25" }] },
  { key: "spo2", label: "Min SpO₂ drop from baseline", options: [{ v: 0, text: "0–2.4%" }, { v: 1, text: "2.5–4.9%" }, { v: 2, text: "5.0–7.4%" }, { v: 3, text: "≥ 7.5%" }] },
  { key: "brow", label: "Brow bulge (% of time)", options: [{ v: 0, text: "None (< 9%)" }, { v: 1, text: "Minimum (10–39%)" }, { v: 2, text: "Moderate (40–69%)" }, { v: 3, text: "Maximum (≥ 70%)" }] },
  { key: "eye", label: "Eye squeeze (% of time)", options: [{ v: 0, text: "None" }, { v: 1, text: "Minimum" }, { v: 2, text: "Moderate" }, { v: 3, text: "Maximum" }] },
  { key: "nlf", label: "Nasolabial furrow (% of time)", options: [{ v: 0, text: "None" }, { v: 1, text: "Minimum" }, { v: 2, text: "Moderate" }, { v: 3, text: "Maximum" }] },
];

const NPASS: ScaleItem[] = [
  { key: "prematurity", label: "Prematurity adjustment", options: [{ v: 0, text: "≥ 30 weeks corrected gestation" }, { v: 1, text: "< 30 weeks corrected gestation (+1)" }] },
  { key: "cry", label: "Crying / irritability", options: [{ v: -2, text: "No cry with painful stimuli" }, { v: -1, text: "Moans / cries minimally" }, { v: 0, text: "Appropriate crying, not high pitched" }, { v: 1, text: "Irritable, cries off and on, consolable" }, { v: 2, text: "High-pitched or silent-continuous cry, inconsolable" }] },
  { key: "beh", label: "Behavioural state", options: [{ v: -2, text: "No arousal to any stimuli" }, { v: -1, text: "Arouses minimally to stimuli" }, { v: 0, text: "Appropriate for GA" }, { v: 1, text: "Restless, squirming, awakens frequently" }, { v: 2, text: "Arching, kicking, constantly awake or arouses minimally / no movement" }] },
  { key: "face", label: "Facial expression", options: [{ v: -2, text: "Mouth is lax, no expression" }, { v: -1, text: "Minimal expression with stimuli" }, { v: 0, text: "Relaxed, appropriate" }, { v: 1, text: "Any pain expression intermittent" }, { v: 2, text: "Any pain expression continual" }] },
  { key: "tone", label: "Extremity tone", options: [{ v: -2, text: "No grasp reflex, flaccid tone" }, { v: -1, text: "Weak grasp reflex, decreased muscle tone" }, { v: 0, text: "Relaxed hands and feet, normal tone" }, { v: 1, text: "Intermittent (0-30 s) clenched toes, fists or finger splay, body not tense" }, { v: 2, text: "Continual (> 30 s) clenched toes, fists, or finger splay, body tense" }] },
  { key: "vs", label: "Vital signs (HR, RR, BP, SpO₂)", options: [{ v: -2, text: "No variability with stimuli, hypoventilation or apnoea" }, { v: -1, text: "< 10% variability from baseline with stimuli" }, { v: 0, text: "Within baseline or normal for GA" }, { v: 1, text: "↑ 10–20% from baseline · SpO₂ 76–85% with stimulation — quick recovery (< 2 min)" }, { v: 2, text: "↑ > 20% from baseline · SpO₂ ≤ 75% with stimulation — slow recovery (> 2 min); ventilator out of sync" }] },
];

const CRIES: ScaleItem[] = [
  { key: "c", label: "Crying", options: [{ v: 0, text: "No cry / cry not high pitched" }, { v: 1, text: "High pitched, consolable" }, { v: 2, text: "High pitched, inconsolable" }] },
  { key: "r", label: "Requires O₂ for SpO₂ > 95%", options: [{ v: 0, text: "No" }, { v: 1, text: "< 30% FiO₂" }, { v: 2, text: "> 30% FiO₂" }] },
  { key: "i", label: "Increased vital signs (HR / BP)", options: [{ v: 0, text: "Both HR & BP within 10% of baseline" }, { v: 1, text: "HR or BP ↑ 11–20% of baseline" }, { v: 2, text: "HR or BP ↑ > 20% of baseline" }] },
  { key: "e", label: "Expression", options: [{ v: 0, text: "None" }, { v: 1, text: "Grimace" }, { v: 2, text: "Grimace + grunt" }] },
  { key: "s", label: "Sleepless (in preceding hour)", options: [{ v: 0, text: "Continuously asleep" }, { v: 1, text: "Wakes at frequent intervals" }, { v: 2, text: "Constantly awake" }] },
];

const SCALES = {
  NIPS: { label: "NIPS (Neonatal Infant Pain Scale)", items: NIPS, max: 7, alert: 3, note: "≥ 3 = pain — intervene." },
  PIPP: { label: "PIPP-R (Premature Infant Pain Profile)", items: PIPP, max: 21, alert: 6, note: "≤ 6 minimal · 7–12 moderate · > 12 severe pain." },
  "N-PASS": { label: "N-PASS (Neonatal Pain, Agitation & Sedation)", items: NPASS, max: 11, alert: 3, note: "Pain: > 3 treat; add +1 for < 30 weeks corrected gestation. Sedation may score negative." },
  CRIES: { label: "CRIES (Post-op neonate)", items: CRIES, max: 10, alert: 4, note: "≥ 4 = analgesia needed." },
} as const;

type ScaleKey = keyof typeof SCALES;

export function PainScoreCalculator({
  onCompute,
}: {
  /** Called with the exact scale and raw total for the vitals row. */
  onCompute?: (scale: ScaleKey, total: number) => void;
}) {
  const [scale, setScale] = useState<ScaleKey>("NIPS");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<number | "">("");

  const active = SCALES[scale];
  const total =
    manual === ""
      ? active.items.reduce((n, it) => n + (answers[`${scale}:${it.key}`] ?? 0), 0)
      : Number(manual);
  const alert = total >= active.alert;


  return (
    <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
          <HeartPulse size={13} />
        </span>
        <span className="lbl">Pain score (auto-calculator)</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(Object.keys(SCALES) as ScaleKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setScale(k);
                setAnswers({});
                setManual("");
              }}
              className={`chip ${scale === k ? "chip-on" : "chip-off"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 text-[10px] text-slate-400">
        <b className="text-slate-200">{active.label}</b> · {active.note}
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        {active.items.map((it) => (
          <label
            key={it.key}
            className="rounded-lg border border-white/10 bg-slate-900/40 p-2"
          >
            <span className="lbl mb-1 block">{it.label}</span>
            <select
              className="inp !py-1 text-xs"
              value={answers[`${scale}:${it.key}`] ?? ""}
              onChange={(e) => {
                setManual("");
                setAnswers((p) => ({ ...p, [`${scale}:${it.key}`]: Number(e.target.value) }));
              }}
            >
              <option value="">— select —</option>
              {it.options.map((o) => (
                <option key={o.v} value={o.v}>
                  ({o.v >= 0 ? "+" : ""}
                  {o.v}) {o.text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div
          className={`rounded-lg px-3 py-1.5 text-sm font-black tabular-nums ${
            alert ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/15 text-emerald-200"
          }`}
        >
          Total {total}
          <span className="text-[10px] font-normal opacity-70"> / {active.max}</span>
        </div>
        <div className="text-[11px] text-slate-400">
          {alert ? "⚠ Above threshold — analgesia / non-pharmacological measures." : "Within threshold."}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-300">
          <span>Manual override</span>
          <input
            className="inp !w-20 !py-1 text-center text-sm font-bold"
            type="number"
            min={scale === "N-PASS" ? -10 : 0}
            max={active.max}
            value={manual}
            onChange={(e) => setManual(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="—"
          />
        </label>
        {onCompute && (
          <button
            type="button"
            className="btn-ghost !py-1 text-[11px]"
            onClick={() => onCompute(scale, total)}
          >
            Use as pain score
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        The exact score and selected scale are saved in the observation row when you tap "Use as pain score".
      </p>
    </div>
  );
}
