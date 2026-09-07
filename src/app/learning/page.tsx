"use client";

import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar, api, useLocked, usePoll } from "@/components/ui";
import { fmtTime } from "@/lib/clinical";

type Item = {
  id: number;
  day: string;
  time: string;
  title: string;
  kind: string;
  presenter: string;
  venue: string;
  audience: string;
  notes: string;
  link: string;
  createdBy: string;
  updatedAt: string;
};

const KINDS = [
  { key: "class", label: "Class", icon: GraduationCap, tone: "text-cyan-300 bg-cyan-400/10 border-cyan-400/30" },
  { key: "seminar", label: "Seminar", icon: BookOpen, tone: "text-violet-300 bg-violet-400/10 border-violet-400/30" },
  { key: "journal", label: "Journal club", icon: BookOpen, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30" },
  { key: "grandround", label: "Grand round", icon: Users, tone: "text-rose-300 bg-rose-400/10 border-rose-400/30" },
  { key: "skills", label: "Skills lab", icon: CalendarClock, tone: "text-amber-300 bg-amber-400/10 border-amber-400/30" },
  { key: "webinar", label: "Webinar", icon: ExternalLink, tone: "text-sky-300 bg-sky-400/10 border-sky-400/30" },
];

const AUDIENCE = ["Interns", "PGs", "SRs", "Consultants", "Nursing", "Everyone"];

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const EMPTY: Omit<Item, "id" | "createdBy" | "updatedAt"> = {
  day: todayStr(),
  time: "",
  title: "",
  kind: "class",
  presenter: "",
  venue: "",
  audience: "Everyone",
  notes: "",
  link: "",
};

export default function LearningPage() {
  const locked = useLocked();
  const [day, setDay] = useState(todayStr());
  const { data, reload } = usePoll<{ rows: Item[] }>(`/api/learning?day=${day}`, 8000);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState<typeof EMPTY>({ ...EMPTY, day });

  useEffect(() => setDraft((p) => ({ ...p, day })), [day]);

  const save = useCallback(async () => {
    if (!draft.title.trim()) return;
    if (editing) {
      await api("/api/learning", "PATCH", { id: editing.id, ...draft });
      setEditing(null);
    } else {
      await api("/api/learning", "POST", draft);
    }
    setDraft({ ...EMPTY, day });
    reload();
  }, [draft, editing, day, reload]);

  const remove = useCallback(
    async (id: number) => {
      if (!confirm("Remove this scheduled session?")) return;
      await api(`/api/learning?id=${id}`, "DELETE");
      reload();
    },
    [reload],
  );

  return (
    <main className="min-h-screen pb-20">
      <TopBar live onRefresh={reload} />
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <GraduationCap size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white">Learning Space</h1>
              <p className="text-[11px] text-slate-400">
                Department of Pediatrics · today's scheduled classes, seminars, journal clubs and skills lab —
                enter and edit manually
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className="btn-ghost !px-2.5" onClick={() => setDay(todayStr(-1))} title="Previous day">
                <ChevronLeft size={15} />
              </button>
              <input
                type="date"
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                className="inp !w-auto !py-1.5 text-sm font-bold"
              />
              <button className="btn-ghost !px-2.5" onClick={() => setDay(todayStr(1))} title="Next day">
                <ChevronRight size={15} />
              </button>
              <button className="btn-ghost" onClick={() => setDay(todayStr())}>
                Today
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                🖨️ Print day
              </button>
            </div>
          </div>
        </div>

        {!locked && (
          <section className="card mb-4 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Plus size={15} className="text-cyan-300" />
              <h2 className="text-sm font-black text-white">
                {editing ? `Editing session #${editing.id}` : "Add a scheduled session"}
              </h2>
              {editing && (
                <button
                  className="btn-ghost !py-1 text-[11px]"
                  onClick={() => {
                    setEditing(null);
                    setDraft({ ...EMPTY, day });
                  }}
                >
                  Cancel edit
                </button>
              )}
              <button
                className="btn-primary ml-auto !py-1.5 text-[11px]"
                disabled={!draft.title.trim()}
                onClick={save}
              >
                {editing ? "Save changes" : "Add to schedule"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              <label>
                <span className="lbl mb-1 block">Time (HH:MM)</span>
                <input
                  className="inp"
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft((p) => ({ ...p, time: e.target.value }))}
                />
              </label>
              <label className="md:col-span-2">
                <span className="lbl mb-1 block">Topic / title *</span>
                <input
                  className="inp"
                  value={draft.title}
                  placeholder="e.g. Approach to neonatal seizures"
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label>
                <span className="lbl mb-1 block">Kind</span>
                <select
                  className="inp"
                  value={draft.kind}
                  onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value }))}
                >
                  {KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="lbl mb-1 block">Presenter</span>
                <input
                  className="inp"
                  value={draft.presenter}
                  placeholder="Dr. Name"
                  onChange={(e) => setDraft((p) => ({ ...p, presenter: e.target.value }))}
                />
              </label>
              <label>
                <span className="lbl mb-1 block">Venue</span>
                <input
                  className="inp"
                  value={draft.venue}
                  placeholder="Seminar hall / online link"
                  onChange={(e) => setDraft((p) => ({ ...p, venue: e.target.value }))}
                />
              </label>
              <label>
                <span className="lbl mb-1 block">Audience</span>
                <select
                  className="inp"
                  value={draft.audience}
                  onChange={(e) => setDraft((p) => ({ ...p, audience: e.target.value }))}
                >
                  {AUDIENCE.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="lbl mb-1 block">Link (optional)</span>
                <input
                  className="inp"
                  value={draft.link}
                  placeholder="https://…"
                  onChange={(e) => setDraft((p) => ({ ...p, link: e.target.value }))}
                />
              </label>
              <label className="sm:col-span-2 md:col-span-4">
                <span className="lbl mb-1 block">Notes</span>
                <textarea
                  className="inp"
                  rows={2}
                  value={draft.notes}
                  placeholder="Pre-reading, cases to bring, etc."
                  onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
            </div>
          </section>
        )}

        <section className="card p-0">
          <div className="border-b border-white/10 p-4">
            <h2 className="text-sm font-black text-white">
              Sessions on{" "}
              <span className="text-cyan-300">
                {new Date(day + "T00:00").toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>{" "}
              <span className="text-slate-400">· {rows.length} scheduled</span>
            </h2>
          </div>

          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">
              No sessions on this day yet.{" "}
              {locked ? "Sign in to add." : "Use the form above to add today's classes."}
            </p>
          )}

          <ol className="divide-y divide-white/5">
            {rows.map((r) => {
              const kind = KINDS.find((k) => k.key === r.kind) ?? KINDS[0];
              const Icon = kind.icon;
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-3 p-4 transition hover:bg-white/[0.03]">
                  <div className="flex items-start gap-2">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${kind.tone}`}>
                      <Icon size={16} />
                    </span>
                    <div className="text-right leading-tight">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <Clock size={9} className="mr-0.5 inline" />
                        {r.time || "TBD"}
                      </div>
                      <div className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${kind.tone}`}>
                        {kind.label}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-white">{r.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
                      {r.presenter && (
                        <span>
                          <Users size={11} className="mr-1 inline text-slate-400" />
                          {r.presenter}
                        </span>
                      )}
                      {r.venue && (
                        <span>
                          <MapPin size={11} className="mr-1 inline text-slate-400" />
                          {r.venue}
                        </span>
                      )}
                      {r.audience && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                          {r.audience}
                        </span>
                      )}
                      {r.link && (
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                        >
                          <ExternalLink size={11} /> open
                        </a>
                      )}
                    </div>
                    {r.notes && <p className="mt-1 text-[11px] text-slate-400">{r.notes}</p>}
                    <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                      added {fmtTime(r.updatedAt)} · {r.createdBy || "—"}
                    </p>
                  </div>
                  {!locked && (
                    <div className="ml-auto flex gap-1">
                      <button
                        className="btn-ghost !px-2 !py-1 text-[11px]"
                        onClick={() => {
                          setEditing(r);
                          setDraft({
                            day: r.day,
                            time: r.time,
                            title: r.title,
                            kind: r.kind,
                            presenter: r.presenter,
                            venue: r.venue,
                            audience: r.audience,
                            notes: r.notes,
                            link: r.link,
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        className="btn-ghost !px-2 !py-1 text-[11px] text-rose-300"
                        onClick={() => remove(r.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {locked && (
          <p className="mt-3 text-center text-[11px] text-amber-200/90">
            🔒 View-only — sign your name in "Signed as" to add or edit sessions.
          </p>
        )}
      </div>
    </main>
  );
}
