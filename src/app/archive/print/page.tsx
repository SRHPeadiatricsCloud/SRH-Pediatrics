"use client";

/**
 * Print / PDF view for discharged babies — one record per page.
 *
 *   /archive/print?ids=3,7,12          explicit selection, order preserved
 *   /archive/print?day=2026-09-19      everyone discharged that local day
 *   /archive/print?month=2026-09       a whole monthly archive
 *
 * Add &autoprint=1 to open the print dialog once the records have loaded,
 * which is what the export buttons on the discharge register do.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/ui";
import { DischargeSheet } from "@/components/discharge-sheet";
import {
  dayOf,
  dischargeOf,
  formatDayLabel,
  formatMonthLabel,
  isDischarged,
  monthOf,
  parseIdList,
} from "@/lib/discharge";
import type { Archivable } from "@/lib/discharge";
import type { Detail } from "@/lib/types";

type BoardRow = Archivable & Record<string, unknown>;

function ArchivePrint() {
  const params = useSearchParams();
  const idsParam = params.get("ids");
  const day = params.get("day") ?? "";
  const month = params.get("month") ?? "";
  const autoprint = params.get("autoprint") === "1";

  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const [error, setError] = useState<string>("");
  const printed = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/board", { cache: "no-store" });
        if (!r.ok) throw new Error(`board request failed (${r.status})`);
        const j = await r.json();
        if (live) setRows((j.babies ?? []) as BoardRow[]);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load the board.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Which babies this URL asks for, in the order they should be printed. */
  const selected = useMemo<BoardRow[]>(() => {
    if (!rows) return [];
    const explicit = parseIdList(idsParam);
    if (explicit.length) {
      const byId = new Map(rows.map((r) => [r.id, r]));
      return explicit.map((id) => byId.get(id)).filter((r): r is BoardRow => !!r);
    }
    if (day) return dayOf(rows, day) as BoardRow[];
    if (month) return (monthOf(rows, month)?.babies ?? []) as BoardRow[];
    return [];
  }, [rows, idsParam, day, month]);

  const ids = useMemo(() => selected.map((s) => s.id), [selected]);

  // Fetch each chart. Chunked so a 40-baby month does not fire 40 requests at once.
  useEffect(() => {
    if (!ids.length) return;
    let live = true;
    (async () => {
      const CHUNK = 6;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const settled = await Promise.all(
          slice.map(async (id) => {
            try {
              const r = await fetch(`/api/babies/${id}`, { cache: "no-store" });
              if (!r.ok) return { id, detail: null };
              return { id, detail: (await r.json()) as Detail };
            } catch {
              return { id, detail: null };
            }
          }),
        );
        if (!live) return;
        setDetails((prev) => {
          const next = { ...prev };
          for (const s of settled) if (s.detail) next[s.id] = s.detail;
          return next;
        });
        setFailed((prev) => [...new Set([...prev, ...settled.filter((s) => !s.detail).map((s) => s.id)])]);
      }
    })();
    return () => {
      live = false;
    };
  }, [ids]);

  const ready = rows !== null && ids.every((id) => details[id] || failed.includes(id));

  const doPrint = useCallback(() => window.print(), []);

  // Open the print dialog once every record in the batch has resolved.
  useEffect(() => {
    if (!autoprint || !ready || !ids.length || printed.current) return;
    printed.current = true;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoprint, ready, ids.length]);

  const title = day
    ? `Discharged ${formatDayLabel(day)}`
    : month
      ? `Discharge archive — ${formatMonthLabel(month)}`
      : `Discharge records (${selected.length})`;

  const stillActive = selected.filter((s) => !isDischarged(s));

  return (
    <main className="min-h-screen pb-24">
      <TopBar />
      <div className="mx-auto max-w-[1000px] px-4 py-4">
        <div className="no-print card mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-black text-white">{title}</h1>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {selected.length} record{selected.length === 1 ? "" : "s"} ·{" "}
                {Object.keys(details).length} loaded
                {failed.length > 0 && ` · ${failed.length} could not be loaded`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/discharge" className="btn-ghost">
                ← Discharge register
              </Link>
              <button className="btn-primary" onClick={doPrint} disabled={!ready || !selected.length}>
                🖨️ Print / save as PDF
              </button>
            </div>
          </div>
          {stillActive.length > 0 && (
            <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
              {stillActive.length} of these are not marked discharged yet (
              {stillActive.map((s) => s.babyName).join(", ")}). The record will print, but the discharge block will be
              incomplete.
            </p>
          )}
          {!ready && !error && <p className="mt-3 text-[11px] text-slate-400">Loading records…</p>}
          {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}
        </div>

        {selected.map((s, i) => {
          const d = details[s.id];
          if (!d)
            return (
              <div key={s.id} className="card mb-3 p-4 text-xs text-slate-400">
                {s.babyName} ({s.uhid}) — record could not be loaded.
              </div>
            );
          return (
            <div key={s.id} className="print-page-break mb-4">
              <DischargeSheet d={d} record={dischargeOf(s)} index={i} total={selected.length} />
            </div>
          );
        })}

        {ready && selected.length === 0 && !error && (
          <div className="card p-6 text-center text-sm text-slate-400">
            No babies match this export.
          </div>
        )}
      </div>
    </main>
  );
}

export default function ArchivePrintPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen">
          <TopBar />
          <div className="p-10 text-center text-slate-400">Preparing discharge records…</div>
        </main>
      }
    >
      <ArchivePrint />
    </Suspense>
  );
}
