"use client";

import { useEffect, useMemo, useState } from "react";
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
export const EVENT_DEFS: EventDef[] = [
  // Respiratory & support
  { key: "VENTILATION", label: "VENTILATION", color: "bg-[#0ea5e9]", textColor: "text-white", borderColor: "border-sky-600", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "CPAP", label: "CPAP", color: "bg-[#16a34a]", textColor: "text-white", borderColor: "border-green-700", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "SURFACTANT", label: "SURFACTANT", color: "bg-[#fb923c]", textColor: "text-[#4a1f00]", borderColor: "border-orange-400", group: "respiratory", fields: ["date", "result", "notes"] },
  { key: "NASAL_FLOW", label: "NASAL FLOW", color: "bg-[#a78bfa]", textColor: "text-white", borderColor: "border-violet-400", group: "respiratory", fields: ["starting", "ending", "notes"] },
  { key: "CAFFEINE", label: "CAFFEINE", color: "bg-[#f9a8d4]", textColor: "text-[#4a1030]", borderColor: "border-pink-300", group: "respiratory", fields: ["starting", "ending", "notes"] },
  // Lines & fluids
  { key: "UVC", label: "UVC", color: "bg-[#facc15]", textColor: "text-[#422006]", borderColor: "border-yellow-400", group: "lines", fields: ["starting", "ending", "notes"] },
  { key: "PICC", label: "PICC", color: "bg-[#fde68a]", textColor: "text-[#422006]", borderColor: "border-amber-200", group: "lines", fields: ["starting", "ending", "notes"] },
  { key: "NS_BOLUSES", label: "NS BOLUSES", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "lines", fields: ["date", "result", "notes"] },
  // Infection
  { key: "ANTIBIOTICS_1", label: "ANTIBIOTICS", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "infection", fields: ["date", "result", "notes"] },
  { key: "ANTIBIOTICS_2", label: "ANTIBIOTICS", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "infection", fields: ["date", "result", "notes"] },
  { key: "BLOOD_CULTURE_1", label: "BLOOD CULTURES", color: "bg-[#e2e8f0]", textColor: "text-[#1e293b]", borderColor: "border-slate-300", group: "infection", fields: ["date", "result"] },
  { key: "BLOOD_CULTURE_2", label: "BLOOD CULTURES", color: "bg-[#e2e8f0]", textColor: "text-[#1e293b]", borderColor: "border-slate-300", group: "infection", fields: ["date", "result"] },
  { key: "EVENT", label: "EVENT", color: "bg-[#fde047]", textColor: "text-[#422006]", borderColor: "border-yellow-300", group: "infection", fields: ["date", "result", "notes"] },
  // Feeds & GI
  { key: "FIRST_FEED", label: "FIRST FEED", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "FULL_FEED", label: "FULL FEED", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "HMF", label: "HMF (MAX STRENGTH)", color: "bg-[#86efac]", textColor: "text-[#14532d]", borderColor: "border-green-400", group: "feeds", fields: ["date", "result"] },
  { key: "PO_FEEDS", label: "PO FEEDS", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "DBF", label: "DBF", color: "bg-[#bbf7d0]", textColor: "text-[#14532d]", borderColor: "border-green-300", group: "feeds", fields: ["date", "result"] },
  { key: "NEC", label: "NEC", color: "bg-[#86efac]", textColor: "text-[#14532d]", borderColor: "border-green-400", group: "feeds", fields: ["date", "result", "notes"] },
  // Imaging & screens
  { key: "CUS1", label: "CUS1", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "CUS2", label: "CUS2", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "CUS3", label: "CUS3", color: "bg-[#d6d3d1]", textColor: "text-[#44403c]", borderColor: "border-stone-300", group: "imaging", fields: ["date", "result"] },
  { key: "ECHO1", label: "ECHO1", color: "bg-[#bae6fd]", textColor: "text-[#0c4a6e]", borderColor: "border-sky-200", group: "imaging", fields: ["date", "result"] },
  { key: "ECHO2", label: "ECHO 2", color: "bg-[#bae6fd]", textColor: "text-[#0c4a6e]", borderColor: "border-sky-200", group: "imaging", fields: ["date", "result"] },
  { key: "ROP1", label: "ROP SCREEN 1", color: "bg-[#a7f3d0]", textColor: "text-[#14532d]", borderColor: "border-emerald-200", group: "imaging", fields: ["date", "result"] },
  { key: "ROP2", label: "ROP SCREEN 2", color: "bg-[#a7f3d0]", textColor: "text-[#14532d]", borderColor: "border-emerald-200", group: "imaging", fields: ["date", "result"] },
  { key: "PHOTOTHERAPY", label: "PHOTOTHERAPY", color: "bg-[#f59e0b]", textColor: "text-white", borderColor: "border-amber-500", group: "imaging", fields: ["date", "result", "notes"] },
];

