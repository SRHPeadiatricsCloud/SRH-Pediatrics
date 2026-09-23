"use client";

/**
 * Discharge register & MRD archive.
 *
 * Discharged babies leave the live board (the board shows status "active" only)
 * and land here, grouped by the local calendar day they left and rolled up into
 * monthly archives. Every level can be exported as a PDF: one baby, a whole
 * day, or a whole month for MRD retention.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { TopBar, api, usePoll } from "@/components/ui";
import {
  formatDayLabel,
  formatMonthLabel,
  dischargeDay,
  dischargeOf,
  groupByMonth,
  isDischarged,
  lengthOfStayDays,
  monthKey,
} from "@/lib/discharge";
import type { Archivable } from "@/lib/discharge";
import { OUTCOME_LABEL } from "@/lib/discharge";

type Row = Archivable & Record<string, unknown>;

const OUTCOME_TONE: Record<string, string> = {
  discharged: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  transferred: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  death: "border-slate-400/40 bg-slate-900/40 text-slate-200",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex min-w-[120px] flex-1 flex-col px-4 py-3">
      <span className="lbl">{label}</span>
      <span className="text-xl font-black text-white">{value}</span>
    </div>
  );
}

function ExportLink({
  href,
  label,
  tone = "ghost",
}: {
  href: string;
  label: string;
  tone?: "ghost" | "primary";
}) {
  return (
    <Link href={href} className={tone === "primary" ? "btn-primary !py-1 text-[11px]" : "btn-ghost !py-1 text-[11px]"}>
      {label}
    </Link>
  );
}

export default function DischargePage() {
  const { data, reload } = usePoll<{ babies: Row[] }>("/api/board", 6000);
  const [month, setMonth] = useState<string>("");
  const [query, setQuery] = useState("");

  const all = useMemo(() => (data?.babies ?? []).filter(isDischarged), [data]);

  const months = useMemo(() => groupByMonth(all), [all]);

  const visibleMonths = useMemo(() => {
    const filtered = month ? months.filter((m) => m.month === month) : months;
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered
      .map((m) => ({
        ...m,
        days: m.days
          .map((d) => ({
            ...d,
            babies: d.babies.filter(
              (b) =>
                b.babyName.toLowerCase().includes(q) ||
                b.uhid.toLowerCase().includes(q) ||
                (b.motherName ?? "").toLowerCase().includes(q),
            ),
          }))
          .filter((d) => d.babies.length > 0),
      }))
      .filter((m) => m.days.length > 0);
  }, [months, month, query]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const thisMonthKey = monthKey(todayKey);

  const dischargedToday = all.filter((b) => dischargeDay(b) === todayKey).length;
  const dischargedThisMonth = all.filter((b) => monthKey(dischargeDay(b)) === thisMonthKey).length;

  const reactivate = async (b: Row) => {
    if (!window.confirm(`Return ${b.babyName} to the live board? The discharge record is cleared.`)) return;
    await api(`/api/babies/${b.id}`, "PATCH", {
      status: "active",
      clinical: { dischargeRecord: null },
      logEvent: { kind: "update", text: "Discharge reversed — card returned to the live board", author: "Team" },
    });
    reload();
  };

  return (
    <main className="min-h-screen pb-24">
      <TopBar />
      <div className="mx-auto max-w-[1300px] px-4 py-4">
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-black text-white">Discharge register &amp; MRD archive</h1>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Grouped by the day they left.
              </p>
            </div>
            <Link href="/" className="btn-ghost">
              ← Live board
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Stat label="Discharged total" value={all.length} />
            <Stat label="This month" value={dischargedThisMonth} />
            <Stat label="Today" value={dischargedToday} />
            <Stat label="Months archived" value={months.filter((m) => m.month).length} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="inp max-w-[260px]"
              placeholder="Search name, UHID or mother…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              <button className={`chip ${month === "" ? "chip-on" : "chip-off"}`} onClick={() => setMonth("")}>
                All months
              </button>
              {months
                .filter((m) => m.month)
                .map((m) => (
                  <button
                    key={m.month}
                    className={`chip ${month === m.month ? "chip-on" : "chip-off"}`}
                    onClick={() => setMonth(m.month)}
                  >
                    {formatMonthLabel(m.month)} · {m.babies.length}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {visibleMonths.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-300">
              {all.length === 0
                ? "No babies have been marked as discharged yet."
                : "Nothing matches that search."}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Use the discharge button on a baby card.
            </p>
          </div>
        )}

        {visibleMonths.map((m) => (
          <section key={m.month || "undated"} className="card mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-cyan-400/25 pb-2">
              <div>
                <h2 className="text-sm font-black text-cyan-200">
                  {m.month ? formatMonthLabel(m.month) : "Undated discharges"}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {m.babies.length} record{m.babies.length === 1 ? "" : "s"} · {m.days.length} day
                  {m.days.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {m.month && (
                  <ExportLink
                    tone="primary"
                    href={`/archive/print?month=${m.month}&autoprint=1`}
                    label={`🖨️ Export ${formatMonthLabel(m.month)} (${m.babies.length})`}
                  />
                )}
                <ExportLink
                  href={`/archive/print?month=${m.month}`}
                  label={m.month ? "Review month" : "Review"}
                />
              </div>
            </div>

            {m.days.map((g) => (
              <div key={g.day || "undated"} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-bold text-white">
                    {g.day ? formatDayLabel(g.day) : "Date not recorded"}
                  </h3>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {g.babies.length}
                  </span>
                  {g.day && (
                    <ExportLink
                      href={`/archive/print?day=${g.day}&autoprint=1`}
                      label={`🖨️ Export this day (${g.babies.length})`}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  {g.babies.map((b) => {
                    const rec = dischargeOf(b);
                    const outcome = rec?.outcome ?? (b.status as string);
                    const los = lengthOfStayDays(b);
                    return (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                      >
                        <Link href={`/baby/${b.id}`} className="font-bold text-white hover:underline">
                          {b.babyName}
                        </Link>
                        <span className="text-slate-400">
                          {b.uhid}
                          {b.bed ? ` · ${b.bed}` : ""}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                            OUTCOME_TONE[outcome] ?? "border-white/10 bg-white/5 text-slate-300"
                          }`}
                        >
                          {OUTCOME_LABEL[outcome as keyof typeof OUTCOME_LABEL] ?? outcome}
                        </span>
                        {los !== null && <span className="text-[10px] text-slate-400">LOS {los} d</span>}
                        {rec?.signedBy && (
                          <span className="text-[10px] text-slate-400">signed {rec.signedBy}</span>
                        )}
                        <div className="ml-auto flex flex-wrap gap-1.5">
                          <ExportLink
                            tone="primary"
                            href={`/archive/print?ids=${b.id}&autoprint=1`}
                            label="🖨️ PDF"
                          />
                          <ExportLink href={`/archive/print?ids=${b.id}`} label="Preview" />
                          <button className="btn-ghost !py-1 text-[11px]" onClick={() => reactivate(b)}>
                            Reactivate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
