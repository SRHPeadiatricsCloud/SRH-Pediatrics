"use client";

import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  StickyNote,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { fmtTime } from "@/lib/clinical";

export type ActionItem = {
  id: number;
  text: string;
  done: boolean;
  doneAt?: string | null;
  doneBy?: string;
  scheduledAt?: string | null;
  note?: string;
  priority?: string;
  owner?: string;
};

const PRIORITY_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  now: { label: "NOW", cls: "border-rose-400/40 bg-rose-500/15 text-rose-200", icon: <AlertOctagon size={10} /> },
  today: { label: "TODAY", cls: "border-amber-400/40 bg-amber-500/15 text-amber-200", icon: <CalendarClock size={10} /> },
  routine: { label: "ROUTINE", cls: "border-sky-400/40 bg-sky-500/15 text-sky-200", icon: <ListTodo size={10} /> },
};

const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
const toTimeInput = (iso?: string | null) => (iso ? iso.slice(11, 16) : "");
const fromInputs = (date: string, time: string): string | null => {
  if (!date) return null;
  return new Date(`${date}T${time || "00:00"}`).toISOString();
};

/**
 * Open-action checklist with full detail: priority, owner, manually entered
 * due date/time, free-text note, and completion stamp (time + signer).
 */
export function ActionChecklist({
  tasks,
  onToggle,
  onSchedule,
  showDone = true,
  emptyLabel = "All actions completed.",
}: {
  tasks: ActionItem[];
  onToggle: (id: number, done: boolean) => void;
  onSchedule?: (id: number, iso: string | null) => void;
  showDone?: boolean;
  emptyLabel?: string;
}) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <div className="space-y-1.5">
      {open.length === 0 && done.length === 0 && (
        <p className="text-[11px] text-slate-500">{emptyLabel}</p>
      )}
      <ul className="space-y-1.5">
        {open.map((t, idx) => {
          const pm = PRIORITY_META[t.priority ?? "today"] ?? PRIORITY_META.today;
          const isEditing = editing === t.id;
          return (
            <li
              key={t.id}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-2 transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onToggle(t.id, true)}
                  title="Mark completed (stamps time + your name)"
                  className="mt-0.5 shrink-0 text-slate-500 transition hover:text-emerald-300"
                >
                  <Circle size={15} strokeWidth={2} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="grid h-4 w-4 place-items-center rounded bg-white/10 text-[9px] font-black text-slate-300">
                      {idx + 1}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-100">{t.text}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-bold ${pm.cls}`}>
                      {pm.icon}
                      {pm.label}
                    </span>
                    {t.owner && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <User size={10} /> {t.owner}
                      </span>
                    )}
                    {t.scheduledAt ? (
                      <span className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 font-bold text-cyan-200">
                        <Clock size={10} /> due {fmtTime(t.scheduledAt)}
                      </span>
                    ) : (
                      <span className="text-[10px] italic text-slate-500">due: not set</span>
                    )}
                    {t.note && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <StickyNote size={10} /> {t.note}
                      </span>
                    )}
                  </div>
                  {isEditing && onSchedule && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <CalendarClock size={11} />
                        <input
                          type="date"
                          className="inp !w-auto !px-1.5 !py-0.5 text-[11px]"
                          value={toDateInput(t.scheduledAt)}
                          onChange={(e) =>
                            onSchedule(t.id, fromInputs(e.target.value, toTimeInput(t.scheduledAt)))
                          }
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock size={11} />
                        <input
                          type="time"
                          className="inp !w-auto !px-1.5 !py-0.5 text-[11px]"
                          value={toTimeInput(t.scheduledAt)}
                          onChange={(e) =>
                            onSchedule(t.id, fromInputs(toDateInput(t.scheduledAt) || toDateInput(new Date().toISOString()), e.target.value))
                          }
                        />
                      </label>
                      {t.scheduledAt && (
                        <button
                          type="button"
                          className="text-[10px] font-bold text-rose-300 hover:text-rose-200"
                          onClick={() => onSchedule(t.id, null)}
                        >
                          clear
                        </button>
                      )}
                      <span className="text-[9px] italic text-slate-500">manual entry only</span>
                    </div>
                  )}
                </div>
                {onSchedule && (
                  <button
                    type="button"
                    title={isEditing ? "Close scheduler" : "Set due date & time (manual)"}
                    onClick={() => setEditing(isEditing ? null : t.id)}
                    className={`shrink-0 rounded-lg border px-1.5 py-1 transition ${
                      isEditing
                        ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200"
                        : "border-white/10 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200"
                    }`}
                  >
                    <Clock size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {showDone && done.length > 0 && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-2">
          <div className="lbl mb-1 text-emerald-300">Completed ({done.length})</div>
          <ul className="space-y-1">
            {done.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => onToggle(t.id, false)}
                  title="Re-open action"
                  className="mt-0.5 shrink-0 text-emerald-300 hover:text-emerald-200"
                >
                  <CheckCircle2 size={14} strokeWidth={2.4} />
                </button>
                <div className="min-w-0 flex-1">
                  <span className="text-slate-400 line-through">{t.text}</span>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-emerald-300/90">
                    <span>✓ done {t.doneAt ? fmtTime(t.doneAt) : ""}</span>
                    {t.doneBy && <span>by {t.doneBy}</span>}
                    {t.scheduledAt && <span className="text-slate-400">was due {fmtTime(t.scheduledAt)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-slate-500 hover:text-rose-300"
                  title="Remove from list"
                  onClick={() => onToggle(t.id, false)}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
