"use client";

/**
 * Level III-B NICU Analytics & Quality-Improvement dashboard.
 *
 * The full dataset (every chart, observation and problem) is pulled from the
 * backup store endpoint and run through the unit-tested engine in
 * src/lib/analytics.ts. The page renders the report in the order of the QI
 * framework: data quality → activity → case mix → mortality → risk
 * adjustment → every morbidity domain → LOS & discharge → trends → the
 * quality-indicator dashboard → Pareto, subgroups and honest data gaps.
 *
 * Nothing is invented: fields the unit has not captured show as coverage
 * gaps, never as fabricated numbers. Export produces the same figures as an
 * Excel workbook, and Export PDF prints this page with its charts.
 */
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, LineChart, Printer } from "lucide-react";
import { Section } from "@/components/ui";
import { computeAnalytics, type AnalyticsBaby, type CountRow, type Rate } from "@/lib/analytics";
import { exportAnalyticsXlsx } from "./qi-xlsx";

type Pack = {
  baby: AnalyticsBaby;
  problems: { babyId: number; system: string; label: string; status: string; onsetAt: string; resolvedAt?: string | null }[];
  vitals: { babyId: number; recordedAt: string; hr?: number | null; rr?: number | null; spo2?: number | null; temp?: number | null; rbs?: number | null; urineMlKgHr?: number | null }[];
};

/* ------------------------------ renderers ------------------------------- */

function Tile({ label, value, sub, tone = "white" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="card flex min-w-[120px] flex-1 flex-col px-4 py-3">
      <span className="lbl">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </div>
  );
}

function BarRow({ label, n, total, tone = "bg-cyan-400/70" }: { label: string; n: number; total: number; tone?: string }) {
  const pctV = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-[46%] truncate text-[11px] text-slate-300" title={label}>{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${total > 0 ? Math.max(n > 0 ? 3 : 0, pctV) : 0}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right text-[11px] font-semibold text-slate-200">
        {n} <span className="text-slate-500">({pctV}%)</span>
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

function RateLine({ label, r, suffix = "%" }: { label: string; r: Rate; suffix?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px]">
      <span className="text-slate-300">{label}</span>
      <span className="font-semibold text-slate-100">
        {r.pct === null ? "—" : `${r.pct}${suffix}`}{" "}
        <span className="text-[10px] font-normal text-slate-500">({r.n}/{r.denom})</span>
      </span>
    </div>
  );
}

