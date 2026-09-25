"use client";

/**
 * Month-end statistics — the unit's monthly report.
 *
 * A printable, exportable deep-dive into one month of the unit: census and
 * patient flow, every assessable parameter of the babies admitted that month
 * (demographics, acuity, interventions, milestones, screening, growth,
 * nutrition, vitals quality, problems), outcomes split by gestational-age and
 * birth-weight band, and overall progress against the previous month. Data
 * comes from /api/statistics?month=…, the numbers are computed by
 * src/lib/stats.ts (unit-tested), the workbook by ./xlsx.ts, and the PDF is
 * the browser's print output — charts included.
 */
import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileSpreadsheet, Printer } from "lucide-react";
import { Section } from "@/components/ui";
import { UNIT_LIST } from "@/lib/units";
import { formatMonthLabel } from "@/lib/discharge";
import { computeMonthStats, dayKey, type CountRow, type MonthExtras, type MonthStats, type StatBaby } from "@/lib/stats";
import { exportStatsXlsx } from "./xlsx";

function localMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type ApiPayload = {
  babies: StatBaby[];
  vitals: MonthExtras["vitals"];
  problems: MonthExtras["problems"];
  handovers: MonthExtras["handovers"];
  tasks: MonthExtras["tasks"];
};

/* ---------------------------- small renderers ---------------------------- */

function Tile({ label, value, sub, tone = "white" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="card flex min-w-[130px] flex-1 flex-col px-4 py-3">
      <span className="lbl">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </div>
  );
}

function Delta({ cur, prev, goodWhenUp = true }: { cur: number; prev: number | undefined; goodWhenUp?: boolean }) {
  if (prev === undefined) return null;
  const d = cur - prev;
  if (d === 0) return <span className="text-[10px] font-semibold text-slate-400">= prev</span>;
  const good = d > 0 ? goodWhenUp : !goodWhenUp;
  return (
    <span className={`text-[10px] font-bold ${good ? "text-emerald-300" : "text-rose-300"}`}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)} vs prev
    </span>
  );
}

function BarRow({ label, n, total, tone = "bg-cyan-400/70" }: { label: string; n: number; total: number; tone?: string }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-[52%] truncate text-[11px] text-slate-300" title={label}>{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${total > 0 ? Math.max(n > 0 ? 3 : 0, pct) : 0}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right text-[11px] font-semibold text-slate-200">
        {n} <span className="text-slate-500">({pct}%)</span>
      </span>
    </div>
  );
}

function CountList({ rows, total, tone }: { rows: CountRow[]; total: number; tone?: string }) {
  if (!rows.length) return <p className="text-[11px] text-slate-500">Nothing recorded.</p>;
  return (
    <div>
      {rows.map((r) => (
        <BarRow key={r.label} label={r.label} n={r.n} total={total} tone={tone} />
      ))}
    </div>
  );
}

