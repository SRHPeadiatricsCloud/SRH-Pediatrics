"use client";

import {
  BookOpen,
  ExternalLink,
  Globe,
  Newspaper,
  Pin,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { TopBar, api, useLocked, usePoll } from "@/components/ui";
import { fmtTime, relTime } from "@/lib/clinical";

type Row = {
  id: number;
  title: string;
  source: string;
  url: string;
  summary: string;
  tags: string;
  publishedAt: string | null;
  fetchedAt: string;
  pinnedBy: string;
};

export default function UpdatesPage() {
  const locked = useLocked();
  const { data, reload } = usePoll<{ rows: Row[]; refreshedCount: number; sources: string[] }>(
    "/api/updates",
    5 * 60 * 1000,
  );
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", source: "", url: "", summary: "", tags: "" });

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.source) set.add(r.source);
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const shown = rows.filter((r) => {
    if (filter !== "all" && r.source !== filter) return false;
    if (!q.trim()) return true;
    const hay = `${r.title} ${r.summary} ${r.tags} ${r.source}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/updates?refresh=1", { cache: "no-store" });
    } finally {
      setRefreshing(false);
      reload();
    }
  }, [reload]);

  const remove = useCallback(
    async (id: number) => {
      if (!confirm("Remove this item from Recent Updates?")) return;
      await api(`/api/updates?id=${id}`, "DELETE");
      reload();
    },
    [reload],
  );

  const addCustom = useCallback(async () => {
    if (!draft.title.trim()) return;
    await api("/api/updates", "POST", draft);
    setDraft({ title: "", source: "", url: "", summary: "", tags: "" });
    setCustomOpen(false);
    reload();
  }, [draft, reload]);

  return (
    <main className="min-h-screen pb-20">
      <TopBar live onRefresh={reload} />
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300">
              <Newspaper size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white">Recent Updates in Pediatrics</h1>
              <p className="text-[11px] text-slate-400">
                Auto-refreshed headlines &amp; journal alerts from{" "}
                {(data?.sources ?? ["AAP", "Lancet", "BMJ", "WHO", "Medscape"]).join(" · ")}. Curated feeds; add your
                own using the button.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="inp !py-1.5 !pl-7 !pr-2 text-xs"
                  placeholder="Search updates"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button className="btn-ghost" onClick={refresh} disabled={refreshing}>
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />{" "}
                {refreshing ? "Refreshing…" : "Refresh from web"}
              </button>
              {!locked && (
                <button className="btn-primary !py-1.5" onClick={() => setCustomOpen((v) => !v)}>
                  <Pin size={13} /> Add / pin
                </button>
              )}
            </div>
          </div>

          {sources.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Source</span>
              {sources.map((s) => (
                <button
                  key={s}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    filter === s
                      ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
                  }`}
                  onClick={() => setFilter(s)}
                >
                  {s === "all" ? "All sources" : s}
                </button>
              ))}
            </div>
          )}
        </div>

        {customOpen && !locked && (
          <section className="card mb-4 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Pin size={15} className="text-cyan-300" />
              <h2 className="text-sm font-black text-white">Pin a custom update</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="inp"
                placeholder="Title *"
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              />
              <input
                className="inp"
                placeholder="Source (e.g. Cochrane)"
                value={draft.source}
                onChange={(e) => setDraft((p) => ({ ...p, source: e.target.value }))}
              />
              <input
                className="inp sm:col-span-2"
                placeholder="Link (https://…)"
                value={draft.url}
                onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))}
              />
              <textarea
                className="inp sm:col-span-2"
                rows={2}
                placeholder="Summary / take-away"
                value={draft.summary}
                onChange={(e) => setDraft((p) => ({ ...p, summary: e.target.value }))}
              />
              <input
                className="inp sm:col-span-2"
                placeholder="Tags (comma separated)"
                value={draft.tags}
                onChange={(e) => setDraft((p) => ({ ...p, tags: e.target.value }))}
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={addCustom} disabled={!draft.title.trim()}>
                <Pin size={12} /> Pin update
              </button>
            </div>
          </section>
        )}

        <section className="card p-0">
          {shown.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">
              No updates yet. Tap <b className="text-white">Refresh from web</b> to fetch the latest headlines.
            </p>
          )}
          <ol className="divide-y divide-white/5">
            {shown.map((r) => (
              <li key={r.id} className="p-4 transition hover:bg-white/[0.03]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <a
                    href={r.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-black text-white hover:text-cyan-200"
                  >
                    {r.title}
                  </a>
                  {r.url && <ExternalLink size={12} className="text-cyan-300" />}
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">
                    {r.publishedAt ? relTime(r.publishedAt) : `fetched ${relTime(r.fetchedAt)}`}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                  {r.source && (
                    <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase text-slate-200">
                      <BookOpen size={9} /> {r.source}
                    </span>
                  )}
                  {r.pinnedBy && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-400/15 px-1.5 py-0.5 font-bold uppercase text-emerald-200">
                      <Pin size={9} /> pinned by {r.pinnedBy}
                    </span>
                  )}
                  {r.tags &&
                    r.tags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((t) => (
                        <span
                          key={t}
                          className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-slate-300"
                        >
                          #{t}
                        </span>
                      ))}
                  {r.publishedAt && (
                    <span className="text-slate-500">· published {fmtTime(r.publishedAt)}</span>
                  )}
                </div>
                {r.summary && <p className="mt-1 text-xs leading-snug text-slate-300">{r.summary}</p>}
                {!locked && r.pinnedBy && (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      className="btn-ghost !px-2 !py-1 text-[10px] text-rose-300"
                      onClick={() => remove(r.id)}
                    >
                      <Trash2 size={11} /> remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-3 text-center text-[10px] text-slate-500">
          <Globe size={10} className="mr-1 inline" /> Sources are open feeds from AAP, Lancet Child &amp; Adolescent
          Health, BMJ ADC, WHO and Medscape. When the internet is unreachable, the last successful fetch stays
          visible.
        </p>
      </div>
    </main>
  );
}
