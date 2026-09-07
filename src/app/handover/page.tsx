"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnCallPrintStrip } from "@/components/oncall";
import { TopBar, usePoll, useTempUnit } from "@/components/ui";
import { UnitBadge, UnitSwitcher } from "@/components/unit-ui";
import type { Clinical } from "@/lib/clinical";
import { correctedGA, dayOfLife, fmtBP, fmtTime, tempOut } from "@/lib/clinical";
import { UNITS, type UnitKey, unitOf } from "@/lib/units";

type B = {
  id: number;
  uhid: string;
  babyName: string;
  bed: string;
  unit: string;
  subspecialty: string;
  sex: string;
  dob: string;
  gestWeeks: number;
  gestDays: number;
  birthWeight: number;
  currentWeight: number;
  acuity: string;
  status: string;
  consultant: string;
  clinical: Clinical;
  problems: { id: number; label: string; status: string }[];
  openTasks: { id: number; text: string }[];
  lastVital: Record<string, number | string | null> | null;
  lastHandover: { shift: string; fromStaff: string; toStaff: string; summary: string; contingency: string[]; createdAt: string } | null;
};

function Sheet() {
  const search = useSearchParams();
  const initial = (search?.get("unit") ?? "nicu") as UnitKey;
  const [unit, setUnit] = useState<UnitKey>(initial in UNITS ? initial : "nicu");
  const { data, reload } = usePoll<{ babies: B[]; serverTime: string }>(`/api/board?unit=${unit}`, 6000);
  const oncall = usePoll<{ row: { fields: Record<string, string> | null } | null }>("/api/oncall", 15000);
  const { unit: tUnit } = useTempUnit();
  const [showDeleted, setShowDeleted] = useState(false);

  const babies = useMemo(
    () => (data?.babies ?? []).filter((b) => (showDeleted ? true : b.status === "active")),
    [data, showDeleted],
  );
  const u = unitOf(unit);

  return (
    <main className="min-h-screen pb-20">
      <TopBar live onRefresh={reload} unit={unit} onUnitChange={(x) => setUnit(x as UnitKey)} />
      <div className="mx-auto max-w-[1300px] px-4 py-5">
        <div className="no-print card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/hospital-logo.svg" alt="" className="h-8 w-8" />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                    Sri Ramakrishna Hospital · Department of Pediatrics
                  </p>
                  <p className="text-[9px] font-semibold text-slate-400">
                    Realtime Monitoring and Clinical Handover Suite
                  </p>
                  <h1 className="text-xl font-black tracking-tight text-white">
                    {u.short} — Shift Handover Sheet
                  </h1>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                {u.name} · live snapshot · generated {fmtTime(data?.serverTime ?? new Date().toISOString())} ·{" "}
                <b className="text-white">{babies.length}</b> patients
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <UnitSwitcher active={unit} onChange={(x) => setUnit(x as UnitKey)} />
              <button className="btn-ghost" onClick={() => setShowDeleted((v) => !v)}>
                {showDeleted ? "Hide deleted" : "Include deleted"}
              </button>
              <button className="btn-primary" onClick={() => window.print()}>
                🖨️ Print / save PDF
              </button>
            </div>
          </div>
        </div>

        <div className="print-black space-y-3">
          <OnCallPrintStrip fields={oncall.data?.row?.fields ?? null} />
          {babies.map((b) => {
            const c = b.clinical ?? {};
            const v = b.lastVital ?? {};
            const isNeo = b.unit === "nicu" || b.unit === "postnatal";
            return (
              <div key={b.id} className="card break-inside-avoid p-4 text-xs">
                <div className="flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-2">
                  <strong className="text-base font-black text-white">{b.bed}</strong>
                  <strong className="text-sm text-white">{b.babyName}</strong>
                  <UnitBadge unit={b.unit} subspecialty={b.subspecialty} />
                  <span className="text-slate-400">
                    {b.uhid} · {b.sex} ·{" "}
                    {isNeo
                      ? `${b.gestWeeks}+${b.gestDays} wk · BW ${b.birthWeight} g · DOL ${dayOfLife(b.dob)} · CGA ${correctedGA(b.dob, b.gestWeeks, b.gestDays)} · Wt ${b.currentWeight} g`
                      : `${b.gestWeeks} yr · Wt ${b.currentWeight / 1000} kg`}
                  </span>
                  <span className="ml-auto rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-200">
                    {b.acuity}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <P k="Problems" v={b.problems.map((p) => p.label).join("; ") || "—"} />
                    <P
                      k="Respiratory"
                      v={`${c.resp?.mode ?? "—"} · FiO₂ ${c.resp?.settings?.fio2 ?? 21}% · ${Object.entries(c.resp?.settings ?? {})
                        .map(([k, x]) => `${k} ${x}`)
                        .join(", ")}`}
                    />
                    <P
                      k="Feeds / fluids"
                      v={`${c.fluids?.feedType ?? "—"} ${c.fluids?.feedVol ?? ""} ml ${c.fluids?.feedFreq ?? ""} ${c.fluids?.feedRoute ?? ""} · total ${c.fluids?.totalMlKgDay ?? "—"} ml/kg/d`}
                    />
                    <P
                      k="Drugs"
                      v={
                        (c.drugs ?? [])
                          .map((x) => `${x.name}${x.ofDays ? ` D${x.day}/${x.ofDays}` : x.dose ? ` (${x.dose})` : ""}`)
                          .join(", ") || "—"
                      }
                    />
                    <P k="Lines" v={(c.lines ?? []).map((l) => `${l.name} D${l.day}`).join(", ") || "—"} />
                  </div>
                  <div>
                    <P
                      k="Last vitals"
                      v={`HR ${v.hr ?? "—"} · RR ${v.rr ?? "—"} · SpO₂ ${v.spo2 ?? "—"}% · T ${tempOut(v.temp as number | null, tUnit) ?? "—"}°${tUnit} · BP ${fmtBP(v.sbp as number | null, v.dbp as number | null, v.map as number | null)} · RBS ${v.rbs ?? "—"}`}
                    />
                    <P k="Labs" v={Object.entries(c.labs ?? {}).filter(([, x]) => x).map(([k, x]) => `${k} ${x}`).join(" · ") || "—"} />
                    <P k="Plan" v={c.plan ?? "—"} />
                    <P k="Actions" v={b.openTasks.map((t) => t.text).join("; ") || "—"} />
                    <P k="If–then" v={b.lastHandover?.contingency?.join(" | ") || "—"} />
                    <P k="Consultant" v={`Primary — ${b.consultant || "not assigned"}`} />
                  </div>
                </div>
              </div>
            );
          })}
          {babies.length === 0 && (
            <p className="card p-8 text-center text-sm text-slate-400">
              No patients in {u.short}. Switch units above or admit a patient.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SheetPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen">
          <TopBar />
          <div className="p-10 text-center text-slate-400">Preparing handover sheet…</div>
        </main>
      }
    >
      <Sheet />
    </Suspense>
  );
}

function P({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</span>
      <span className="flex-1 text-slate-200">{v}</span>
    </div>
  );
}
