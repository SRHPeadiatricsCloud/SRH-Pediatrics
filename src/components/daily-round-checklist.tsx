"use client";

import type { Detail } from "@/lib/types";
import { dailyRound, type RoundItem, type RoundState } from "@/lib/daily-round";
import { CheckCircle2, Circle, Clock, AlertTriangle, Minus } from "lucide-react";

interface DailyRoundChecklistProps {
  detail: Detail;
  onNavigateTab?: (tabName: string) => void;
}

const TAB_TARGETS: Record<string, string> = {
  weight: "Vitals & growth",
  obs: "Vitals & growth",
  feeds: "Fluids & feeds",
  actions: "Daily progress",
  lines: "Daily progress",
  medicines: "Daily progress",
  problems: "Daily progress",
};

function stateBadge(state: RoundState) {
  switch (state) {
    case "done":
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
        chipCls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tag: "DONE",
      };
    case "overdue":
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-400 animate-pulse" />,
        chipCls: "border-rose-500/40 bg-rose-500/15 text-rose-300 font-semibold",
        tag: "DUE",
      };
    case "todo":
      return {
        icon: <Clock className="h-3.5 w-3.5 text-amber-400" />,
        chipCls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        tag: "PENDING",
      };
    case "na":
      return {
        icon: <Minus className="h-3.5 w-3.5 text-slate-500" />,
        chipCls: "border-slate-700 bg-slate-800/30 text-slate-400",
        tag: "N/A",
      };
  }
}

export function DailyRoundChecklist({ detail, onNavigateTab }: DailyRoundChecklistProps) {
  const round = dailyRound(detail);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Level IIIB Daily Ward Round Check
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {round.overdue > 0 && (
            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-bold text-rose-300 border border-rose-500/30">
              {round.overdue} overdue
            </span>
          )}
          {round.outstanding === 0 ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300 border border-emerald-500/30">
              Round complete
            </span>
          ) : (
            <span className="text-slate-400">
              {round.items.length - round.outstanding}/{round.items.length} completed
            </span>
          )}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {round.items.map((item: RoundItem) => {
          const badge = stateBadge(item.state);
          const tab = TAB_TARGETS[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => tab && onNavigateTab?.(tab)}
              className={`flex flex-col justify-between rounded-lg border p-2 text-left transition-all hover:border-cyan-500/50 hover:bg-slate-800/50 ${badge.chipCls}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold tracking-tight text-slate-200">{item.label}</span>
                {badge.icon}
              </div>
              <div className="mt-1 text-[10px] truncate text-slate-300" title={item.value}>
                {item.value}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono opacity-80">
                <span>{badge.tag}</span>
                {tab && <span className="text-[8px] text-cyan-300/80">→</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
