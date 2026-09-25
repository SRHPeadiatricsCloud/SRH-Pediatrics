"use client";

/**
 * Statistics & QI — the unit's numbers in one place.
 *
 * One tab holds both reports behind a view switch:
 *  - Month-end report: one month's census, case mix, interventions, growth,
 *    outcomes and month-over-month progress (src/lib/stats.ts).
 *  - Unit QI scorecard: the all-time Level III-B analytics & quality report —
 *    data quality, mortality & CRIB-II, every morbidity domain, trends, the
 *    quality-indicator dashboard, Pareto and subgroups (src/lib/analytics.ts).
 *
 * Both keep their own Excel & PDF exports; per-baby QI fields are captured on
 * each chart's "QI data" tab.
 */
import { useState } from "react";
import { BarChart3, LineChart } from "lucide-react";
import { TopBar } from "@/components/ui";
import { MonthReport } from "./month-report";
import { QiScorecard } from "./qi-scorecard";

type View = "month" | "qi";

export default function StatisticsPage() {
  const [view, setView] = useState<View>("month");
  return (
    <div className="min-h-screen">
      <TopBar live />
      {/* view switcher — deliberately not sticky so print/PDF stays clean */}
      <div className="no-print mx-auto max-w-[1600px] px-4 pt-4">
        <div className="card inline-flex flex-wrap gap-1 p-1">
          <button
            type="button"
            onClick={() => setView("month")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
              view === "month" ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 size={13} /> Month-end report
          </button>
          <button
            type="button"
            onClick={() => setView("qi")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
              view === "qi" ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LineChart size={13} /> Unit QI scorecard
          </button>
        </div>
      </div>
      {view === "month" ? <MonthReport /> : <QiScorecard />}
    </div>
  );
}