function BandTable({ rows, valueLabel }: { rows: { label: string; admitted: number; deaths?: number; nec?: number }[]; valueLabel: string }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
          <th className="pb-1">Band</th>
          <th className="pb-1 text-right">Admitted</th>
          <th className="pb-1 text-right">{valueLabel}</th>
          <th className="pb-1 text-right">Rate</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5 text-slate-200">
        {rows.map((r) => {
          const v = r.deaths ?? r.nec ?? 0;
          return (
            <tr key={r.label}>
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right">{r.admitted}</td>
              <td className="py-1 text-right">{v}</td>
              <td className="py-1 text-right font-semibold">
                {r.admitted > 0 ? `${Math.round((v / r.admitted) * 1000) / 10}%` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TrendChart({ series }: { series: { month: string; admissions: number; deaths: number }[] }) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.admissions, s.deaths)));
  if (!series.length) return <p className="text-[11px] text-slate-500">No admissions recorded yet.</p>;
  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {series.map((s) => (
          <div key={s.month} className="flex h-full flex-1 items-end justify-center gap-[2px]">
            <div className="w-1/2 rounded-t bg-cyan-400/70" style={{ height: `${(s.admissions / max) * 100}%`, minHeight: s.admissions > 0 ? 3 : 1 }} title={`${s.month}: ${s.admissions} admissions`} />
            <div className="w-1/2 rounded-t bg-rose-400/70" style={{ height: `${(s.deaths / max) * 100}%`, minHeight: s.deaths > 0 ? 3 : 1 }} title={`${s.month}: ${s.deaths} deaths`} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-[9px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-400/70" />Admissions</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400/70" />Deaths</span>
        <span>{series[0]?.month} → {series[series.length - 1]?.month}</span>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  flag: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  "no-data": "border-slate-400/20 bg-slate-800/40 text-slate-400",
};
const PRIORITY_TONE: Record<string, string> = {
  high: "text-rose-300",
  medium: "text-amber-300",
  low: "text-slate-400",
};

/* --------------------------------- page ---------------------------------- */

export function QiScorecard() {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/backup", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) {
          setPacks((j?.babies ?? []) as Pack[]);
          setLoaded(true);
        }
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const rep = useMemo(() => {
    const list = packs ?? [];
    return computeAnalytics(
      list.map((p) => p.baby),
      list.flatMap((p) => p.vitals ?? []),
      list.flatMap((p) => p.problems ?? []),
    );
  }, [packs]);

  const doExport = async () => {
    setExporting(true);
    try {
      await exportAnalyticsXlsx(rep);
    } finally {
      setExporting(false);
    }
  };

  const m = rep.mortality;
  const dq = rep.dataQuality;

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-5">
        <div className="no-print card mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="flex items-center gap-2 text-sm font-black text-white">
            <LineChart size={16} className="text-cyan-300" /> NICU analytics & quality improvement
          </span>
          <span className="hidden text-[11px] text-slate-400 md:inline">
            Level III-B unit scorecard over every recorded chart — all-time view with monthly trends.
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className="btn-ghost !py-1 text-[11px]" onClick={doExport} disabled={exporting || !loaded}>
              <FileSpreadsheet size={12} /> {exporting ? "Building…" : "Export Excel"}
            </button>
            <button className="btn-ghost !py-1 text-[11px]" onClick={() => window.print()}>
              <Printer size={12} /> Export PDF
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-black text-white">Unit performance & quality scorecard</h1>
          <p className="text-[11px] text-slate-400">
            {rep.activity.total} admissions on record · generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            {!loaded && " · loading…"}
          </p>
        </div>

        {!loaded && <div className="card mb-4 p-8 text-center text-sm text-slate-400">Loading the unit dataset…</div>}

        {loaded && (
          <>
            {/* executive tiles */}
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              <Tile label="Admissions" value={rep.activity.total} sub={`${rep.activity.perMonth}/month avg`} />
              <Tile label="Mortality" value={m.rate.pct === null ? "—" : `${m.rate.pct}%`} sub={`${m.deaths} deaths`} tone={m.deaths > 0 ? "text-rose-300" : "text-white"} />
              <Tile label="Survival" value={m.survival.pct === null ? "—" : `${m.survival.pct}%`} tone="text-emerald-300" />
              <Tile label="Inborn" value={rep.activity.inborn.pct === null ? "—" : `${rep.activity.inborn.pct}%`} />
              <Tile label="ELBW admissions" value={rep.caseMix.elbw} sub={`VLBW ${rep.caseMix.vlbw}`} />
              <Tile label="Median LOS (left)" value={rep.los.median ?? "—"} sub={`mean ${rep.los.mean ?? "—"} d`} />
              <Tile label="Antibiotic exposure" value={rep.infection.antibioticExposure.pct === null ? "—" : `${rep.infection.antibioticExposure.pct}%`} />
              <Tile label="Admission normothermia" value={rep.resuscitation.normothermia.pct === null ? "—" : `${rep.resuscitation.normothermia.pct}%`} sub={`coverage ${rep.resuscitation.tempCoverage.pct ?? 0}%`} tone={rep.resuscitation.normothermia.pct !== null && rep.resuscitation.normothermia.pct < 90 ? "text-rose-300" : "text-white"} />
            </div>

            {/* data quality */}
            <Section title="1 · Data quality scorecard" sub="The dataset itself, audited before any clinical number is trusted">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Tile label="Records" value={dq.records} />
                <Tile label="Duplicate UHIDs" value={dq.duplicates} tone={dq.duplicates > 0 ? "text-amber-300" : "text-white"} />
                <Tile label="Implausible values" value={dq.implausible.length} tone={dq.implausible.length > 0 ? "text-amber-300" : "text-emerald-300"} />
                <Tile label="Observations" value={dq.observations} sub={`${dq.problems} problem records`} />
              </div>
              <div className="mt-3 grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="lbl mb-1">Missing values (of {dq.records} records)</h4>
                  {Object.entries(dq.missing).map(([k, n]) => (
                    <div key={k} className="flex items-center justify-between border-b border-white/5 py-1 text-[11px]">
                      <span className="capitalize text-slate-300">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                      <span className="font-semibold text-slate-100">{n} <span className="text-slate-500">({dq.records ? Math.round((n / dq.records) * 100) : 0}%)</span></span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="lbl mb-1">Implausible / inconsistent values flagged</h4>
                  {dq.implausible.length === 0 ? (
                    <p className="text-[11px] text-slate-500">None detected.</p>
                  ) : (
                    <ul className="max-h-44 space-y-1 overflow-y-auto pr-2 text-[11px] text-amber-200/90">
                      {dq.implausible.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Section>

            {/* activity & case mix */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="2 · Activity & workload" sub="Who the unit admits, and when">
                <TrendChart series={rep.activity.months.map((x) => ({ month: x.month, admissions: x.admissions, deaths: 0 }))} />
                <div className="mt-3 grid grid-cols-2 gap-x-6">
                  <div>
                    <h4 className="lbl mb-1">By day of week</h4>
                    <CountList rows={rep.activity.byDayOfWeek} total={rep.activity.total} tone="bg-sky-400/70" />
                  </div>
                  <div>
                    <h4 className="lbl mb-1">By unit</h4>
                    <CountList rows={rep.activity.byUnit} total={rep.activity.total} tone="bg-teal-400/70" />
                    <p className="mt-2 text-[11px] text-slate-400">
                      Transfers out: <b className="text-slate-200">{rep.activity.transfersOut}</b>
                      {" · "}Critical/guarded on admission: <b className="text-slate-200">{rep.activity.emergencyProxy.n}</b> ({rep.activity.emergencyProxy.pct ?? 0}%)
                    </p>
                  </div>
                </div>
              </Section>
              <Section title="3 · Case mix" sub={`Mean gestation ${rep.caseMix.meanGestation ?? "—"} wk · mean birth weight ${rep.caseMix.meanBirthWeight ?? "—"} g`}>
                <div className="grid grid-cols-2 gap-x-6">
                  <div>
                    <h4 className="lbl mb-1">Gestational age</h4>
                    <CountList rows={rep.caseMix.gaBands} total={rep.activity.total} tone="bg-violet-400/70" />
                  </div>
                  <div>
                    <h4 className="lbl mb-1">Birth weight</h4>
                    <CountList rows={rep.caseMix.bwBands} total={rep.activity.total} tone="bg-fuchsia-400/70" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-6">
                  <div>
                    <h4 className="lbl mb-1">Size for gestational age (Fenton 2013)</h4>
                    <CountList rows={rep.caseMix.sizeForGa} total={rep.activity.total} tone="bg-amber-400/70" />
                  </div>
                  <div>
                    <h4 className="lbl mb-1">Antenatal steroids</h4>
                    <CountList rows={rep.caseMix.steroids} total={rep.activity.total} tone="bg-emerald-400/70" />
                  </div>
                </div>
              </Section>
            </div>

            {/* mortality */}
            <div className="mt-4">
              <Section title="4 · Mortality" sub={`${m.deaths} of ${m.rate.denom} admissions — timing and documented causes only, never assumed`}>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div>
                    <h4 className="lbl mb-1">By gestational age</h4>
                    <BandTable rows={m.byGa} valueLabel="Deaths" />
                  </div>
                  <div>
                    <h4 className="lbl mb-1">By birth weight</h4>
                    <BandTable rows={m.byBw} valueLabel="Deaths" />
                  </div>
                  <div>
                    <h4 className="lbl mb-1">Timing of death (admission → death)</h4>
                    <CountList rows={m.byTiming} total={m.deaths} tone="bg-rose-400/70" />
                    <h4 className="lbl mb-1 mt-3">Documented cause groups</h4>
                    <CountList rows={m.byCause} total={m.deaths} tone="bg-orange-400/70" />
                  </div>
                </div>
                {m.register.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-bold text-white">Mortality review register — {m.register.length} deaths</summary>
                    <table className="mt-2 w-full text-[11px]">
                      <thead>
                        <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                          <th className="pb-1">UHID</th><th className="pb-1">GA</th><th className="pb-1">BW g</th><th className="pb-1">Inborn</th><th className="pb-1">Timing</th><th className="pb-1">Cause group</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {m.register.map((r) => (
                          <tr key={r.uhid}>
                            <td className="py-1 text-slate-400">{r.uhid}</td>
                            <td className="py-1">{r.ga}</td>
                            <td className="py-1">{r.bw}</td>
                            <td className="py-1">{r.inborn ? "Yes" : "No"}</td>
                            <td className="py-1">{r.timing}</td>
                            <td className="py-1">{r.cause}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </Section>
            </div>

            {/* CRIB-II */}
            <div className="mt-4">
              <Section
                title="5 · Risk adjustment — CRIB-II"
                sub={`Scored within the first hour from sex, gestation, birth weight, admission temperature and base excess · coverage ${rep.crib2.coverage.pct ?? 0}% (${rep.crib2.coverage.n}/${rep.crib2.coverage.denom})`}
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                        <th className="pb-1">CRIB-II level</th><th className="pb-1 text-right">Scored</th><th className="pb-1 text-right">Deaths</th><th className="pb-1 text-right">Observed mortality</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {rep.crib2.levels.map((l) => (
                        <tr key={l.level}>
                          <td className="py-1">Level {l.level} {l.level === "I" ? "(0–5)" : l.level === "II" ? "(6–10)" : l.level === "III" ? "(11–15)" : "(>15)"}</td>
                          <td className="py-1 text-right">{l.n}</td>
                          <td className="py-1 text-right">{l.deaths}</td>
                          <td className="py-1 text-right font-semibold">{l.mortalityPct === null ? "—" : `${l.mortalityPct}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] leading-relaxed text-slate-400">{rep.crib2.note}</p>
                </div>
              </Section>
            </div>

            {/* respiratory + resuscitation */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="6 · Respiratory care & BPD">
                <RateLine label="Mechanical ventilation" r={rep.respiratory.ventilation} />
                <RateLine label="CPAP" r={rep.respiratory.cpap} />
                <RateLine label="HFNC / nasal flow" r={rep.respiratory.hfnc} />
                <RateLine label="Surfactant" r={rep.respiratory.surfactant} />
                <RateLine label="Caffeine" r={rep.respiratory.caffeine} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Tile label="Median ventilator days" value={rep.respiratory.medianVentDays ?? "—"} sub={`recorded for ${rep.respiratory.ventDaysCoverage.n}/${rep.respiratory.ventDaysCoverage.denom} ventilated`} />
                  <Tile label="Reintubations" value={rep.respiratory.reintubations} />
                  <Tile label="BPD at 36 wk PMA" value={rep.respiratory.bpd.pct === null ? "—" : `${rep.respiratory.bpd.pct}%`} sub={`of ${rep.respiratory.bpd.denom} with support recorded`} />
                  <Tile label="BPD data coverage" value={`${rep.respiratory.bpdCoverage.pct ?? 0}%`} sub={`${rep.respiratory.bpdCoverage.n}/${rep.respiratory.bpdCoverage.denom} eligible survivors`} />
                </div>
              </Section>
              <Section title="7 · Delivery room & admission temperature" sub="Resuscitation fields come from the QI data tab">
                <RateLine label="Admission normothermia 36.5–37.5 °C" r={rep.resuscitation.normothermia} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Tile label="Hypothermia <36.5 °C" value={rep.resuscitation.hypothermia} tone={rep.resuscitation.hypothermia > 0 ? "text-rose-300" : "text-white"} />
                  <Tile label="Hyperthermia >37.5 °C" value={rep.resuscitation.hyperthermia} />
                  <Tile label="PPV at birth" value={rep.resuscitation.ppv} />
                  <Tile label="DR intubation" value={rep.resuscitation.drIntubation} />
                  <Tile label="Chest compressions" value={rep.resuscitation.compressions} />
                  <Tile label="Epinephrine" value={rep.resuscitation.epinephrine} />
                </div>
              </Section>
            </div>

            {/* infection + NEC */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="8 · Infection & antibiotic stewardship">
                <RateLine label="Antibiotic exposure" r={rep.infection.antibioticExposure} />
                <RateLine label="Blood culture sent" r={rep.infection.culturesSent} />
                <RateLine label="Culture positivity (of cultures sent)" r={rep.infection.positivity} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Tile label="EOS" value={rep.infection.eos} />
                  <Tile label="LOS" value={rep.infection.los} />
                  <Tile label="CLABSI" value={rep.infection.clabsi} sub={`${rep.infection.lineDays} line-days recorded`} />
                  <Tile label="CLABSI /1000 line-days" value={rep.infection.clabsiRate ?? "—"} />
                  <Tile label="Median antibiotic days" value={rep.infection.medianAntibioticDays ?? "—"} sub={`recorded ${rep.infection.antibioticDaysCoverage.n}/${rep.infection.antibioticDaysCoverage.denom}`} />
                  <Tile label="Meningitis" value={rep.infection.meningitis} />
                </div>
                {rep.infection.organisms.length > 0 && (
                  <div className="mt-3">
                    <h4 className="lbl mb-1">Organisms recorded</h4>
                    <CountList rows={rep.infection.organisms} total={rep.infection.organisms.reduce((a, r) => a + r.n, 0)} tone="bg-red-400/70" />
                  </div>
                )}
              </Section>
              <Section title="9 · NEC, feeding & nutrition">
                <RateLine label="NEC (event log)" r={rep.necFeeding.nec} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Tile label="Median first feed" value={rep.necFeeding.firstFeed.median ?? "—"} sub={`DOL · n=${rep.necFeeding.firstFeed.n}`} />
                  <Tile label="Median full feeds" value={rep.necFeeding.fullFeed.median ?? "—"} sub={`DOL · n=${rep.necFeeding.fullFeed.n}`} />
                  <Tile label="Median PN duration" value={rep.necFeeding.pn.median ?? "—"} sub={`days · n=${rep.necFeeding.pn.n}`} />
                  <Tile label="Exclusive human milk" value={rep.necFeeding.exclusiveHumanMilk} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Tile label="Avg max weight loss" value={rep.nutrition.avgMaxLossPct === null ? "—" : `${rep.nutrition.avgMaxLossPct}%`} sub={`${rep.nutrition.excessiveLoss} babies >10%`} tone={rep.nutrition.excessiveLoss > 0 ? "text-amber-300" : "text-white"} />
                  <Tile label="Avg regain of birth weight" value={rep.nutrition.avgRegainDay ?? "—"} sub="day of life" />
                  <Tile label="Avg weight velocity" value={rep.nutrition.avgVelocity ?? "—"} sub={`${rep.nutrition.slowVelocity} slow (<12 g/kg/d)`} />
                  <Tile label="Human milk now (active)" value={rep.nutrition.humanMilkNow.pct === null ? "—" : `${rep.nutrition.humanMilkNow.pct}%`} sub={`TPN ${rep.nutrition.tpn}`} />
                </div>
              </Section>
            </div>

            {/* neuro / ROP / lines / transfusions */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Section title="10 · Neurology" sub={`IVH recorded for ${rep.neuro.coverage.n}/${rep.neuro.coverage.denom} babies <32 wk`}>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Any IVH" value={rep.neuro.anyIvh} />
                  <Tile label="Severe IVH (≥3)" value={rep.neuro.severeIvh} tone={rep.neuro.severeIvh > 0 ? "text-rose-300" : "text-white"} />
                  <Tile label="PVL" value={rep.neuro.pvl} />
                  <Tile label="Seizures" value={rep.neuro.seizures} />
                  <Tile label="Therapeutic cooling" value={rep.neuro.cooling} />
                  <Tile label="Severe IVH (<28 wk survivors)" value={rep.neuro.severeIvhInExtreme.pct === null ? "—" : `${rep.neuro.severeIvhInExtreme.pct}%`} sub={`${rep.neuro.severeIvhInExtreme.n}/${rep.neuro.severeIvhInExtreme.denom}`} />
                </div>
              </Section>
              <Section title="11 · ROP programme" sub={`Eligible: ≤34 wk or ≤1750 g, surviving`}>
                <RateLine label="Screening compliance" r={rep.rop.compliance} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Tile label="Eligible infants" value={rep.rop.eligible} />
                  <Tile label="Screened" value={rep.rop.screened} />
                  <Tile label="Missed screening" value={rep.rop.missed} tone={rep.rop.missed > 0 ? "text-rose-300" : "text-emerald-300"} />
                  <Tile label="Treated (laser/anti-VEGF)" value={rep.rop.treated} />
                </div>
                {rep.rop.stages.length > 0 && (
                  <div className="mt-2">
                    <CountList rows={rep.rop.stages} total={rep.rop.stages.reduce((a, r) => a + r.n, 0)} tone="bg-indigo-400/70" />
                  </div>
                )}
              </Section>
              <Section title="12 · Lines & transfusions">
                <CountList rows={rep.lines.types} total={rep.lines.types.reduce((a, r) => a + r.n, 0)} tone="bg-yellow-400/70" />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Tile label="PRBC units" value={rep.transfusions.prbc} />
                  <Tile label="Platelet units" value={rep.transfusions.platelets} />
                  <Tile label="FFP units" value={rep.transfusions.ffp} />
                  <Tile label="Babies transfused" value={`${rep.transfusions.babies.pct ?? 0}%`} sub={`${rep.transfusions.babies.n}/${rep.transfusions.babies.denom}`} />
                </div>
              </Section>
            </div>

            {/* LOS & discharge */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="13 · Length of stay" sub={`${rep.los.n} babies have left the unit`}>
                <div className="grid grid-cols-3 gap-2">
                  <Tile label="Median LOS" value={rep.los.median ?? "—"} sub="days" />
                  <Tile label="Mean LOS" value={rep.los.mean ?? "—"} sub="days" />
                  <Tile label="IQR" value={rep.los.iqr ? `${rep.los.iqr[0]}–${rep.los.iqr[1]}` : "—"} sub="days" />
                </div>
                <h4 className="lbl mb-1 mt-3">Median LOS by gestational band</h4>
                <CountList rows={rep.los.byGa.map((r) => ({ label: r.label, n: r.median ?? 0 }))} total={Math.max(1, ...rep.los.byGa.map((r) => r.median ?? 0))} tone="bg-cyan-400/70" />
                {rep.los.prolonged.length > 0 && (
                  <div className="mt-3">
                    <h4 className="lbl mb-1">Longest current stays</h4>
                    {rep.los.prolonged.map((p) => (
                      <div key={p.uhid} className="flex justify-between border-b border-white/5 py-1 text-[11px]">
                        <span className="text-slate-300">{p.uhid} · {p.ga} wk</span>
                        <span className="font-semibold text-slate-100">{p.days} days</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              <Section title="14 · Discharge outcomes & KMC / human milk">
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Discharged home" value={rep.discharge.home} />
                  <Tile label="Transferred" value={rep.discharge.transferred} />
                  <Tile label="Deaths" value={rep.discharge.death} />
                  <Tile label="Avg discharge weight" value={rep.discharge.avgWeightG ? `${rep.discharge.avgWeightG} g` : "—"} />
                  <Tile label="Avg PMA at discharge" value={rep.discharge.avgPma ?? "—"} sub="weeks" />
                  <Tile label="Home oxygen" value={rep.discharge.homeOxygen} />
                  <Tile label="Readmitted ≤28 d" value={rep.discharge.readmitted28d} />
                  <Tile label="KMC of eligible" value={`${rep.kmcMilk.kmcStarted.pct ?? 0}%`} sub={`${rep.kmcMilk.kmcStarted.n}/${rep.kmcMilk.kmcStarted.denom}`} />
                </div>
                <div className="mt-3">
                  <RateLine label="Any human milk (VLBW, active)" r={rep.kmcMilk.anyHumanMilkVlbw} />
                  <RateLine label="Exclusive human milk (all admissions)" r={rep.kmcMilk.exclusiveHumanMilk} />
                </div>
              </Section>
            </div>

            {/* trends */}
            <div className="mt-4">
              <Section title="15 · Monthly trends" sub="Admissions (cyan) and deaths (rose) by month — watch for step-changes and outlier months">
                <TrendChart series={rep.trends} />
              </Section>
            </div>

            {/* quality indicators */}
            <div className="mt-4">
              <Section title="16 · Quality-indicator dashboard" sub="Each indicator shows numerator/denominator, the published reference and an automatic review flag">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[11px]">
                    <thead>
                      <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                        <th className="pb-1">Domain</th><th className="pb-1">Indicator</th><th className="pb-1 text-right">Value</th><th className="pb-1 text-right">n / denom</th><th className="pb-1">Reference</th><th className="pb-1">Status</th><th className="pb-1">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {rep.indicators.map((i) => (
                        <tr key={i.indicator}>
                          <td className="py-1.5 text-slate-400">{i.domain}</td>
                          <td className="py-1.5" title={i.source}>{i.indicator}</td>
                          <td className="py-1.5 text-right font-bold">{i.value}</td>
                          <td className="py-1.5 text-right text-slate-400">{i.n === null ? "—" : `${i.n} / ${i.denom}`}</td>
                          <td className="py-1.5 text-slate-400">{i.reference}</td>
                          <td className="py-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[i.status]}`}>
                              {i.status === "flag" ? "review" : i.status === "ok" ? "within ref" : "no data"}
                            </span>
                          </td>
                          <td className={`py-1.5 font-bold ${PRIORITY_TONE[i.priority]}`}>{i.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>

            {/* pareto + subgroups */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="17 · Pareto — complications" sub="Where the morbidity concentrates; cumulative share guides QI targeting">
                {rep.pareto.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No structured complications recorded yet.</p>
                ) : (
                  rep.pareto.map((p) => (
                    <div key={p.label} className="flex items-center gap-2 py-[3px]">
                      <span className="w-[46%] truncate text-[11px] text-slate-300">{p.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <span className="block h-full rounded-full bg-rose-400/70" style={{ width: `${p.cumulativePct}%` }} />
                      </span>
                      <span className="w-24 shrink-0 text-right text-[11px] font-semibold text-slate-200">{p.n} · cum {p.cumulativePct}%</span>
                    </div>
                  ))
                )}
              </Section>
              <Section title="18 · Subgroup outcomes" sub="Where risk concentrates — small numbers need cautious reading">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                      <th className="pb-1">Subgroup</th><th className="pb-1 text-right">n</th><th className="pb-1 text-right">Mortality</th><th className="pb-1 text-right">Severe IVH</th><th className="pb-1 text-right">NEC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {rep.subgroups.map((s) => (
                      <tr key={s.label}>
                        <td className="py-1">{s.label}</td>
                        <td className="py-1 text-right">{s.n}</td>
                        <td className="py-1 text-right font-semibold">{s.mortalityPct === null ? "—" : `${s.mortalityPct}%`}</td>
                        <td className="py-1 text-right">{s.severeIvh}</td>
                        <td className="py-1 text-right">{s.nec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </div>

            {/* gaps + safety */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Section title="19 · Procedures & safety" sub={rep.safety.note}>
                <CountList rows={rep.safety.procedures.map((p) => ({ label: p.label, n: p.n }))} total={Math.max(1, rep.safety.procedures.reduce((a, p) => a + p.n, 0))} tone="bg-orange-400/70" />
              </Section>
              <Section title="20 · Data not currently captured" sub="Gaps declared honestly — the QI data tab on each chart collects most of these going forward">
                <ul className="space-y-1.5 text-[11px] text-slate-300">
                  {rep.gaps.map((g) => (
                    <li key={g.domain}>
                      <b className="text-white">{g.domain}.</b> {g.note}
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </>
        )}
      </main>
  );
}
