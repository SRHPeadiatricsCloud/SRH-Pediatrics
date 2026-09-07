"use client";

import { useMemo, useState } from "react";
import { NumField, Section } from "@/components/ui";
import { FlagsList } from "@/components/interpret-ui";
import { WeightInput } from "@/components/weight-input";
import type { Clinical, GrowthEntry } from "@/lib/clinical";
import { anthropometryFlags, growthFlags } from "@/lib/interpret";
import { calcNutrition, fmtTime, gainGPerKgDay } from "@/lib/clinical";

type BabyLite = {
  dob: string;
  birthWeight: number;
  currentWeight: number;
  gestWeeks: number;
  gestDays?: number;
  unit: string;
  birthHc?: number;
  birthLength?: number;
  clinical: Clinical;
};

type Row = {
  at: string;
  dol: number;
  weight: number;
  deltaPrev: number;
  velocity: number | null;
  cumDelta: number;
  cumPct: number;
  lossPct: number;
  kcal: number;
  protein: number;
  fluids: number;
  hc?: number;
  length?: number;
  note?: string;
  flag: { text: string; cls: string } | null;
};

export function DailyProgressTab({
  baby,
  patch,
  user,
}: {
  baby: BabyLite;
  patch: (b: Record<string, unknown>) => Promise<void>;
  user: string;
}) {
  const c = baby.clinical ?? {};
  const n = useMemo(() => calcNutrition(c), [c]);
  const useKg = baby.unit !== "nicu";
  const [w, setW] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const entries = useMemo(
    () => [...(c.growth ?? [])].sort((a, z) => +new Date(a.at) - +new Date(z.at)),
    [c.growth],
  );

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    entries.forEach((e, i) => {
      const prev = i > 0 ? entries[i - 1].weight : baby.birthWeight;
      const prevAt = i > 0 ? entries[i - 1].at : baby.dob;
      const days = Math.max(0.5, (+new Date(e.at) - +new Date(prevAt)) / 86400000);
      const cumDelta = e.weight - baby.birthWeight;
      const cumPct = Math.round((cumDelta / baby.birthWeight) * 1000) / 10;
      const vel = gainGPerKgDay(prev, e.weight, days);
      const lossPct = cumPct < 0 ? Math.abs(cumPct) : 0;

      let flag: Row["flag"] = null;
      if (lossPct > 15) flag = { text: "Loss >15% — urgent review", cls: "bg-rose-500/20 text-rose-300" };
      else if (lossPct > 10) flag = { text: "Loss >10%", cls: "bg-amber-500/20 text-amber-300" };
      else if (cumDelta >= 0 && (i === 0 || entries[i - 1].weight < baby.birthWeight))
        flag = { text: "Birth weight regained", cls: "bg-emerald-500/20 text-emerald-300" };
      else if ((vel ?? 0) >= 15) flag = { text: "Target gain ✓", cls: "bg-emerald-500/20 text-emerald-300" };
      else if (cumDelta > 0 && (vel ?? 0) < 10 && (vel ?? 0) >= 0)
        flag = { text: "Slow gain <10 g/kg/d", cls: "bg-amber-500/20 text-amber-300" };

      out.push({
        at: e.at,
        dol: Math.max(0, Math.floor((+new Date(e.at) - +new Date(baby.dob)) / 86400000)),
        weight: e.weight,
        deltaPrev: e.weight - prev,
        velocity: vel,
        cumDelta,
        cumPct,
        lossPct,
        kcal: e.kcal ?? n.totalKcal,
        protein: e.protein ?? n.totalProtein,
        fluids: e.fluids ?? n.totalFluids,
        hc: e.hc,
        length: e.length,
        note: e.note,
        flag,
      });
    });
    return out;
  }, [entries, baby.birthWeight, baby.dob, n.totalKcal, n.totalProtein, n.totalFluids]);

  // ---- cumulative summary -------------------------------------------------
  const nadir = rows.length ? rows.reduce((a, b) => (b.weight < a.weight ? b : a)) : null;
  const maxLossPct = nadir ? Math.max(0, Math.round(((baby.birthWeight - nadir.weight) / baby.birthWeight) * 1000) / 10) : 0;
  const regained = rows.find((r) => r.weight >= baby.birthWeight && r.dol > (nadir?.dol ?? 0));
  const latest = rows.at(-1);
  const last3 = rows.slice(-3).map((r) => r.velocity ?? 0).filter((v) => v !== 0);
  const avgVel = last3.length ? Math.round((last3.reduce((a, b) => a + b, 0) / last3.length) * 10) / 10 : null;
  const totalGain = latest ? latest.weight - baby.birthWeight : 0;

  const recordToday = async () => {
    if (!w) return;
    setSaving(true);
    const grams = useKg ? Math.round(w * 1000) : Math.round(w);
    const entry: GrowthEntry = {
      at: new Date().toISOString(),
      weight: grams,
      kcal: n.totalKcal,
      protein: n.totalProtein,
      fluids: n.totalFluids,
      note: "auto-compiled daily progress",
    };
    await patch({
      currentWeight: grams,
      clinical: { growth: [...entries, entry] },
      logEvent: {
        kind: "growth",
        text: `Daily progress compiled — weight ${useKg ? `${w} kg` : `${grams} g`}, ${n.totalKcal} kcal/kg/day, protein ${n.totalProtein} g/kg/day`,
        author: user,
      },
    });
    setW(undefined);
    setSaving(false);
  };

  const growthFlagList = useMemo(
    () => growthFlags(avgVel, -(maxLossPct), regained ? true : totalGain >= 0 ? true : false),
    [avgVel, maxLossPct, regained, totalGain],
  );
  const anthroFlagList = useMemo(
    () => anthropometryFlags({ ...baby, gestDays: baby.gestDays ?? 0 }, latest?.hc ?? baby.birthHc ?? null, latest?.length ?? baby.birthLength ?? null),
    [baby, latest, baby.birthHc, baby.birthLength],
  );
  const flags = useMemo(() => [...growthFlagList, ...anthroFlagList], [growthFlagList, anthroFlagList]);
  const kcalPct = Math.min(100, Math.round((n.totalKcal / n.kcalTarget[1]) * 100));
  const protPct = Math.min(100, Math.round((n.totalProtein / n.proteinTarget[1]) * 100));

  return (
    <div className="space-y-3">
      {/* ---------------- summary tiles ---------------- */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Tile k="Birth weight" v={`${baby.birthWeight} g`} />
        <Tile k="Current weight" v={`${latest?.weight ?? baby.currentWeight} g`} tone="text-cyan-300" />
        <Tile
          k="Total change"
          v={`${totalGain > 0 ? "+" : ""}${totalGain} g`}
          tone={totalGain >= 0 ? "text-emerald-300" : "text-rose-300"}
        />
        <Tile
          k="Cumulative loss (max)"
          v={`${maxLossPct}%`}
          tone={maxLossPct > 10 ? "text-rose-300" : "text-amber-300"}
        />
        <Tile
          k="Regained BW"
          v={regained ? `Day ${regained.dol}` : totalGain >= 0 ? "Yes" : "Not yet"}
          tone={regained || totalGain >= 0 ? "text-emerald-300" : "text-amber-300"}
        />
        <Tile
          k="Avg velocity"
          v={avgVel !== null ? `${avgVel} g/kg/d` : "—"}
          tone={(avgVel ?? 0) >= 15 ? "text-emerald-300" : "text-amber-300"}
        />
      </div>

      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="lbl text-cyan-300">Provisional anthropometry &amp; growth interpretation</span>
          <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-500">decision support</span>
        </div>
        <FlagsList flags={flags} empty="Add serial weights with HC and length for a provisional interpretation." />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ---------------- calorie auto-calculator ---------------- */}
        <Section
          title="Energy & protein auto-calculator"
          sub="Computed live from the feed type, volume and TPN prescription"
        >
          <div className="space-y-1.5 text-xs">
            <Line k="Feed" v={`${n.feedType} @ ${n.density} kcal/ml`} />
            <Line k="Enteral" v={`${n.enteralMl} ml/kg/d → ${n.enteralKcal} kcal/kg/d`} />
            <Line k="Dextrose" v={`GIR ${n.gir} → ${n.dextroseG} g/kg/d → ${n.dextroseKcal} kcal/kg/d`} />
            <Line k="Amino acid" v={`${n.aaG} g/kg/d → ${n.aaKcal} kcal/kg/d`} />
            <Line k="Lipid" v={`${n.lipidG} g/kg/d → ${n.lipidKcal} kcal/kg/d`} />
            <Line k="Parenteral" v={`${n.ivKcal} kcal/kg/d`} />
          </div>

          <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="lbl">Total energy</span>
              <span className="text-xl font-black tabular-nums text-cyan-300">
                {n.totalKcal} <span className="text-[10px] font-normal">kcal/kg/day</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${n.totalKcal >= n.kcalTarget[0] ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${kcalPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Target {n.kcalTarget[0]}–{n.kcalTarget[1]} kcal/kg/day ·{" "}
              {n.kcalDeficit >= 0 ? (
                <span className="text-emerald-300">+{n.kcalDeficit} above minimum ✓</span>
              ) : (
                <span className="text-amber-300">{Math.abs(n.kcalDeficit)} kcal/kg/day short</span>
              )}
            </p>

            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="lbl">Total protein</span>
              <span className="text-lg font-black tabular-nums text-violet-300">
                {n.totalProtein} <span className="text-[10px] font-normal">g/kg/day</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${n.totalProtein >= n.proteinTarget[0] ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${protPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Target {n.proteinTarget[0]}–{n.proteinTarget[1]} g/kg/day ·{" "}
              {n.proteinDeficit >= 0 ? (
                <span className="text-emerald-300">adequate ✓</span>
              ) : (
                <span className="text-amber-300">{Math.abs(n.proteinDeficit)} g/kg/day short</span>
              )}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <Tile
              k="Total fluids"
              v={`${n.totalFluids} ml/kg/d`}
              sub={`${Math.round((n.totalFluids * (latest?.weight ?? baby.currentWeight)) / 1000)} ml/day`}
            />
            <Tile
              k="Energy per feed"
              v={`${Math.round((c.fluids?.feedVol ?? 0) * n.density)} kcal`}
              sub={`${c.fluids?.feedVol ?? 0} ml ${c.fluids?.feedFreq ?? ""}`}
            />
          </div>
        </Section>

        {/* ---------------- daily table ---------------- */}
        <div className="lg:col-span-2">
          <Section
            title="Daily progress — auto-compiled"
            sub="Weight gain / loss, cumulative loss from birth weight, velocity and calories for every day"
            right={
              <div className="flex items-end gap-1.5">
                <div className="w-32">
                  <WeightInput
                    label="Today's weight"
                    valueGrams={w != null ? (useKg ? Math.round(w * 1000) : w) : undefined}
                    onChangeGrams={(g) => setW(useKg ? g / 1000 : g)}
                    neonatal={!useKg}
                  />
                </div>
                <button className="btn-primary" onClick={recordToday} disabled={!w || saving}>
                  {saving ? "Saving…" : "Compile today"}
                </button>
              </div>
            }
          >
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-900/95 text-slate-400">
                  <tr>
                    <th className="p-1">DOL</th>
                    <th>Date</th>
                    <th>Weight</th>
                    <th>HC</th>
                    <th>Length</th>
                    <th>Δ / day</th>
                    <th>g/kg/d</th>
                    <th>Cum. Δ</th>
                    <th>Cum. loss</th>
                    <th>kcal/kg/d</th>
                    <th>Protein</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-white/5 bg-white/5">
                    <td className="p-1 font-bold text-slate-300">0</td>
                    <td className="whitespace-nowrap text-slate-400">{fmtTime(baby.dob).slice(0, 11)}</td>
                    <td className="font-bold tabular-nums text-white">{baby.birthWeight} g</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-slate-500">—</td>
                    <td className="text-[9px] uppercase text-cyan-300">birth weight</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.at} className="border-t border-white/5">
                      <td className="p-1 font-bold tabular-nums text-slate-300">{r.dol}</td>
                      <td className="whitespace-nowrap text-slate-400">{fmtTime(r.at).slice(0, 11)}</td>
                      <td className="font-bold tabular-nums text-white">{r.weight} g</td>
                      <td className="tabular-nums text-slate-300">{r.hc ?? "—"}</td>
                      <td className="tabular-nums text-slate-300">{r.length ?? "—"}</td>
                      <td className={`tabular-nums ${r.deltaPrev < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                        {r.deltaPrev > 0 ? "+" : ""}
                        {r.deltaPrev} g
                      </td>
                      <td
                        className={`tabular-nums ${
                          (r.velocity ?? 0) >= 15
                            ? "text-emerald-300"
                            : (r.velocity ?? 0) < 0
                              ? "text-rose-300"
                              : "text-amber-300"
                        }`}
                      >
                        {r.velocity ?? "—"}
                      </td>
                      <td className={`tabular-nums ${r.cumDelta < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                        {r.cumDelta > 0 ? "+" : ""}
                        {r.cumDelta} g ({r.cumPct > 0 ? "+" : ""}
                        {r.cumPct}%)
                      </td>
                      <td
                        className={`tabular-nums font-bold ${
                          r.lossPct > 10 ? "text-rose-300" : r.lossPct > 0 ? "text-amber-300" : "text-slate-500"
                        }`}
                      >
                        {r.lossPct > 0 ? `−${r.lossPct}%` : "—"}
                      </td>
                      <td className="tabular-nums text-cyan-300">{r.kcal}</td>
                      <td className="tabular-nums text-violet-300">{r.protein}</td>
                      <td>
                        {r.flag && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${r.flag.cls}`}>
                            {r.flag.text}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-4 text-center text-slate-400">
                        No daily weights yet — enter today&apos;s weight and tap “Compile today”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[10px] text-slate-400">
              Auto-rules (AAP / NNF / IAP): acceptable early loss ≤10% term and ≤15% preterm by day 5–7 · regain
              birth weight by day 10–14 · target velocity 15–20 g/kg/day · energy 110–135 kcal/kg/day · protein
              3.5–4 g/kg/day.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Tile({ k, v, sub, tone = "text-white" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="lbl truncate">{k}</div>
      <div className={`text-base font-black tabular-nums ${tone}`}>{v}</div>
      {sub && <div className="text-[9px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
      <span className="text-slate-400">{k}</span>
      <span className="text-right font-semibold text-slate-100">{v}</span>
    </div>
  );
}
