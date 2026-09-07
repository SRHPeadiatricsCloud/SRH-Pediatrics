"use client";

import { AlertTriangle, Info, OctagonAlert, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ageBand,
  allLabFlags,
  dextroseConcForGir,
  girFromDextrose,
  growthFlags,
  interpretPain,
  interpretVitals,
  maintenanceFluidsMlPerDay,
  mapFromBP,
  neonatalDayFluidRange,
  consolidatedFlags,
  oiFrom,
  overallImpression,
  respFlags,
  type BabyLite,
  type Flag,
  type VitalsInput,
} from "@/lib/interpret";

const SEV_STYLE: Record<Flag["sev"], string> = {
  info: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
};

const SEV_ICON: Record<Flag["sev"], React.ReactNode> = {
  info: <Info size={12} />,
  warn: <AlertTriangle size={12} />,
  crit: <OctagonAlert size={12} />,
};

export function FlagsList({ flags, empty = "Within expected range." }: { flags: Flag[]; empty?: string }) {
  if (!flags.length)
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
        <Info size={12} /> {empty}
      </p>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <span
          key={`${f.key}-${i}`}
          title={f.note}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${SEV_STYLE[f.sev]}`}
        >
          {SEV_ICON[f.sev]}
          {f.label}
          {f.note && <span className="font-normal opacity-80">· {f.note}</span>}
        </span>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Stethoscope size={13} className="text-cyan-300" />
        <span className="lbl text-cyan-300">{title}</span>
        <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-500">provisional</span>
      </div>
      {children}
    </div>
  );
}

export function VitalsInterpretation({
  baby,
  v,
  painScale,
  painRaw,
}: {
  baby: BabyLite;
  v: VitalsInput & Record<string, unknown>;
  painScale?: string;
  painRaw?: number | null;
}) {
  const flags = useMemo(() => {
    const base = interpretVitals(baby, v);
    if (painScale && painRaw != null) base.push(...interpretPain(painScale, painRaw));
    return base;
  }, [baby, v, painScale, painRaw]);
  const derivedMap = mapFromBP((v.sbp as number | null) ?? null, (v.dbp as number | null) ?? null);
  const { band, pmaWeeks, years } = ageBand(baby);
  return (
    <Panel title="Provisional interpretation — vitals">
      <p className="mb-1.5 text-[10px] text-slate-400">
        Age band: <b className="text-slate-200">{band}</b>
        {band === "neonate" ? ` · PMA ${pmaWeeks.toFixed(1)} wk` : ` · ${years.toFixed(1)} yr`}
        {derivedMap != null && (
          <>
            {" "}
            · calculated MAP <b className="text-slate-200">{derivedMap}</b> mmHg
          </>
        )}
      </p>
      <FlagsList flags={flags} />
    </Panel>
  );
}

export function LabsInterpretation({ baby, labs }: { baby: BabyLite; labs: Record<string, string> }) {
  const flags = useMemo(() => allLabFlags(labs, baby), [labs, baby]);
  const filled = Object.values(labs).filter((x) => x && x.trim()).length;
  return (
    <Panel title="Provisional interpretation — investigations">
      {filled === 0 ? (
        <p className="text-[11px] text-slate-400">Enter lab values above to see flags (CBC, CRP, electrolytes, ABG, bilirubin).</p>
      ) : (
        <FlagsList flags={flags} empty="No out-of-range values detected." />
      )}
    </Panel>
  );
}

export function GrowthFlagsRow({
  velocity,
  lossPct,
  regained,
}: {
  velocity: number | null;
  lossPct: number;
  regained: boolean;
}) {
  const flags = useMemo(() => growthFlags(velocity, lossPct, regained), [velocity, lossPct, regained]);
  return <FlagsList flags={flags} empty="Growth within target." />;
}

/** Live fluids & GIR calculator with maintenance-fluid suggestion. */
export function FluidsCalcPanel({ baby }: { baby: BabyLite }) {
  const weightKg = Math.max(0.3, baby.currentWeight / 1000);
  const [dex, setDex] = useState(10);
  const [rate, setRate] = useState(80);
  const gir = girFromDextrose(dex, rate);
  const maint = maintenanceFluidsMlPerDay(weightKg);
  const neoRange = neonatalDayFluidRange(baby);
  const isNeo = baby.unit === "nicu" || baby.unit === "postnatal";
  const girFlag: Flag[] =
    gir < 4
      ? [{ key: "gir", label: "Low GIR (< 4)", sev: "warn", note: `${gir} mg/kg/min` }]
      : gir > 12
        ? [{ key: "gir", label: "High GIR (> 12) — central line", sev: "warn", note: `${gir}` }]
        : [{ key: "gir", label: "GIR within safe range", sev: "info", note: `${gir} mg/kg/min` }];
  return (
    <Panel title="Fluids & GIR calculator">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
          <span className="lbl mb-1 block">Dextrose %</span>
          <input
            className="inp !py-1 text-center text-sm font-bold"
            type="number"
            value={dex}
            min={0}
            max={25}
            step={0.5}
            onChange={(e) => setDex(Number(e.target.value) || 0)}
          />
        </label>
        <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
          <span className="lbl mb-1 block">IV rate ml/kg/day</span>
          <input
            className="inp !py-1 text-center text-sm font-bold"
            type="number"
            value={rate}
            min={0}
            max={250}
            step={5}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2">
          <div className="lbl">GIR</div>
          <div className="text-lg font-black tabular-nums text-cyan-200">{gir}</div>
          <div className="text-[9px] text-slate-400">mg/kg/min</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="lbl">D10 for GIR 6</div>
          <div className="text-lg font-black tabular-nums text-slate-100">
            {dextroseConcForGir(6, rate) || "—"}%
          </div>
          <div className="text-[9px] text-slate-400">at {rate} ml/kg/d</div>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="lbl">Maintenance (Holliday-Segar)</div>
          <div className="text-base font-black tabular-nums text-slate-100">{maint} ml/day</div>
          <div className="text-[9px] text-slate-400">
            ≈ {Math.round(maint / weightKg)} ml/kg/d @ {weightKg.toFixed(1)} kg
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="lbl">{isNeo ? "Neonatal day-fluid target" : "Suggested range"}</div>
          <div className="text-base font-black tabular-nums text-slate-100">
            {neoRange[0]}–{neoRange[1]}
          </div>
          <div className="text-[9px] text-slate-400">ml/kg/day</div>
        </div>
      </div>
      <FlagsList flags={girFlag} />
    </Panel>
  );
}

/** One-glance consolidated impression across vitals + labs + growth + respiratory. */
export function ConsolidatedImpression({
  baby,
  vitals,
  labs,
  growth,
  resp,
}: {
  baby: BabyLite;
  vitals?: (VitalsInput & Record<string, unknown>) | null;
  labs?: Record<string, string> | null;
  growth?: { velocity: number | null; lossPct: number; regained: boolean } | null;
  resp?: { map?: number | null; fio2?: number | null; pao2?: number | null; silverman?: number | null } | null;
}) {
  const flags = useMemo(
    () => consolidatedFlags({ baby, vitals, labs, growth, resp }),
    [baby, vitals, labs, growth, resp],
  );
  const imp = overallImpression(flags);
  const style =
    imp.sev === "crit"
      ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
      : imp.sev === "warn"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return (
    <Panel title="Consolidated provisional impression">
      <div className={`mb-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${style}`}>
        <span className="mr-1 inline-block align-middle">{SEV_ICON[imp.sev]}</span>
        {imp.text}
      </div>
      <FlagsList flags={flags} empty="All parameters within provisional range." />
    </Panel>
  );
}

/** Respiratory oxygenation interpretation (OI / Silverman / wean readiness). */
export function RespInterpretation({
  map,
  fio2,
  pao2,
  silverman,
  mode,
}: {
  map?: number | null;
  fio2?: number | null;
  pao2?: number | null;
  silverman?: number | null;
  mode?: string;
}) {
  const flags = useMemo(() => respFlags({ map, fio2, pao2, silverman, mode }), [map, fio2, pao2, silverman, mode]);
  const oi = oiFrom(map ?? null, fio2 ?? null, pao2 ?? null);
  return (
    <Panel title="Provisional interpretation — respiratory">
      <p className="mb-1.5 text-[10px] text-slate-400">
        Mode <b className="text-slate-200">{mode || "—"}</b>
        {oi != null && (
          <>
            {" "}· calculated OI <b className="text-slate-200">{oi}</b> (MAP×FiO₂×100/PaO₂)
          </>
        )}
        {oi == null && pao2 == null && <span className="text-slate-500"> · add PaO₂ (ABG) to auto-calculate OI</span>}
      </p>
      <FlagsList flags={flags} empty="Respiratory parameters acceptable." />
    </Panel>
  );
}

/** Compact flag chips for the unit board card. */
export function BoardFlagChips({
  baby,
  vitals,
  max = 3,
}: {
  baby: BabyLite;
  vitals: (VitalsInput & Record<string, unknown>) | null;
  max?: number;
}) {
  const flags = useMemo(() => (vitals ? interpretVitals(baby, vitals) : []), [baby, vitals]);
  const show = flags.filter((f) => f.sev !== "info").slice(0, max);
  if (!show.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {show.map((f, i) => (
        <span
          key={`${f.key}-${i}`}
          title={f.note}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${SEV_STYLE[f.sev]}`}
        >
          {SEV_ICON[f.sev]}
          {f.label}
        </span>
      ))}
    </div>
  );
}
