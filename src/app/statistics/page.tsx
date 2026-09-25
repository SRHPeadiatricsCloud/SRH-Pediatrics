"use client";

/**
 * Month-end statistics.
 *
 * A printable monthly report sitting next to the Keymaster list: census and
 * patient-days, every assessable parameter of the babies admitted that month
 * (demographics, acuity, interventions, growth & nutrition) and the overall
 * progress — outcomes, length of stay, mortality — with the previous month
 * alongside so trends are visible at a glance. All computation lives in
 * src/lib/stats.ts where it is unit-tested; this file only renders it.
 */
import { useMemo, useState } from "react";
import { BarChart3, Printer } from "lucide-react";
import { TopBar, Section, usePoll } from "@/components/ui";
import { UNIT_LIST } from "@/lib/units";
import { formatMonthLabel } from "@/lib/discharge";
import { computeMonthStats, type CountRow, type MonthStats, type StatBaby } from "@/lib/stats";

function localMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

/** Horizontal count bar used for every categorical parameter. */
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

/** Daily-census bar chart drawn with divs so it prints exactly as shown. */
function CensusChart({ stats }: { stats: MonthStats }) {
  const max = Math.max(1, ...stats.census.map((c) => c.n));
  return (
    <div>
      <div className="flex h-36 items-end gap-[2px]">
        {stats.census.map((c) => (
          <div key={c.day} className="group relative flex h-full flex-1 flex-col justify-end">
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
        <span>Day of month</span>
        <span>{stats.census[stats.census.length - 1]?.day.slice(8)}</span>
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

export default function StatisticsPage() {
  const { data } = usePoll<{ babies: StatBaby[] }>("/api/babies", 10000);
  const [month, setMonth] = useState<string>(localMonthNow());
  const [unit, setUnit] = useState<string>("all");

  const stats = useMemo(
    () => computeMonthStats(data?.babies ?? [], month, unit),
    [data, month, unit],
  );
  const n = stats.admissions;
  const g = stats.growth;
  const o = stats.outcomes;
  const unitLabel = unit === "all" ? "All units" : UNIT_LIST.find((u) => u.key === unit)?.short ?? unit;

  return (
    <div className="min-h-screen">
      <TopBar live />
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-5">
        {/* toolbar */}
        <div className="no-print card mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="flex items-center gap-2 text-sm font-black text-white">
            <BarChart3 size={16} className="text-cyan-300" /> Monthly statistics
          </span>
          <span className="hidden text-[11px] text-slate-400 md:inline">
            End-of-month report — census, every assessable parameter and overall progress.
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
            <button className="btn-ghost !py-1 text-[11px]" onClick={() => window.print()}>
              <Printer size={12} /> Print / PDF
            </button>
          </div>
        </div>

        {/* report heading */}
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-black text-white">{formatMonthLabel(month)} — {unitLabel}</h1>
          <p className="text-[11px] text-slate-400">
            Cohort of the month: {n} admission{n === 1 ? "" : "s"} · generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>

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

        {/* census curve + flow */}
        <Section
          title="Daily census & patient flow"
          sub="Babies physically in the unit each day, whenever they were admitted"
        >
          <CensusChart stats={stats} />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Patient-days" value={stats.patientDays} />
            <Tile label="Average daily census" value={stats.avgDailyCensus} />
            <Tile label="Peak census" value={stats.peakCensus} />
            <Tile label="Admissions in month" value={stats.admissions} />
          </div>
          {stats.admissionsByUnit.length > 0 && (
            <div className="mt-3">
              <h4 className="lbl mb-1">Admissions by unit</h4>
              <CountList rows={stats.admissionsByUnit} total={n} tone="bg-sky-400/70" />
            </div>
          )}
          {stats.censusByUnit.length > 0 && (
            <div className="mt-3">
              <h4 className="lbl mb-1">Currently in each unit</h4>
              <CountList rows={stats.censusByUnit} total={stats.censusByUnit.reduce((a, r) => a + r.n, 0)} tone="bg-emerald-400/70" />
            </div>
          )}
        </Section>

        {/* demographics */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section title="Demographics" sub={`Gestational age — ${n} admission${n === 1 ? "" : "s"}`}>
            <CountList rows={stats.gestBands} total={n} tone="bg-violet-400/70" />
            <h4 className="lbl mb-1 mt-3">Birth weight</h4>
            <CountList rows={stats.weightBands} total={n} tone="bg-fuchsia-400/70" />
          </Section>
          <Section title="Sex · place of birth · delivery">
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
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Apgar 5′ &lt; 7: <span className="font-bold text-white">{stats.apgar5Below7}</span> of {n}
              {" · "}Acuity on admission:
            </p>
            <CountList rows={stats.acuity} total={n} tone="bg-rose-400/70" />
          </Section>
          <Section title="Insurance & consultants">
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <h4 className="lbl mb-1">Insurance</h4>
                <CountList rows={stats.insurance} total={n} tone="bg-emerald-400/70" />
              </div>
              <div>
                <h4 className="lbl mb-1">Consultant</h4>
                <CountList rows={stats.consultants} total={n} tone="bg-cyan-400/70" />
              </div>
            </div>
          </Section>

          {/* interventions */}
          <Section title="Interventions" sub="From the event log, respiratory support, lines and drugs of the cohort">
            <CountList rows={stats.interventions} total={n} tone="bg-orange-400/70" />
          </Section>
        </div>

        {/* growth & nutrition */}
        <div className="mt-4">
          <Section
            title="Growth & nutrition"
            sub={
              g.withWeights
                ? `Weight charts available for ${g.withWeights} of ${n} babies`
                : "No two-point weight charts recorded for this cohort yet"
            }
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Tile label="Avg max weight loss" value={g.avgMaxLossPct === null ? "—" : `${g.avgMaxLossPct}%`} sub="from birth weight" />
              <Tile label="Avg day to regain birth weight" value={g.avgRegainDay ?? "—"} sub="day of life" />
              <Tile label="Avg weight velocity" value={g.avgVelocity === null ? "—" : `${g.avgVelocity}`} sub="g/kg/day" />
              <Tile label="Avg fluids (active cohort)" value={g.avgFluidsMlKgDay ?? "—"} sub="ml/kg/day today" />
              <Tile label="Human milk" value={g.humanMilkPct === null ? "—" : `${g.humanMilkPct}%`} sub="EBM / donor among active" />
            </div>
          </Section>
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
              Census, patient-days and departures count every baby present in the unit that month; demographics,
              interventions, growth and outcomes describe the cohort admitted in {formatMonthLabel(month)}. Dates are
              local calendar days, matching the discharge archive. Deleted charts are excluded.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
