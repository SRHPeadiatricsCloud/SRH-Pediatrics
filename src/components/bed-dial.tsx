"use client";

import { useEffect, useRef, useState } from "react";

const ITEM_H = 42;

export const BED_DIAL_OPTIONS = [
  { id: "warmer", label: "🔥 Radiant warmer", prefix: "Warmer", max: 22 },
  { id: "isolette", label: "📟 Isolette", prefix: "Isolette", max: 1 },
] as const;

type BedType = (typeof BED_DIAL_OPTIONS)[number]["id"];

export function bedLabel(type: BedType, number: number): string {
  return `${type === "isolette" ? "Isolette" : "Warmer"} ${number}`;
}

export function parseBed(value: string): { type: BedType; number: number } {
  const m = value.match(/(isolette|incubator|warmer)\s*(\d+)/i);
  if (!m) return { type: "warmer", number: 1 };
  const n = Math.max(1, Number(m[2]) || 1);
  const key = m[1].toLowerCase();
  return { type: key === "warmer" ? "warmer" : "isolette", number: n };
}

function WheelColumn({
  options,
  value,
  onChange,
  widthClass = "w-36",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  widthClass?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = wheelRef.current;
    if (el) el.scrollTop = idx * ITEM_H;
  }, [idx]);

  const snap = () => {
    const el = wheelRef.current;
    if (!el) return;
    const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    const next = options[i];
    if (next && next.value !== value) onChange(next.value);
  };

  return (
    <div className={`relative h-[126px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 ${widthClass}`}>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-[42px] bg-gradient-to-b from-slate-950/90 to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[42px] bg-gradient-to-t from-slate-950/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-[42px] -translate-y-1/2 rounded-xl border border-cyan-400/35 bg-cyan-400/10" />
      <div
        ref={wheelRef}
        onScroll={() => {
          if (scrollTimer.current) clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(snap, 80);
        }}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex h-[42px] w-full snap-center items-center justify-center text-center transition ${
                active ? "font-black text-cyan-200" : "font-medium text-slate-400"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Scrollable bed selector (device wheel + number wheel). */
export function BedDial({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseBed(value);
  const [type, setType] = useState<BedType>(parsed.type);
  const [num, setNum] = useState<number>(parsed.number);

  useEffect(() => {
    const p = parseBed(value);
    setType(p.type);
    setNum(Math.min(p.type === "isolette" ? 1 : 22, p.number));
  }, [value]);

  const typeMeta = BED_DIAL_OPTIONS.find((b) => b.id === type) ?? BED_DIAL_OPTIONS[0];
  const max = typeMeta.max;

  const emit = (nextType: BedType, nextNum: number) => {
    const clamped = Math.min(Math.max(1, nextNum), nextType === "isolette" ? 1 : 22);
    setType(nextType);
    setNum(clamped);
    onChange(bedLabel(nextType, clamped));
  };

  const typeOptions = BED_DIAL_OPTIONS.map((b) => ({ value: b.id, label: b.label }));
  const numOptions = Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    return { value: n, label: n.toString().padStart(2, "0") };
  });

  return (
    <div>
      <div className="flex gap-2">
        <WheelColumn
          options={typeOptions}
          value={type}
          onChange={(v) => {
            const nt = v as BedType;
            emit(nt, nt === "isolette" ? 1 : num);
          }}
          widthClass="w-[148px]"
        />
        <WheelColumn
          options={numOptions.map((o) => ({ value: String(o.value), label: o.label }))}
          value={String(num)}
          onChange={(v) => emit(type, Number(v))}
          widthClass="w-20"
        />
        <div className="flex-1" />
        <div className="self-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-cyan-300">Bed</div>
          <div className="text-sm font-black text-white">{bedLabel(type, num)}</div>
        </div>
      </div>

    </div>
  );
}
