"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui";
import type { Detail } from "@/lib/types";

type EventLogEntry = {
  date?: string;
  result?: string;
  starting?: string;
  ending?: string;
  notes?: string;
};

type EventLogMap = Record<string, EventLogEntry>;

type EventDef = {
  key: string;
  label: string;
  color: string; // tailwind bg
  textColor: string;
  borderColor: string;
  group: "respiratory" | "lines" | "infection" | "feeds" | "imaging";
  fields: ("starting" | "ending" | "date" | "result" | "notes")[];
};

// Order and colors as per NICU paper MRD/089 — left to right as on sheet
// Second image (left side): VENT, CPAP, SURFACTANT, NASAL FLOW, CAFFEINE, UVC, PICC, NS BOLUSES
// First image (right side): ANTIBIOTICS x2, EVENT, BLOOD CULTURES x2, FIRST FEED, FULL FEED, HMF, PO FEEDS, DBF, NEC, CUS1-3, ECHO1-2, ROP1-2, PHOTOTHERAPY
export const EVENT_DEFS: EventDef[] = [
  // Respiratory & support — blue / green / orange / violet / pink
  { key: "VENTILATION", label: "VENTILATION", color: "bg-[#0ea5e9]", textColor: "text-white", borderColor: "border-sky-600", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "CPAP", label: "CPAP", color: "bg-[#16a34a]", textColor: "text-white", borderColor: "border-green-700", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "SURFACTANT", label: "SURFACTANT", color: "bg-[#fb923c]", textColor: "text-[#4a1f00]", borderColor: "border-orange-400", group: "respiratory", fields: ["date", "result", "notes"] },
  { key: "NASAL_FLOW", label: "NASAL FLOW", color: "bg-[#a78bfa]", textColor: "text-white", borderColor: "border-violet-400", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "CAFFEINE", label: "CAFFEINE", color: "bg-[#f9a8d4]", textColor: "text-[#4a1030]", borderColor: "border-pink-300", group: "respiratory", fields: ["starting", "ending", "notes"] },
  // Lines & fluids — yellow / amber
  { key: "UVC", label: "UVC", color: "bg-[#facc15]", textColor: "text-[#422006]", borderColor: "border-yellow-400", group: "lines", fields: ["starting", "ending", "notes"] },
  { key: "PICC", label: "PICC", color: "bg-[#fde68a]", textColor: "text-[#422006]", borderColor: "border-amber-200", group: "lines", fields: ["starting", "ending", "notes"] },
  { key: "NS_BOLUSES", label: "NS BOLUSES", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "lines", fields: ["date", "result", "notes"] },

  // Infection — amber / gray / yellow
  { key: "ANTIBIOTICS_1", label: "ANTIBIOTICS", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "infection", fields: ["date", "result", "notes"] },
  { key: "ANTIBIOTICS_2", label: "ANTIBIOTICS", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "infection", fields: ["date", "result", "notes"] },
  { key: "BLOOD_CULTURE_1", label: "BLOOD CULTURES", color: "bg-[#e2e8f0]", textColor: "text-[#1e293b]", borderColor: "border-slate-300", group: "infection", fields: ["date", "result"] },
  { key: "BLOOD_CULTURE_2", label: "BLOOD CULTURES", color: "bg-[#e2e8f0]", textColor: "text-[#1e293b]", borderColor: "border-slate-300", group: "infection", fields: ["date", "result"] },
  { key: "EVENT", label: "EVENT", color: "bg-[#fde047]", textColor: "text-[#422006]", borderColor: "border-yellow-300", group: "infection", fields: ["date", "result", "notes"] },

  // Feeds & GI — light green
  { key: "FIRST_FEED", label: "FIRST FEED", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "FULL_FEED", label: "FULL FEED", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "HMF", label: "HMF (MAX STRENGTH)", color: "bg-[#86efac]", textColor: "text-[#14532d]", borderColor: "border-green-400", group: "feeds", fields: ["date", "result"] },
  { key: "PO_FEEDS", label: "PO FEEDS", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "DBF", label: "DBF", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "NEC", label: "NEC", color: "bg-[#86efac]", textColor: "text-[#14532d]", borderColor: "border-green-400", group: "feeds", fields: ["date", "result", "notes"] },

  // Imaging — lavender gray / light blue / sage / amber
  { key: "CUS1", label: "CUS1", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "CUS2", label: "CUS2", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "CUS3", label: "CUS3", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "ECHO1", label: "ECHO1", color: "bg-[#bae6fd]", textColor: "text-[#0c4a6e]", borderColor: "border-sky-200", group: "imaging", fields: ["date", "result"] },
  { key: "ECHO2", label: "ECHO 2", color: "bg-[#bae6fd]", textColor: "text-[#0c4a6e]", borderColor: "border-sky-200", group: "imaging", fields: ["date", "result"] },
  { key: "ROP1", label: "ROP SCREEN 1", color: "bg-[#a7f3d0]", textColor: "text-[#14532d]", borderColor: "border-emerald-200", group: "imaging", fields: ["date", "result"] },
  { key: "ROP2", label: "ROP SCREEN 2", color: "bg-[#a7f3d0]", textColor: "text-[#14532d]", borderColor: "border-emerald-200", group: "imaging", fields: ["date", "result"] },
  { key: "PHOTOTHERAPY", label: "PHOTOTHERAPY", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "imaging", fields: ["date", "result", "notes"] },
];

