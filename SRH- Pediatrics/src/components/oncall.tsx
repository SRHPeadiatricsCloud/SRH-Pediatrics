"use client";

import {
  Baby,
  CalendarCheck,
  CalendarClock,
  GraduationCap,
  HeartPulse,
  Pencil,
  PhoneCall,
  School,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useLocked, usePoll, useUser } from "@/components/ui";
import { fmtTime } from "@/lib/clinical";

export type OnCallFields = {
  nicu: string;
  picu: string;
  delPreterm: string;
  delTerm: string;
  peds: string;
  sr: string;
  pgSenior: string;
  pgJunior: string;
};

const EMPTY: OnCallFields = {
  nicu: "",
  picu: "",
  delPreterm: "",
  delTerm: "",
  peds: "",
  sr: "",
  pgSenior: "",
  pgJunior: "",
};

const SUGGESTIONS = [
  "Dr. Siddhartha",
  "Dr. Sujamariam",
  "Dr. Shobi Anandhi",
  "Dr. Devaprasath",
  "Dr. Indira Devi",
  "Dr. Krishna Sameera",
];

const ROLE_DEFS: {
  key: keyof OnCallFields;
  label: string;
  hint: string;
  icon: typeof Baby;
  tint: string;
}[] = [
  { key: "nicu", label: "On-call Consultant — NICU", hint: "Neonatal intensive cover", icon: Baby, tint: "text-cyan-300 bg-cyan-400/10 border-cyan-400/30" },
  { key: "picu", label: "On-call Consultant — PICU", hint: "Paediatric intensive cover", icon: HeartPulse, tint: "text-rose-300 bg-rose-400/10 border-rose-400/30" },
  { key: "delPreterm", label: "On-call Delivery — Preterm", hint: "Labour room · preterm births", icon: CalendarClock, tint: "text-amber-300 bg-amber-400/10 border-amber-400/30" },
  { key: "delTerm", label: "On-call Delivery — Term", hint: "Labour room · term births", icon: CalendarCheck, tint: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30" },
  { key: "peds", label: "On-call Consultant — Pediatrics", hint: "Ward & emergency cover", icon: Stethoscope, tint: "text-sky-300 bg-sky-400/10 border-sky-400/30" },
  { key: "sr", label: "On-call Senior Registrar", hint: "First escalation point", icon: ShieldCheck, tint: "text-violet-300 bg-violet-400/10 border-violet-400/30" },
  { key: "pgSenior", label: "On-call Postgraduate — Senior", hint: "PG senior resident", icon: GraduationCap, tint: "text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/30" },
  { key: "pgJunior", label: "On-call Postgraduate — Junior", hint: "PG junior resident", icon: School, tint: "text-indigo-300 bg-indigo-400/10 border-indigo-400/30" },
];

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function OnCallCard({ compact = false }: { compact?: boolean }) {
  const locked = useLocked();
  const { name } = useUser();
  const [day, setDay] = useState(todayStr());
  const { data, reload } = usePoll<{ row: { day: string; fields: OnCallFields; updatedBy: string; updatedAt: string } | null }>(
    `/api/oncall?day=${day}`,
    6000,
  );
  const row = data?.row ?? null;
  const [fields, setFields] = useState<OnCallFields>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields({ ...EMPTY, ...((row?.fields as OnCallFields) ?? {}) });
    setEditing(false);
  }, [row?.day, row?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = useMemo(() => ROLE_DEFS.filter((r) => (fields[r.key] ?? "").trim()).length, [fields]);

  const save = async () => {
    setSaving(true);
    await api("/api/oncall", "POST", { day, fields });
    setSaving(false);
    setEditing(false);
    reload();
  };

  const carryForward = async () => {
    const r = await fetch(`/api/oncall?day=${todayStr(-1)}`, { cache: "no-store" });
    const j = await r.json();
    if (j?.row?.fields) {
      setFields({ ...EMPTY, ...(j.row.fields as OnCallFields) });
      setEditing(true);
    }
  };

  const canEdit = !locked && editing;

  return (
    <section className="card group relative overflow-hidden p-0 transition hover:border-cyan-400/40">
      {/* ambient strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 opacity-70" />
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <PhoneCall size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
            Duty On-Call
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> on duty now
            </span>
          </h2>
          <p className="text-[11px] text-slate-400">
            {filled}/8 roles filled
            {row?.updatedBy ? ` · updated by ${row.updatedBy} · ${fmtTime(row.updatedAt)}` : " · not set for this date"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Duty date
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || todayStr())}
              className="inp !w-auto !py-1 text-[11px]"
            />
          </label>
          <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={carryForward} title="Copy yesterday's roster">
            ⟲ Carry forward
          </button>
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">
              🔒 view-only
            </span>
          ) : editing ? (
            <>
              <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary !px-2.5 !py-1 text-[11px]" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save roster"}
              </button>
            </>
          ) : (
            <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => setEditing(true)}>
              <Pencil size={12} /> Edit roster
            </button>
          )}
        </div>
      </div>

      <datalist id="oncall-staff">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className={`grid gap-2 p-4 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        {ROLE_DEFS.map((r) => {
          const Icon = r.icon;
          const value = fields[r.key] ?? "";
          return (
            <div
              key={r.key}
              className={`rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition hover:border-white/25 hover:bg-white/[0.06] ${
                canEdit ? "" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${r.tint}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{r.label}</div>
                  <div className="text-[9px] text-slate-500">{r.hint}</div>
                  {canEdit ? (
                    <input
                      list="oncall-staff"
                      value={value}
                      onChange={(e) => setFields((p) => ({ ...p, [r.key]: e.target.value }))}
                      placeholder="Type name…"
                      className="inp mt-1.5 !py-1 text-xs font-semibold"
                      autoFocus={r.key === "nicu"}
                    />
                  ) : (
                    <div className={`mt-1 truncate text-sm font-black ${value ? "text-white" : "text-slate-600"}`}>
                      {value || "— not assigned —"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!locked && !editing && filled === 0 && (
        <p className="border-t border-white/10 px-4 py-2 text-[11px] text-amber-200/90">
          No roster for {day} yet — tap <b>Edit roster</b> (or carry forward yesterday) and type the names on duty.
        </p>
      )}
      {locked && (
        <p className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
          Sign your name in “Signed as” to update the duty roster.
        </p>
      )}
      {/* keep name referenced for signed attribution on save */}
      <span className="hidden">{name}</span>
    </section>
  );
}

/** Compact print-friendly strip used on the shift sheet. */
export function OnCallPrintStrip({ fields }: { fields: Partial<OnCallFields> | null }) {
  if (!fields) return null;
  return (
    <div className="card break-inside-avoid p-3 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 font-black text-slate-900">
        <PhoneCall size={13} /> Duty On-Call
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 md:grid-cols-4">
        {ROLE_DEFS.map((r) => (
          <div key={r.key} className="flex gap-1.5">
            <span className="shrink-0 text-slate-500">{r.label.replace("On-call ", "")}:</span>
            <span className="font-bold text-slate-900">{(fields as OnCallFields)[r.key] || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
