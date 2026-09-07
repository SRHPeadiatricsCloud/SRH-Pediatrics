"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TopBar, usePoll } from "@/components/ui";
import { UnitBadge } from "@/components/unit-ui";
import { UNIT_LIST, unitOf, type UnitKey } from "@/lib/units";

const CONSULTANTS = [
  "Dr. Siddhartha",
  "Dr. Sujamariam",
  "Dr. Shobi Anandhi",
  "Dr. Devaprasath",
  "Dr. Indira Devi",
  "Dr. Krishna Sameera",
];

type BoardBaby = {
  id: number;
  uhid: string;
  babyName: string;
  motherName: string;
  bed: string;
  unit: string;
  acuity: string;
  status: string;
  consultant: string;
  problems: { id: number; label: string }[];
};

export default function ConsultantsPage() {
  const { data, reload } = usePoll<{ babies: BoardBaby[] }>("/api/board", 5000);
  const [consultant, setConsultant] = useState(CONSULTANTS[0]);
  const [unitFilter, setUnitFilter] = useState<"all" | UnitKey>("all");

  const active = useMemo(
    () => (data?.babies ?? []).filter((b) => b.status === "active"),
    [data],
  );

  const roster = useMemo(() => {
    const list = active.filter((b) => {
      const matchConsultant =
        !consultant ||
        b.consultant === consultant ||
        b.consultant.toLowerCase().includes(consultant.toLowerCase().replace(/^dr\.?\s*/i, ""));
      const matchUnit = unitFilter === "all" || b.unit === unitFilter;
      return matchConsultant && matchUnit;
    });
    return list;
  }, [active, consultant, unitFilter]);

  const byUnit = useMemo(() => {
    const map: Record<string, BoardBaby[]> = {};
    for (const u of UNIT_LIST) map[u.key] = [];
    for (const b of roster) {
      if (!map[b.unit]) map[b.unit] = [];
      map[b.unit].push(b);
    }
    return map;
  }, [roster]);

  const consultantCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of CONSULTANTS) m[c] = 0;
    for (const b of active) {
      const hit = CONSULTANTS.find(
        (c) => b.consultant === c || b.consultant.toLowerCase().includes(c.toLowerCase().replace(/^dr\.?\s*/i, "")),
      );
      if (hit) m[hit] = (m[hit] ?? 0) + 1;
      else if (b.consultant) m[b.consultant] = (m[b.consultant] ?? 0) + 1;
    }
    return m;
  }, [active]);

  return (
    <main className="min-h-screen pb-20">
      <TopBar live onRefresh={reload} />
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="card mb-4 p-4">
          <h1 className="text-xl font-black text-white">Admissions by consultant</h1>
          <p className="text-xs text-slate-400">
            Department of Pediatrics · view every active admission under a consultant, split by unit
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CONSULTANTS.map((c) => (
              <button
                key={c}
                onClick={() => setConsultant(c)}
                className={`chip ${consultant === c ? "chip-on" : "chip-off"}`}
              >
                {c}
                <span className="ml-1 opacity-70">({consultantCounts[c] ?? 0})</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              className={`chip ${unitFilter === "all" ? "chip-on" : "chip-off"}`}
              onClick={() => setUnitFilter("all")}
            >
              All units
            </button>
            {UNIT_LIST.map((u) => (
              <button
                key={u.key}
                className={`chip ${unitFilter === u.key ? "chip-on" : "chip-off"}`}
                onClick={() => setUnitFilter(u.key)}
              >
                {u.emoji} {u.short}
                <span className="ml-1 opacity-70">
                  ({active.filter((b) => b.unit === u.key && (b.consultant === consultant || b.consultant.includes(consultant.replace(/^Dr\.\s*/, "")))).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 text-sm text-slate-300">
          Showing <b className="text-white">{roster.length}</b> active patient{roster.length === 1 ? "" : "s"} under{" "}
          <b className="text-cyan-300">{consultant}</b>
          {unitFilter !== "all" ? ` in ${unitOf(unitFilter).short}` : " across all units"}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {(unitFilter === "all" ? UNIT_LIST : UNIT_LIST.filter((u) => u.key === unitFilter)).map((u) => {
            const list = byUnit[u.key] ?? [];
            return (
              <section key={u.key} className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">{u.emoji}</span>
                  <div>
                    <h2 className="text-sm font-black text-white">{u.short}</h2>
                    <p className="text-[11px] text-slate-400">{u.name} · {list.length} admitted</p>
                  </div>
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-slate-500">No active admissions under this consultant in {u.short}.</p>
                ) : (
                  <div className="space-y-2">
                    {list.map((b) => (
                      <Link
                        key={b.id}
                        href={`/baby/${b.id}`}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-cyan-400/40 hover:bg-white/[0.06]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white">{b.babyName}</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{b.bed}</span>
                          <UnitBadge unit={b.unit} />
                          <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                            {b.acuity}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {b.uhid} · {b.motherName || "—"} · {b.problems.slice(0, 3).map((p) => p.label).join(" · ") || "No problems listed"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
