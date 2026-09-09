"use client";

import { ChevronDown, ChevronRight, ExternalLink, Search, Stethoscope } from "lucide-react";
import { Calculator as CalculatorIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BloodGasInterpreter } from "@/components/blood-gas-interpreter";
import { TopBar } from "@/components/ui";
import { PhototherapyNomogramCalculator } from "@/components/phototherapy-calculator";
import { CALCULATORS, CATEGORIES } from "@/lib/calculators";
import type { Calculator as CalcDef } from "@/lib/calc-types";

const SEV_STYLE: Record<string, string> = {
  good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  crit: "border-rose-400/50 bg-rose-500/15 text-rose-200",
};

function CalcCard({ calc, forceOpen = false }: { calc: CalcDef; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<null | ReturnType<CalcDef["compute"]>>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [forceOpen]);

  return (
    <div ref={ref} className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={16} className="shrink-0 text-cyan-300" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
        <Stethoscope size={14} className="shrink-0 text-cyan-300/70" />
        <span className="flex-1 text-sm font-bold text-white">{calc.name}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-500">{calc.citation.split("(")[0].trim()}</span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          <p className="mb-3 text-[10px] text-slate-400">📖 {calc.citation}</p>
          {calc.id === "phototherapy-nomograms" ? (
            <PhototherapyNomogramCalculator />
          ) : (
            <>
              {calc.external && (
                <a href={calc.external.url} target="_blank" rel="noopener noreferrer"
                  className="mb-3 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200">
                  <ExternalLink size={11} /> {calc.external.label}
                </a>
              )}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {calc.fields.map((field) => (
                  <label key={field.key} className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
                    <span className="lbl mb-1 block">{field.label}</span>
                    {field.type === "select" ? (
                      <select className="inp !py-1 text-xs" value={values[field.key] ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [field.key]: Number(e.target.value) }))}>
                        <option value="">— select —</option>
                        {field.options.map((o) => (
                          <option key={o.value} value={o.value}>({o.value}) {o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input className="inp !py-1 text-center text-sm font-bold" inputMode="decimal"
                          value={values[field.key] ?? ""} placeholder={field.placeholder ?? "—"}
                          onChange={(e) => setValues((p) => ({ ...p, [field.key]: Number(e.target.value) || 0 }))} />
                        {field.unit && <span className="block text-[9px] text-slate-500">{field.unit}</span>}
                      </>
                    )}
                  </label>
                ))}
              </div>
              <button className="btn-primary mt-3 !py-1.5 text-xs" onClick={() => setResult(calc.compute(values))}>
                Calculate
              </button>
              {result && (
                <div className={`mt-3 rounded-xl border p-3 ${SEV_STYLE[result.severity]}`}>
                  <div className="text-base font-black tabular-nums">{result.value}</div>
                  <p className="mt-1 text-[11px] leading-snug">{result.interpretation ?? result.note ?? ""}</p>
                  {result.outOfRange && <p className="mt-1 text-[10px] font-bold text-rose-300">⚠ {result.outOfRange}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalculatorsPage() {
  const [focusCalc, setFocusCalc] = useState("");
  const focusedCalc = CALCULATORS.find((c) => c.id === focusCalc) ?? null;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const calc = new URLSearchParams(window.location.search).get("calc")?.trim() || "";
    setFocusCalc(calc);
  }, []);
  const filtered = useMemo(() => {
    if (focusedCalc) return [focusedCalc];
    const needle = q.trim().toLowerCase();
    return CALCULATORS.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (!needle) return true;
      return `${c.name} ${c.citation} ${c.category}`.toLowerCase().includes(needle);
    });
  }, [q, cat, focusedCalc]);

  const grouped = useMemo(() => {
    const map: Record<string, CalcDef[]> = {};
    for (const c of CATEGORIES) map[c.key] = [];
    for (const c of filtered) (map[c.category] ??= []).push(c);
    return CATEGORIES.filter((c) => map[c.key]?.length).map((c) => ({ ...c, items: map[c.key] }));
  }, [filtered]);

  return (
    <main className="min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1200px] px-4 py-5">
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <CalculatorIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-white">Quick Access Calculators</h1>
            <p className="text-[11px] text-slate-400">
              {CALCULATORS.length} validated clinical calculators · provisional decision support — not a diagnosis
            </p>
          </div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="inp !w-64 !py-1.5 !pl-8 text-xs"
              placeholder="Search calculator by name…"
              value={focusedCalc ? focusedCalc.name : q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!!focusedCalc}
            />
          </div>
        </div>

        <div className="card mb-4 flex flex-wrap items-center gap-1.5 p-3">
          <button className={`chip ${cat === "all" ? "chip-on" : "chip-off"}`} onClick={() => setCat("all")} disabled={!!focusedCalc}>
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.key} className={`chip ${cat === c.key ? "chip-on" : "chip-off"}`} onClick={() => setCat(c.key)} disabled={!!focusedCalc}>
              {c.label}
            </button>
          ))}
        </div>

        {focusedCalc && (
          <div className="card mb-4 border-cyan-400/30 bg-cyan-400/5 p-3 text-[11px] text-cyan-100">
            Direct calculator link loaded: <b>{focusedCalc.name}</b>
          </div>
        )}

        {grouped.length === 0 && <p className="card p-8 text-center text-sm text-slate-400">No calculator matches “{q}”.</p>}

        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-cyan-300">
                <Stethoscope size={14} /> {group.label}
                <span className="text-[10px] font-semibold text-slate-500">({group.items.length})</span>
              </h2>
              <div className="space-y-2">
                {group.items.map((c) => <CalcCard key={c.id} calc={c} forceOpen={c.id === focusCalc} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