function CensusChart({ stats }: { stats: MonthStats }) {
  const max = Math.max(1, ...stats.census.map((c) => c.n));
  return (
    <div>
      <div className="flex h-36 items-end gap-[2px]">
        {stats.census.map((c) => (
          <div key={c.day} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={`w-full rounded-t ${c.n > 0 ? "bg-cyan-400/70" : "bg-slate-800"}`}
              style={{ height: `${(c.n / max) * 100}%`, minHeight: c.n > 0 ? 3 : 1 }}
              title={`${c.day}: ${c.n} babies`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-500">
        <span>{stats.census[0]?.day.slice(8)}</span>
        <span>Day of month — daily census</span>
        <span>{stats.census[stats.census.length - 1]?.day.slice(8)}</span>
      </div>
    </div>
  );
}

/** Admissions (up bars) vs departures (down bars) around a centre line. */
function FlowChart({ stats }: { stats: MonthStats }) {
  const max = Math.max(1, ...stats.flowByDay.map((f) => Math.max(f.admissions, f.departures)));
  return (
    <div>
      <div className="flex h-32 flex-col">
        <div className="flex h-1/2 items-end gap-[2px]">
          {stats.flowByDay.map((f) => (
            <div key={f.day} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t bg-emerald-400/70"
                style={{ height: `${(f.admissions / max) * 100}%`, minHeight: f.admissions > 0 ? 3 : 0 }}
                title={`${f.day}: ${f.admissions} admitted`}
              />
            </div>
          ))}
        </div>
        <div className="h-px bg-white/20" />
        <div className="flex h-1/2 items-start gap-[2px]">
          {stats.flowByDay.map((f) => (
            <div key={f.day} className="flex h-full flex-1 flex-col justify-start">
              <div
                className="w-full rounded-b bg-rose-400/60"
                style={{ height: `${(f.departures / max) * 100}%`, minHeight: f.departures > 0 ? 3 : 0 }}
                title={`${f.day}: ${f.departures} left`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400/70" />Admissions (up)</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400/60" />Departures (down)</span>
      </div>
    </div>
  );
}

function RangeRow({ label, r }: { label: string; r: { avg: number | null; min: number | null; max: number | null } }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px]">
      <span className="text-slate-300">{label}</span>
      <span className="font-semibold text-slate-100">
        {r.avg ?? "—"} <span className="text-[10px] font-normal text-slate-500">(min {r.min ?? "—"} · max {r.max ?? "—"})</span>
      </span>
    </div>
  );
}

function BandTable({ title, rows }: { title: string; rows: { label: string; admitted: number; deaths: number }[] }) {
  return (
    <div>
      <h4 className="lbl mb-1">{title}</h4>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
            <th className="pb-1">Band</th>
            <th className="pb-1 text-right">Admitted</th>
            <th className="pb-1 text-right">Deaths</th>
            <th className="pb-1 text-right">Mortality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right">{r.admitted}</td>
              <td className="py-1 text-right">{r.deaths}</td>
              <td className="py-1 text-right font-semibold">
                {r.admitted > 0 ? `${Math.round((r.deaths / r.admitted) * 1000) / 10}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

export function MonthReport() {
  const [month, setMonth] = useState<string>(localMonthNow());
  const [unit, setUnit] = useState<string>("all");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  /** Which month the loaded payload belongs to — the spinner shows while it lags. */
  const [loadedFor, setLoadedFor] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const loading = loadedFor !== month;

  useEffect(() => {
    let alive = true;
    fetch(`/api/statistics?month=${month}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) {
          setPayload(j as ApiPayload);
          setLoadedFor(month);
        }
      })
      .catch(() => {
        /* offline — keep the last snapshot */
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const stats = useMemo(
    () =>
      computeMonthStats(payload?.babies ?? [], month, unit, new Date(), {
        vitals: payload?.vitals ?? [],
        problems: payload?.problems ?? [],
        handovers: payload?.handovers ?? [],
        tasks: payload?.tasks ?? [],
      }),
    [payload, month, unit],
  );

  const n = stats.admissions;
  const g = stats.growth;
  const o = stats.outcomes;
  const v = stats.vitals;
  const unitLabel = unit === "all" ? "All units" : UNIT_LIST.find((u) => u.key === unit)?.short ?? unit;

  const doExportXlsx = async () => {
    setExporting(true);
    try {
      await exportStatsXlsx(stats);
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-5">
        {/* toolbar */}
        <div className="no-print card mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="flex items-center gap-2 text-sm font-black text-white">
            <BarChart3 size={16} className="text-cyan-300" /> Monthly statistics
          </span>
          <span className="hidden text-[11px] text-slate-400 md:inline">
            Deep month-end report — every parameter, census & overall progress. Export as Excel or PDF.
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400">
              Month{" "}
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="ml-1 rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-[12px] font-semibold text-white"
              />
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-[12px] font-semibold text-white"
              aria-label="Unit filter"
            >
              <option value="all">All units</option>
              {UNIT_LIST.map((u) => (
                <option key={u.key} value={u.key}>{u.short}</option>
              ))}
            </select>
            <button className="btn-ghost !py-1 text-[11px]" onClick={doExportXlsx} disabled={exporting}>
              <FileSpreadsheet size={12} /> {exporting ? "Building…" : "Export Excel"}
            </button>
            <button className="btn-ghost !py-1 text-[11px]" onClick={() => window.print()}>
              <Printer size={12} /> Export PDF
            </button>
          </div>
        </div>

        {/* report heading */}
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-black text-white">{formatMonthLabel(month)} — {unitLabel}</h1>
          <p className="text-[11px] text-slate-400">
            Cohort of the month: {n} admission{n === 1 ? "" : "s"}
            {" · "}generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>

        {loading && (
          <div className="card mb-4 p-8 text-center text-sm text-slate-400">
            Loading {formatMonthLabel(month)} from the cloud…
          </div>
        )}
        {!loading && (
          <>

        {/* glance tiles */}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Tile label="Admissions" value={stats.admissions} sub={stats.prev ? `prev ${stats.prev.admissions}` : undefined} />
          <Tile label="Departures" value={stats.departures.total} sub={`${stats.departures.discharged} home · ${stats.departures.transferred} transferred`} />
          <Tile label="Deaths" value={stats.departures.death} tone={stats.departures.death > 0 ? "text-rose-300" : "text-white"} />
          <Tile label="End-of-month census" value={stats.endOfPeriodCensus} sub="on the last day" />
          <Tile label="Patient-days" value={stats.patientDays} sub={stats.prev ? `prev ${stats.prev.patientDays}` : undefined} />
          <Tile label="Avg daily census" value={stats.avgDailyCensus} sub={`peak ${stats.peakCensus}`} />
          <Tile label="Avg length of stay" value={o.avgLosDays ?? "—"} sub="days, cohort who left" />
          <Tile label="Mortality" value={o.mortalityPct === null ? "—" : `${o.mortalityPct}%`} sub="of discharges + deaths" tone={o.mortalityPct && o.mortalityPct > 0 ? "text-rose-300" : "text-emerald-300"} />
        </div>

        {/* census & flow */}
        <Section title="Daily census & patient flow" sub="Census is every baby physically in the unit; flow counts the cohort admitted and everyone who left">
          <div className="grid gap-6 lg:grid-cols-2">
            <CensusChart stats={stats} />
            <FlowChart stats={stats} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Patient-days" value={stats.patientDays} />
            <Tile label="Average daily census" value={stats.avgDailyCensus} />
            <Tile label="Peak census" value={stats.peakCensus} />
            <Tile label="Admissions in month" value={stats.admissions} />
          </div>
          {stats.admissionsByUnit.length > 0 && (
            <div className="mt-3 grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="lbl mb-1">Admissions by unit</h4>
                <CountList rows={stats.admissionsByUnit} total={n} tone="bg-sky-400/70" />
              </div>
              {stats.censusByUnit.length > 0 && (
                <div>
                  <h4 className="lbl mb-1">Currently in each unit</h4>
                  <CountList rows={stats.censusByUnit} total={stats.censusByUnit.reduce((a, r) => a + r.n, 0)} tone="bg-emerald-400/70" />
                </div>
              )}
            </div>
          )}
        </Section>

        {/* demographics */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Demographics — gestation & birth weight" sub={`Cohort of ${n}`}>
            <CountList rows={stats.gestBands} total={n} tone="bg-violet-400/70" />
            <h4 className="lbl mb-1 mt-3">Birth weight</h4>
            <CountList rows={stats.weightBands} total={n} tone="bg-fuchsia-400/70" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <span>Mean birth length: <b className="text-slate-200">{stats.meanBirthLength ?? "—"} cm</b></span>
              <span>Mean head circ.: <b className="text-slate-200">{stats.meanBirthHc ?? "—"} cm</b></span>
            </div>
          </Section>
          <Section title="Sex · place · delivery · acuity">
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <h4 className="lbl mb-1">Sex</h4>
                <CountList rows={stats.sex} total={n} tone="bg-sky-400/70" />
                <h4 className="lbl mb-1 mt-3">Place of birth</h4>
                <CountList rows={stats.place} total={n} tone="bg-teal-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Delivery mode</h4>
                <CountList rows={stats.deliveryModes} total={n} tone="bg-amber-400/70" />
                <h4 className="lbl mb-1 mt-3">Acuity on admission</h4>
                <CountList rows={stats.acuity} total={n} tone="bg-rose-400/70" />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Apgar 5′ &lt; 7: <span className="font-bold text-white">{stats.apgar5Below7}</span> of {n}
              {" · "}Apgar 1′ &lt; 7: <span className="font-bold text-white">{stats.apgar1Below7}</span> of {n}
            </p>
          </Section>
          <Section title="Insurance · consultants · blood groups">
            <div className="grid grid-cols-3 gap-x-6">
              <div>
                <h4 className="lbl mb-1">Insurance</h4>
                <CountList rows={stats.insurance} total={n} tone="bg-emerald-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Consultant</h4>
                <CountList rows={stats.consultants} total={n} tone="bg-cyan-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Blood group</h4>
                <CountList rows={stats.bloodGroups} total={n} tone="bg-red-400/70" />
              </div>
            </div>
          </Section>

          {/* interventions & events */}
          <Section title="Interventions · milestones · screening" sub="From the event log, respiratory support, lines and drugs">
            <div className="grid gap-x-6 md:grid-cols-3">
              <div>
                <h4 className="lbl mb-1">Interventions</h4>
                <CountList rows={stats.interventions} total={n} tone="bg-orange-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Feeding milestones</h4>
                <CountList rows={stats.milestones} total={n} tone="bg-lime-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Screening & imaging</h4>
                <CountList rows={stats.screens} total={n} tone="bg-indigo-400/70" />
              </div>
            </div>
          </Section>
        </div>

        {/* respiratory, lines, drugs snapshot */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Section title="Respiratory support now" sub="Active cohort">
            <CountList rows={stats.respiratoryModes} total={Math.max(1, stats.respiratoryModes.reduce((a, r) => a + r.n, 0))} tone="bg-sky-400/70" />
          </Section>
          <Section title="Lines in situ" sub="Recorded for the cohort">
            <CountList rows={stats.lines} total={Math.max(1, stats.lines.reduce((a, r) => a + r.n, 0))} tone="bg-yellow-400/70" />
          </Section>
          <Section title="Medications" sub={`${stats.drugs.babiesOnDrugs} babies on drugs`}>
            <CountList rows={stats.drugs.top} total={Math.max(1, stats.drugs.top.reduce((a, r) => a + r.n, 0))} tone="bg-pink-400/70" />
          </Section>
        </div>

        {/* growth & nutrition */}
        <div className="mt-4">
          <Section
            title="Growth & nutrition"
            sub={g.withWeights ? `Weight charts for ${g.withWeights} of ${n} babies` : "No two-point weight charts recorded yet"}
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Tile label="Avg max weight loss" value={g.avgMaxLossPct === null ? "—" : `${g.avgMaxLossPct}%`} sub="from birth weight" />
              <Tile label="Avg day to regain" value={g.avgRegainDay ?? "—"} sub="birth weight, DOL" />
              <Tile label="Avg weight velocity" value={g.avgVelocity === null ? "—" : `${g.avgVelocity}`} sub="g/kg/day" />
              <Tile label="Avg fluids (active)" value={g.avgFluidsMlKgDay ?? "—"} sub="ml/kg/day" />
              <Tile label="Human milk" value={g.humanMilkPct === null ? "—" : `${g.humanMilkPct}%`} sub="EBM / donor" />
            </div>
            <div className="mt-3 grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="lbl mb-1">Weight-velocity categories</h4>
                <CountList rows={stats.growthCategories} total={Math.max(1, stats.growthCategories.reduce((a, r) => a + r.n, 0))} tone="bg-emerald-400/70" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Tile label="Avg GIR (active)" value={stats.avgGir ?? "—"} sub="mg/kg/min" />
                <Tile label="Avg kcal (active)" value={stats.avgKcal ?? "—"} sub="kcal/kg/day" />
                <Tile label="On TPN" value={stats.tpnBabies} sub="active cohort" />
              </div>
            </div>
          </Section>
        </div>

        {/* vitals & problems */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Observations & monitoring" sub={`${v.observations} observations on ${v.babies} babies this month`}>
            <RangeRow label="Heart rate (bpm)" r={v.hr} />
            <RangeRow label="Respiratory rate (/min)" r={v.rr} />
            <RangeRow label="SpO₂ (%)" r={v.spo2} />
            <RangeRow label="Temperature (°C)" r={v.temp} />
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
              <Tile label="Fever ≥38 °C" value={v.fever} tone={v.fever > 0 ? "text-rose-300" : "text-white"} />
              <Tile label="Hypothermia <36 °C" value={v.hypothermia} tone={v.hypothermia > 0 ? "text-rose-300" : "text-white"} />
              <Tile label="Hypoglycaemia" value={v.hypoglycemia} sub="RBS <47" tone={v.hypoglycemia > 0 ? "text-amber-300" : "text-white"} />
              <Tile label="Desaturations" value={v.desaturations} sub="SpO₂ <90" tone={v.desaturations > 0 ? "text-amber-300" : "text-white"} />
              <Tile label="Avg urine" value={v.avgUrine ?? "—"} sub="ml/kg/hr" />
            </div>
          </Section>
          <Section title="Problems" sub={`${stats.problems.newCount} new this month · ${stats.problems.active} still active · ${stats.problems.resolved} resolved`}>
            <div className="grid gap-x-6 md:grid-cols-2">
              <div>
                <h4 className="lbl mb-1">Top new problems</h4>
                <CountList rows={stats.problems.top} total={Math.max(1, stats.problems.newCount)} tone="bg-rose-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">By system</h4>
                <CountList rows={stats.problems.bySystem} total={Math.max(1, stats.problems.newCount)} tone="bg-orange-400/70" />
              </div>
            </div>
          </Section>
        </div>

        {/* outcomes by band */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Mortality by band" sub="Deaths among the cohort, split by gestation and birth weight">
            <div className="grid gap-x-8 md:grid-cols-2">
              <BandTable title="Gestational age" rows={stats.mortalityByGa} />
              <BandTable title="Birth weight" rows={stats.mortalityByWeight} />
            </div>
          </Section>
          <Section title="Length of stay by band" sub="Average days for cohort babies who left the unit">
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <h4 className="lbl mb-1">Gestational age</h4>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {stats.losByGa.map((r) => (
                      <tr key={r.label}>
                        <td className="py-1">{r.label}</td>
                        <td className="py-1 text-right text-slate-500">{r.discharged} left</td>
                        <td className="py-1 text-right font-semibold">{r.avgLos ?? "—"} d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="lbl mb-1">Birth weight</h4>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {stats.losByWeight.map((r) => (
                      <tr key={r.label}>
                        <td className="py-1">{r.label}</td>
                        <td className="py-1 text-right text-slate-500">{r.discharged} left</td>
                        <td className="py-1 text-right font-semibold">{r.avgLos ?? "—"} d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        </div>

        {/* ward activity */}
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label="Handovers" value={stats.activity.handovers} sub={`${stats.activity.acknowledged} acknowledged`} />
          <Tile label="Tasks created" value={stats.activity.tasksCreated} sub={`${stats.activity.tasksDone} completed`} />
          <Tile label="Blood cultures / antibiotics" value={`${stats.interventions.find((r) => r.label === "Blood culture sent")?.n ?? 0} / ${stats.interventions.find((r) => r.label === "Antibiotics")?.n ?? 0}`} sub="cohort" />
          <Tile label="Observations per baby" value={v.babies > 0 ? Math.round(v.observations / v.babies) : "—"} sub="mean this month" />
        </div>

        {/* outcomes & progress */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Outcomes of this month's cohort" sub="Where each admitted baby is now">
            <CountList
              total={n}
              tone="bg-emerald-400/70"
              rows={[
                { label: "Still in unit", n: o.active },
                { label: "Discharged home", n: o.discharged },
                { label: "Transferred", n: o.transferred },
                { label: "Death", n: o.death },
              ]}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Tile label="Mortality" value={o.mortalityPct === null ? "—" : `${o.mortalityPct}%`} sub="deaths ÷ (discharges + deaths)" tone="text-rose-300" />
              <Tile label="Survival to discharge" value={o.survivalToDischargePct === null ? "—" : `${o.survivalToDischargePct}%`} tone="text-emerald-300" />
            </div>
          </Section>
          <Section
            title="Overall progress"
            sub={stats.prev ? `Compared with ${formatMonthLabel(stats.prev.month)}` : "First month on record"}
          >
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-1">Measure</th>
                  <th className="pb-1 text-right">{formatMonthLabel(month)}</th>
                  {stats.prev && <th className="pb-1 text-right">{formatMonthLabel(stats.prev.month)}</th>}
                  <th className="pb-1 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                <tr>
                  <td className="py-1.5">Admissions</td>
                  <td className="py-1.5 text-right font-bold">{stats.admissions}</td>
                  {stats.prev && <td className="py-1.5 text-right text-slate-400">{stats.prev.admissions}</td>}
                  <td className="py-1.5 text-right"><Delta cur={stats.admissions} prev={stats.prev?.admissions} /></td>
                </tr>
                <tr>
                  <td className="py-1.5">Departures</td>
                  <td className="py-1.5 text-right font-bold">{stats.departures.total}</td>
                  {stats.prev && <td className="py-1.5 text-right text-slate-400">{stats.prev.departures}</td>}
                  <td className="py-1.5 text-right"><Delta cur={stats.departures.total} prev={stats.prev?.departures} /></td>
                </tr>
                <tr>
                  <td className="py-1.5">Deaths</td>
                  <td className="py-1.5 text-right font-bold">{stats.departures.death}</td>
                  {stats.prev && <td className="py-1.5 text-right text-slate-400">{stats.prev.deaths}</td>}
                  <td className="py-1.5 text-right"><Delta cur={stats.departures.death} prev={stats.prev?.deaths} goodWhenUp={false} /></td>
                </tr>
                <tr>
                  <td className="py-1.5">Patient-days</td>
                  <td className="py-1.5 text-right font-bold">{stats.patientDays}</td>
                  {stats.prev && <td className="py-1.5 text-right text-slate-400">{stats.prev.patientDays}</td>}
                  <td className="py-1.5 text-right"><Delta cur={stats.patientDays} prev={stats.prev?.patientDays} /></td>
                </tr>
                <tr>
                  <td className="py-1.5">Average daily census</td>
                  <td className="py-1.5 text-right font-bold">{stats.avgDailyCensus}</td>
                  {stats.prev && <td className="py-1.5 text-right text-slate-400">{stats.prev.avgDailyCensus}</td>}
                  <td className="py-1.5 text-right"><Delta cur={stats.avgDailyCensus} prev={stats.prev?.avgDailyCensus} /></td>
                </tr>
                <tr>
                  <td className="py-1.5">Avg length of stay (left cohort)</td>
                  <td className="py-1.5 text-right font-bold">{o.avgLosDays ?? "—"}</td>
                  <td className="py-1.5 text-right text-slate-400">—</td>
                  <td className="py-1.5 text-right text-[10px] text-slate-500">days</td>
                </tr>
                <tr>
                  <td className="py-1.5">Avg discharge weight</td>
                  <td className="py-1.5 text-right font-bold">{o.avgDischargeWeightG ? `${o.avgDischargeWeightG} g` : "—"}</td>
                  <td className="py-1.5 text-right text-slate-400">—</td>
                  <td className="py-1.5 text-right text-[10px] text-slate-500">grams</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Census, patient-days and departures count every baby present that month; demographics, interventions,
              growth and outcomes describe the cohort admitted in {formatMonthLabel(month)}. Dates are local calendar
              days, matching the discharge archive. Deleted charts are excluded.
            </p>
          </Section>
        </div>

        {/* admissions register */}
        <div className="mt-4">
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-bold text-white">
              Admissions register — {n} babies
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                    <th className="pb-1 pr-2">UHID</th>
                    <th className="pb-1 pr-2">Name</th>
                    <th className="pb-1 pr-2">Unit</th>
                    <th className="pb-1 pr-2">Sex</th>
                    <th className="pb-1 pr-2">GA</th>
                    <th className="pb-1 pr-2">BW (g)</th>
                    <th className="pb-1 pr-2">Delivery</th>
                    <th className="pb-1 pr-2">Admitted</th>
                    <th className="pb-1 pr-2">Status</th>
                    <th className="pb-1 pr-2">Consultant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {stats.cohort.map((b) => (
                    <tr key={b.id}>
                      <td className="py-1 pr-2 text-slate-400">{b.uhid}</td>
                      <td className="py-1 pr-2 font-semibold">{b.babyName}</td>
                      <td className="py-1 pr-2 uppercase">{b.unit}</td>
                      <td className="py-1 pr-2">{b.sex}</td>
                      <td className="py-1 pr-2">{b.gestWeeks}+{b.gestDays ?? 0}</td>
                      <td className="py-1 pr-2">{b.birthWeight}</td>
                      <td className="py-1 pr-2">{b.deliveryMode}</td>
                      <td className="py-1 pr-2">{dayKey(b.createdAt)}</td>
                      <td className="py-1 pr-2">{b.status}</td>
                      <td className="py-1 pr-2">{b.consultant || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
          </>
        )}
    </main>
  );
}