const GROUP_ORDER: EventDef["group"][] = ["respiratory", "lines", "infection", "feeds", "imaging"];
const GROUP_LABELS: Record<EventDef["group"], string> = {
  respiratory: "Respiratory support",
  lines: "Lines & boluses",
  infection: "Infection",
  feeds: "Feeds & GI",
  imaging: "Imaging & screens",
};

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

  // Keep local in sync if the server record changes underneath us.
  useEffect(() => {
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

  const inputCls =
    "inp min-h-9 text-xs placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-400/40";

  return (
    <Section
      title="NICU Event Log — MRD/089"
      sub="Colour-coded as the unit sheet — one compact box per event, saved as you type"
      right={
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-emerald-300 sm:inline">Auto-save on blur</span>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save event log"}
          </button>
        </div>
      }
    >
      {/* One box per event, one below the other, inside a screen-height scroll. */}
      <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
        {GROUP_ORDER.map((group) => (
          <div key={group}>
            <div className="lbl mb-1 mt-3 first:mt-0">{GROUP_LABELS[group]}</div>
            <div className="space-y-1.5">
              {EVENT_DEFS.filter((ev) => ev.group === group).map((ev) => {
                const entry = log[ev.key] ?? {};
                const firstField = ev.fields.includes("starting") ? "starting" : "date";
                const secondField = ev.fields.includes("ending") ? "ending" : "result";
                return (
                  <div
                    key={ev.key}
                    className={`flex flex-col gap-2 rounded-lg border bg-slate-900/40 p-2 md:flex-row md:items-center ${ev.borderColor}`}
                  >
                    <span
                      className={`shrink-0 rounded px-2 py-1 text-center text-[10px] font-black uppercase tracking-wide md:w-44 ${ev.color} ${ev.textColor}`}
                    >
                      {ev.label}
                    </span>
                    <div className={`grid flex-1 gap-2 sm:grid-cols-2 ${ev.fields.includes("notes") ? "lg:grid-cols-3" : ""}`}>
                      <input
                        className={inputCls}
                        placeholder={firstField === "starting" ? "Starting date/time" : "Date"}
                        value={(entry as Record<string, string>)[firstField] ?? ""}
                        onChange={(e) => setField(ev.key, firstField as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                      />
                      <input
                        className={inputCls}
                        placeholder={secondField === "ending" ? "Ending date/time" : "Result / details"}
                        value={(entry as Record<string, string>)[secondField] ?? ""}
                        onChange={(e) => setField(ev.key, secondField as keyof EventLogEntry, e.target.value)}
                        onBlur={save}
                      />
                      {ev.fields.includes("notes") && (
                        <input
                          className={inputCls}
                          placeholder="Notes"
                          value={entry.notes ?? ""}
                          onChange={(e) => setField(ev.key, "notes", e.target.value)}
                          onBlur={save}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <details className="quiet mt-4">
        <summary>How this matches the paper sheet</summary>
        <p className="mt-1 text-[11px] text-slate-400">
          Same order and colours as MRD/089: VENTILATION → CPAP → SURFACTANT → NASAL FLOW → CAFFEINE → UVC → PICC → NS BOLUSES →
          ANTIBIOTICS → BLOOD CULTURES → EVENT → FIRST FEED / FULL FEED / HMF / PO FEEDS / DBF / NEC → CUS1-3 → ECHO1-2 →
          ROP SCREEN 1-2 → PHOTOTHERAPY. Each box records the date (or starting time), the result (or ending time) and any notes.
        </p>
      </details>
    </Section>
  );
}
