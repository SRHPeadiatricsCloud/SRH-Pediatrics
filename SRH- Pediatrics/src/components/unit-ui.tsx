"use client";

import { HeartPulse, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UNIT_LIST, type UnitKey, allBeds, defaultBed, unitOf } from "@/lib/units";
import { systemsForUnit } from "@/lib/units-catalog";

const ACCENT: Record<string, { chip: string; on: string; dot: string }> = {
  cyan: { chip: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200", on: "border-cyan-300 bg-cyan-500 text-slate-950", dot: "bg-cyan-400" },
  rose: { chip: "border-rose-400/50 bg-rose-400/10 text-rose-200", on: "border-rose-300 bg-rose-500 text-white", dot: "bg-rose-400" },
  amber: { chip: "border-amber-400/50 bg-amber-400/10 text-amber-200", on: "border-amber-300 bg-amber-400 text-slate-950", dot: "bg-amber-400" },
  violet: { chip: "border-violet-400/50 bg-violet-400/10 text-violet-200", on: "border-violet-300 bg-violet-500 text-white", dot: "bg-violet-400" },
  emerald: { chip: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200", on: "border-emerald-300 bg-emerald-500 text-slate-950", dot: "bg-emerald-400" },
};

/**
 * Unit switcher shown in the top bar — switches the whole engine between wards.
 * Pass `includeAll` to add an "All units" option (value "all").
 */
export function UnitSwitcher({
  active,
  onChange,
  includeAll = false,
}: {
  active: UnitKey | "all";
  onChange: (u: UnitKey | "all") => void;
  includeAll?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {includeAll && (
        <button
          onClick={() => onChange("all")}
          title="View every case across all units"
          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
            active === "all"
              ? "border-indigo-300 bg-indigo-500 text-white"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
          }`}
        >
          <LayoutGrid size={15} strokeWidth={2.4} aria-hidden className="shrink-0" />
          ALL
        </button>
      )}
      {UNIT_LIST.map((u) => {
        const on = u.key === active;
        const acc = ACCENT[u.color];
        return (
          <button
            key={u.key}
            onClick={() => onChange(u.key)}
            title={u.name}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
              on ? acc.on : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
            }`}
          >
            {u.key === "picu" ? (
              <HeartPulse size={16} strokeWidth={2.5} aria-hidden className="shrink-0" />
            ) : (
              <span aria-hidden>{u.emoji}</span>
            )}
            {u.short}
          </button>
        );
      })}
    </div>
  );
}

/** Scrollable bed selector that adapts to the chosen unit's bed map. */
export function UnitBedDial({ unit, value, onChange }: { unit: UnitKey; value: string; onChange: (v: string) => void }) {
  const zones = unitOf(unit).bedZones;
  const beds = allBeds(unit);
  const findZone = (bed: string) => zones.find((z) => z.beds.includes(bed))?.label ?? zones[0].label;

  const [zoneLabel, setZoneLabel] = useState(() => findZone(value));
  const zone = zones.find((z) => z.label === zoneLabel) ?? zones[0];

  useEffect(() => {
    if (!zone.beds.includes(value)) {
      onChange(zone.beds[0]);
    }
  }, [zoneLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = Math.max(0, zone.beds.indexOf(value));
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ITEM_H = 42;

  useEffect(() => {
    const el = wheelRef.current;
    if (el) el.scrollTop = idx * ITEM_H;
  }, [idx, zoneLabel]);

  const snap = () => {
    const el = wheelRef.current;
    if (!el) return;
    const i = Math.min(zone.beds.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    if (zone.beds[i] && zone.beds[i] !== value) onChange(zone.beds[i]);
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {zones.map((z) => (
          <button
            key={z.label}
            type="button"
            onClick={() => setZoneLabel(z.label)}
            className={`chip ${z.label === zoneLabel ? "chip-on" : "chip-off"}`}
          >
            {z.label} <span className="opacity-60">({z.beds.length})</span>
          </button>
        ))}
      </div>
      <div className="flex items-stretch gap-2">
        <div className="relative h-[126px] w-44 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[42px] bg-gradient-to-b from-slate-950/90 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[42px] bg-gradient-to-t from-slate-950/90 to-transparent" />
          <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-[42px] -translate-y-1/2 rounded-xl border border-cyan-400/35 bg-cyan-400/10" />
          <div
            ref={wheelRef}
            onScroll={() => {
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(snap, 80);
            }}
            className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}
          >
            {zone.beds.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onChange(b)}
                className={`flex h-[42px] w-full snap-center items-center justify-center text-center transition ${
                  b === value ? "font-black text-cyan-200" : "font-medium text-slate-400"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-2xl border border-white/10 bg-slate-900/40 p-3">
          <div className="lbl">Selected bed</div>
          <div className="text-lg font-black text-white">{value}</div>
          <p className="mt-1 text-[10px] text-slate-400">
            {unitOf(unit).short} · {zone.label} · {beds.length} beds in unit
          </p>
        </div>
      </div>
    </div>
  );
}

/** Sub-specialty selector for the PICU family. */
export function SubSpecialtyPicker({
  unit,
  value,
  onChange,
}: {
  unit: UnitKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const acc = ACCENT[unitOf(unit).color];
  return (
    <div className="flex flex-wrap gap-1.5">
      {["picu", "ccu", "cvicu", "licu"].map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`chip ${on ? acc.on : "chip-off"}`}
          >
            {s.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/** Small pill used on cards and headers. */
export function UnitBadge({ unit, subspecialty }: { unit: string; subspecialty?: string }) {
  const u = unitOf(unit);
  const acc = ACCENT[u.color];
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${acc.chip}`}>
      {u.short}
      {subspecialty ? ` · ${subspecialty.toUpperCase()}` : ""}
    </span>
  );
}

export { systemsForUnit };