export function EventLogTab({
  d,
  patch,
  user,
}: {
  d: Detail;
  id?: string;
  reload?: () => void;
  user?: string;
  patch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const initial = useMemo(() => {
    const raw = (d.baby.clinical as Record<string, unknown>)?.eventLog as EventLogMap | undefined;
    return raw ?? {};
  }, [d.baby.clinical]);

  const [log, setLog] = useState<EventLogMap>(initial);
  const [saving, setSaving] = useState(false);

  // Keep local in sync if server updates
  useMemo(() => {
    setLog(initial);
  }, [initial]);

  const setField = (key: string, field: keyof EventLogEntry, value: string) => {
    setLog((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [field]: value },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await patch({
        clinical: { ...(d.baby.clinical as object), eventLog: log },
        logEvent: { kind: "event_log", text: `Event log updated — ${Object.keys(log).length} entries`, author: user ?? "Team" },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title="NICU Event Log — MRD/089 — Color-coded as per unit sheet"
        sub="Same order and colours as the paper sheet"
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on blur — Save to cloud</span>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save event log"}
            </button>
          </div>
        }
      >
        {/* Paper replica header */}
        <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] text-slate-300">
          <p className="font-bold text-amber-200">Paper reference — handwritten examples from attached sheets:</p>
          <ul className="mt-1 list-disc pl-5 text-[11px] text-slate-400">
            <li>FIRST FEED: 9/9/26, FULL FEED: 9/9/26, PO FEEDS: 6/9/25, DBF: 9/9/26</li>
            <li>CUS1: 9/9/26 → Abdomen → Partial thrombosis of left portal vein → 48-14 splenomegaly</li>
            <li>PHOTOTHERAPY: 5/9/26 SSPT Start @ 9:40am, 7:30pm TSPT Start, 9/9/26 TSPT Stop @ 12pm, 13/9/26 DSPT Started @ 9:15pm, 13/9/26 DSPT booked at 9:15pm</li>
            <li>NS BOLUSES: Bili, PICC: 7/9/26, UVC: Q.3gm in 4hrs, GA 46 wks BW 2.333kg, S/N Prasanya R</li>
          </ul>
        </div>

        {/* Horizontal scroll table mimicking paper */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-[1800px] border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-24 bg-slate-900 p-2 text-left text-[10px] uppercase tracking-wide text-slate-400">Field</th>
                {EVENT_DEFS.map((ev) => (
                  <th
                    key={ev.key}
                    className={`min-w-[140px] border border-white/10 p-1 text-center text-[10px] font-black uppercase tracking-wide ${ev.color} ${ev.textColor} ${ev.borderColor}`}
                  >
                    {ev.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* DATE / STARTING */}
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 p-2 text-[10px] font-bold uppercase text-amber-200">DATE / STARTING</td>
                {EVENT_DEFS.map((ev) => {
                  const field = ev.fields.includes("starting") ? "starting" : "date";
                  return (
                    <td key={ev.key} className="border border-white/10 bg-white/[0.02] p-1">
                      <input
                        type="text"
                        placeholder={field === "starting" ? "Starting" : "Date"}
                        value={(log[ev.key] as Record<string, string>)?.[field] ?? ""}
                        onChange={(e) => setField(ev.key, field as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                        className="w-full rounded bg-slate-950/60 px-1.5 py-1 text-[11px] text-white outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-400/40"
                      />
                    </td>
                  );
                })}
              </tr>
              {/* RESULT / ENDING */}
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 p-2 text-[10px] font-bold uppercase text-amber-200">RESULT / ENDING</td>
                {EVENT_DEFS.map((ev) => {
                  const field = ev.fields.includes("ending") ? "ending" : "result";
                  return (
                    <td key={ev.key} className="border border-white/10 bg-white/[0.02] p-1">
                      <textarea
                        placeholder={field === "ending" ? "Ending" : "Result"}
                        value={(log[ev.key] as Record<string, string>)?.[field] ?? ""}
                        onChange={(e) => setField(ev.key, field as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                        rows={ev.key === "PHOTOTHERAPY" ? 4 : 2}
                        className="w-full resize-y rounded bg-slate-950/60 px-1.5 py-1 text-[11px] text-white outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-400/40"
                      />
                    </td>
                  );
                })}
              </tr>
              {/* NOTES */}
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 p-2 text-[10px] font-bold uppercase text-slate-400">NOTES</td>
                {EVENT_DEFS.map((ev) => (
                  <td key={ev.key} className="border border-white/10 bg-white/[0.02] p-1">
                    {ev.fields.includes("notes") ? (
                      <textarea
                        placeholder="Notes"
                        value={log[ev.key]?.notes ?? ""}
                        onChange={(e) => setField(ev.key, "notes", e.target.value)}
                        onBlur={save}
                        rows={2}
                        className="w-full resize-y rounded bg-slate-950/40 px-1.5 py-1 text-[10px] text-slate-300 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-400/30"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Card view for mobile — same colors and order */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_DEFS.map((ev) => {
            const entry = log[ev.key] ?? {};
            const hasData = !!(entry.date || entry.result || entry.starting || entry.ending || entry.notes);
            return (
              <div key={ev.key} className={`overflow-hidden rounded-xl border ${ev.borderColor} bg-slate-900/50 ${hasData ? "ring-1 ring-cyan-400/20" : ""}`}>
                <div className={`flex items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-wide ${ev.color} ${ev.textColor}`}>
                  <span>{ev.label}</span>
                  <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px]">{ev.group}</span>
                </div>
                <div className="space-y-2 p-3">
                  {(ev.fields.includes("starting") || ev.fields.includes("date")) && (
                    <label className="block">
                      <span className="lbl mb-1 block text-[10px]">{ev.fields.includes("starting") ? "Starting" : "Date"}</span>
                      <input
                        className="inp text-xs"
                        value={(entry as Record<string, string>)[ev.fields.includes("starting") ? "starting" : "date"] ?? ""}
                        onChange={(e) => setField(ev.key, (ev.fields.includes("starting") ? "starting" : "date") as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                        placeholder={ev.key === "PHOTOTHERAPY" ? "e.g. 5/9/26 9:40am SSPT Start" : "e.g. 9/9/26"}
                      />
                    </label>
                  )}
                  {(ev.fields.includes("ending") || ev.fields.includes("result")) && (
                    <label className="block">
                      <span className="lbl mb-1 block text-[10px]">{ev.fields.includes("ending") ? "Ending" : "Result"}</span>
                      <textarea
                        className="inp min-h-[60px] text-xs"
                        value={(entry as Record<string, string>)[ev.fields.includes("ending") ? "ending" : "result"] ?? ""}
                        onChange={(e) => setField(ev.key, (ev.fields.includes("ending") ? "ending" : "result") as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                        placeholder={ev.key === "CUS1" ? "e.g. Partial thrombosis of left portal vein, splenomegaly" : ev.key === "PHOTOTHERAPY" ? "e.g. SSPT to DSPT changed, TSPT stop @12pm" : "Result / details"}
                      />
                    </label>
                  )}
                  {ev.fields.includes("notes") && (
                    <label className="block">
                      <span className="lbl mb-1 block text-[10px]">Notes</span>
                      <input
                        className="inp text-xs"
                        value={entry.notes ?? ""}
                        onChange={(e) => setField(ev.key, "notes", e.target.value)}
                        onBlur={save}
                        placeholder="Additional notes"
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <details className="quiet mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-[11px] text-slate-300">
          <summary>How this matches the paper</summary>
          <p className="text-[11px] text-slate-400">
            Order left→right as on MRD/089 sheet: VENTILATION (sky blue) → CPAP (green) → SURFACTANT (peach) → NASAL FLOW (lavender) → CAFFEINE (pink) → UVC (yellow) → PICC (pale yellow) → NS BOLUSES (amber) → ANTIBIOTICS (amber) → BLOOD CULTURES (gray) → EVENT (yellow) → FIRST FEED / FULL FEED / HMF / PO FEEDS / DBF / NEC (light green) → CUS1-3 (stone) → ECHO1-2 (light blue) → ROP SCREEN 1-2 (sage) → PHOTOTHERAPY (amber). DATE/STARTING and RESULT/ENDING rows replicate the handwritten log.
          </p>
        </details>
      </Section>

      <Section title="Event log history" sub="Recent saves">
        <ul className="space-y-1.5 text-xs">
          {Object.entries(log)
            .filter(([, v]) => v.date || v.result || v.starting || v.ending)
            .map(([k, v]) => (
              <li key={k} className="flex gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
                <span className="w-28 shrink-0 font-bold text-cyan-200">{k}</span>
                <span className="flex-1 text-slate-300">
                  {(v as EventLogEntry).starting || (v as EventLogEntry).date || "—"} → {(v as EventLogEntry).ending || (v as EventLogEntry).result || "—"}
                  {(v as EventLogEntry).notes ? ` · ${(v as EventLogEntry).notes}` : ""}
                </span>
              </li>
            ))}
          {Object.keys(log).length === 0 && <li className="text-slate-500">No event log entries yet — use the table above.</li>}
        </ul>
      </Section>
    </div>
  );
}
