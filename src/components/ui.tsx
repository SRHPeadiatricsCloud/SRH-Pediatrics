"use client";

import {
  BookOpen,
  Calculator as CalculatorIcon,
  CalendarDays,
  Check,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lock as LockIcon,
  Moon,
  Newspaper,
  Printer,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react"; import { createPortal } from "react-dom";
import { EditableListField } from "@/components/editable-list";

export function Chip({
  label,
  on,
  onClick,
  tone = "cyan",
}: {
  label: string;
  on?: boolean;
  onClick?: () => void;
  tone?: "cyan" | "rose" | "amber" | "emerald";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!on}
      className={`chip ${on ? `chip-on tone-${tone}` : "chip-off"}`}
    >
      {on && <Check size={11} strokeWidth={3.5} aria-hidden className="shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function toggleValue(arr: string[], option: string, multi: boolean): string | string[] {
  if (multi) {
    return arr.includes(option) ? arr.filter((x) => x !== option) : [...arr, option];
  }
  return arr[0] === option ? "" : option;
}

export function ChipGroup({
  options,
  value,
  onChange,
  multi = false,
  tone = "cyan",
}: {
  options: readonly string[];
  value: string | string[] | undefined;
  onChange: (v: never) => void;
  multi?: boolean;
  tone?: "cyan" | "rose" | "amber" | "emerald";
}) {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="flex flex-wrap gap-1.5" role={multi ? "group" : undefined} aria-label={multi ? "multi-select" : undefined}>
      {options.map((o) => {
        const selected = arr.includes(o);
        return (
          <Chip
            key={o}
            label={o}
            tone={tone}
            on={selected}
            onClick={() => onChange(toggleValue(arr, o, multi) as never)}
          />
        );
      })}
    </div>
  );
}

/**
 * Dial + manual "other" fallback.
 * multi=true → tap toggles many values and aggregates them for save/admit.
 */
export function DialWithOther({
  options,
  value,
  onChange,
  multi = false,
  tone = "cyan",
  otherPlaceholder = "Type a custom value…",
  showSelected = true,
}: {
  options: readonly string[];
  value: string | string[] | undefined;
  onChange: (v: never) => void;
  multi?: boolean;
  tone?: "cyan" | "rose" | "amber" | "emerald";
  otherPlaceholder?: string;
  showSelected?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const arr = Array.isArray(value) ? value : value ? [value] : [];

  // Multi-selects use the same editable-row interaction as handover lists.
  // This keeps preset selections editable instead of collapsing them into chips.
  if (multi) {
    return (
      <EditableListField
        options={options}
        value={arr}
        onChange={(next) => onChange(next as never)}
        placeholder={otherPlaceholder}
        emptyLabel="No selections added yet."
      />
    );
  }

  const addCustom = () => {
    const t = draft.trim();
    if (!t) return;
    if (multi) {
      if (!arr.includes(t)) onChange([...arr, t] as never);
    } else {
      onChange(t as never);
    }
    setDraft("");
  };

  return (
    <div>
      {multi && (
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300/90">
          Multi-select · tap to add/remove · {arr.length} selected
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const selected = arr.includes(o);
          return (
            <Chip
              key={o}
              label={o}
              tone={tone}
              on={selected}
              onClick={() => onChange(toggleValue(arr, o, multi) as never)}
            />
          );
        })}
      </div>
      {!multi && arr[0] && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
          <Check size={10} strokeWidth={3.5} aria-hidden /> Selected: <span className="text-white">{arr[0]}</span>
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <input
          className="inp text-xs"
          placeholder={otherPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
        />
        <button type="button" className="btn-ghost shrink-0" onClick={addCustom} disabled={!draft.trim()}>
          + Add
        </button>
      </div>
      {showSelected && multi && arr.length > 0 && (
        <div className="mt-2 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-2">
          <div className="lbl mb-1">Aggregated selection ({arr.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {arr.map((x) => (
              <button
                key={x}
                type="button"
                className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[11px] text-violet-100"
                onClick={() => onChange(arr.filter((y) => y !== x) as never)}
                title="Remove"
              >
                ✓ {x} <span className="opacity-70">✕</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 300,
  step = 1,
  unit = "",
  decimals = 0,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const v = value ?? min;
  const editing = draft !== null;
  const precisionOf = (n: number | string | null | undefined) => {
    if (n === null || n === undefined) return 0;
    const s = String(n);
    const d = s.includes(".") ? s.split(".")[1]?.length ?? 0 : 0;
    return Math.min(4, d);
  };
  const displayDecimals = Math.max(decimals, precisionOf(step), precisionOf(value));
  const shown = value === undefined ? "" : v.toFixed(displayDecimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const clamp = (n: number, precision = Math.max(decimals, precisionOf(step))) =>
    Math.min(max, Math.max(min, Number(n.toFixed(Math.max(0, precision)))));
  const set = (n: number) => {
    onChange(clamp(n));
    setDraft(null);
  };
  const commit = (raw: string | null) => {
    if (raw === null) return;
    // Let users completely clear the box while typing; blank on blur simply
    // restores the previous saved value instead of forcing an old digit back.
    if (raw.trim() === "" || raw === ".") return;
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      // Preserve decimals typed manually even where the slider itself moves in whole-number steps.
      onChange(clamp(n, Math.max(decimals, precisionOf(step), precisionOf(raw))));
    }
  };
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
      <div className="lbl mb-1 truncate">{label}</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set(v - step)}
          className="h-8 w-8 shrink-0 rounded-lg bg-white/5 text-lg leading-none text-slate-200 active:scale-90"
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center rounded-lg bg-white/[0.03] px-1.5">
          <input
            inputMode="decimal"
            className="w-full min-w-0 bg-transparent py-1 text-center text-base font-bold tabular-nums text-white outline-none placeholder:text-slate-500"
            value={editing ? draft : shown}
            placeholder="—"
            onFocus={() => setDraft(shown)}
            onChange={(e) => {
              const cleaned = e.target.value
                .replace(/[^0-9.]/g, "")
                .replace(/(\..*)\./g, "$1");
              setDraft(cleaned);
            }}
            onBlur={() => {
              commit(draft);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit(draft);
                setDraft(null);
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setDraft(null);
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "ArrowUp") set(v + step);
              if (e.key === "ArrowDown") set(v - step);
            }}
          />
          {unit && <span className="shrink-0 text-[10px] font-normal text-slate-400">{unit}</span>}
        </div>
        <button
          type="button"
          onClick={() => set(v + step)}
          className="h-8 w-8 shrink-0 rounded-lg bg-white/5 text-lg leading-none text-slate-200 active:scale-90"
        >
          +
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="mt-1 h-1 w-full accent-cyan-400"
      />
    </div>
  );
}

/** Editable numeric input with ± tap buttons — typing when you know the value, taps when you don't. */
export function NumField({
  label,
  value,
  onChange,
  min = 0,
  max = 6000,
  step = 10,
  unit = "",
  decimals = 0,
  placeholder = "—",
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === undefined || value === null || Number.isNaN(value) ? "" : String(value);
  const editing = draft !== null;
  const commit = (raw: string | null) => {
    if (raw === null) return;
    // Important: if the user fully deletes the field while editing, keep it blank
    // until blur, then restore the last saved value instead of forcing a digit back.
    // This allows normal full editing (Ctrl+A/Delete/backspace all, then type new value).
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    onChange(Math.min(max, Math.max(min, Number(n.toFixed(decimals)))));
  };
  const nudge = (delta: number) => {
    const base = editing && draft?.trim() ? Number(draft) : value ?? min;
    const safeBase = Number.isNaN(base) ? min : base;
    onChange(Math.min(max, Math.max(min, Number((safeBase + delta).toFixed(decimals)))));
    setDraft(null);
  };
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
      <div className="lbl mb-1 truncate">{label}</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => nudge(-step)}
          className="h-9 w-9 shrink-0 rounded-lg bg-white/5 text-lg leading-none text-slate-200 active:scale-90"
        >
          −
        </button>
        <input
          inputMode="decimal"
          className="w-full min-w-0 rounded-lg bg-transparent py-1 text-center text-base font-bold tabular-nums text-white outline-none placeholder:text-slate-500"
          value={editing ? draft : shown}
          placeholder={placeholder}
          onFocus={() => setDraft(shown)}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow a genuinely empty field and a single decimal point while editing.
            const cleaned = raw
              .replace(/[^0-9.]/g, "")
              .replace(/(\..*)\./g, "$1");
            setDraft(cleaned);
          }}
          onBlur={() => {
            commit(draft);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(draft);
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="shrink-0 text-[10px] text-slate-400">{unit}</span>
        <button
          type="button"
          onClick={() => nudge(step)}
          className="h-9 w-9 shrink-0 rounded-lg bg-white/5 text-lg leading-none text-slate-200 active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Section({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Persisted light/dark theme control — a clear two-option switch that stays visible in both modes. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);
  const apply = (next: boolean) => {
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("neo_theme", next ? "light" : "dark");
    setLight(next);
  };
  return (
    <div
      role="group"
      aria-label="Colour theme"
      title="Choose display theme"
      className="theme-switch flex items-center gap-0.5 rounded-xl border-2 border-white/20 bg-white/10 p-0.5"
    >
      <button
        onClick={() => apply(true)}
        aria-pressed={light}
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
          light ? "theme-on bg-amber-400 text-slate-900" : "text-slate-300 hover:bg-white/10"
        }`}
      >
        <Sun size={13} strokeWidth={2.5} /> <span>Light</span>
      </button>
      <button
        onClick={() => apply(false)}
        aria-pressed={!light}
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
          !light ? "theme-on bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"
        }`}
      >
        <Moon size={13} strokeWidth={2.5} /> <span>Dark</span>
      </button>
    </div>
  );
}

/* ============================================================
   FONT SIZE CONTROL — replaces the old Refresh button.
   A- / A+ adjusts the root font-size (85%–170%, 10% steps),
   persists in localStorage("srh_font_scale") and is bootstrapped
   by the inline script in layout.tsx before first paint.
   ============================================================ */
export const FONT_SCALE_KEY = "srh_font_scale";
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.7;
export const FONT_SCALE_DEFAULT = 1.1; // matches html { font-size: 110% }

export function applyFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
  document.documentElement.style.fontSize = `${clamped * 100}%`;
}

export function readFontScale(): number {
  if (typeof window === "undefined") return FONT_SCALE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(FONT_SCALE_KEY);
    const parsed = raw === null ? NaN : Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, parsed));
    }
  } catch {
    /* storage unavailable — fall through to default */
  }
  return FONT_SCALE_DEFAULT;
}

export function FontSizeControl() {
  const [scale, setScale] = useState<number>(FONT_SCALE_DEFAULT);

  useEffect(() => {
    // Hydration-safe: read the persisted scale after mount (SSR renders the default).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScale(readFontScale());
  }, []);

  const step = (dir: -1 | 1) => {
    const next = Math.round((scale + dir * 0.1) * 10) / 10;
    const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next));
    setScale(clamped);
    try {
      window.localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    } catch {
      /* ignore private-mode storage errors */
    }
    applyFontScale(clamped);
  };

  const pct = Math.round(scale * 100);

  return (
    <div
      role="group"
      aria-label="Text size"
      className="flex items-center overflow-hidden rounded-lg border border-white/15 bg-white/5"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={pct <= FONT_SCALE_MIN * 100}
        aria-label="Decrease text size"
        title="Smaller text (min 85%)"
        className="px-2.5 py-1.5 text-[13px] font-black leading-none text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
      >
        A-
      </button>
      <span
        aria-live="polite"
        className="min-w-[44px] border-x border-white/10 px-1 py-1.5 text-center text-[11px] font-bold leading-none text-cyan-300"
      >
        {pct}%
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={pct >= FONT_SCALE_MAX * 100}
        aria-label="Increase text size"
        title="Larger text (max 170%)"
        className="px-2.5 py-1.5 text-[13px] font-black leading-none text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
      >
        A+
      </button>
    </div>
  );
}

export function TopBar({
  live,
  unit,
  onUnitChange,
}: {
  live?: boolean;
  /** Retained for call-site compatibility — the Refresh button was replaced by the FontSizeControl; boards poll live. */
  onRefresh?: () => void;
  unit?: string;
  onUnitChange?: (u: string) => void;
}) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hospital-logo.png?v=2.0.032"
            alt="Sri Ramakrishna Multi-Speciality Hospital — Dept. Of Pediatrics"
            width={48}
            height={33}
            className="h-12 w-auto shrink-0 rounded-lg bg-white p-0.5 drop-shadow-sm"
          />
          <span className="leading-tight">
            <span className="block text-sm font-black tracking-tight text-white">
              Sri Ramakrishna Hospital
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-cyan-300/90">
              Department of Pediatrics
            </span>
            <span className="block text-[9px] font-semibold tracking-wide text-slate-400">
              Realtime Monitoring and Clinical Handover Suite
            </span>
          </span>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {live && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live cloud
            </span>
          )}
          <StaffNameInput />
          <ShareButton />
          <ThemeToggle />
          <FontSizeControl />
        </div>
      </div>
      {/* Primary navigation — visible on every device (horizontally scrollable on mobile/tablet) */}
      <nav
        aria-label="Primary"
        className="relative border-t border-white/10 bg-slate-950/70"
      >
        <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto whitespace-nowrap px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <MobileNavLink href="/" icon={<LayoutGrid size={13} />}>Unit board</MobileNavLink>
          <MobileNavLink href="/admit" icon={<UserPlus size={13} />}>New admission</MobileNavLink>
          <MobileNavLink href="/consultants" icon={<Users size={13} />}>By consultant</MobileNavLink>
          <MobileNavLink href="/handover" icon={<Printer size={13} />}>Shift sheet</MobileNavLink>
          <MobileNavLink href="/reference" icon={<BookOpen size={13} />}>Drugs &amp; doses</MobileNavLink>
          <MobileNavLink href="/learning" icon={<GraduationCap size={13} />}>Learning space</MobileNavLink>
          <MobileNavLink href="/updates" icon={<Newspaper size={13} />}>Recent updates</MobileNavLink>
          <MobileNavLink href="/calculators" icon={<CalculatorIcon size={13} />}>Calculators</MobileNavLink>
          <MobileNavLink href="/roster" icon={<CalendarDays size={13} />}>Duty roster</MobileNavLink>
          <MobileNavLink href="/keymasters" icon={<KeyRound size={13} />}>Keymaster List</MobileNavLink>
        </div>
        {/* soft edge fades hint at scrollable content on small screens */}
        <span className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-slate-950/90 to-transparent md:hidden" />
        <span className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-slate-950/90 to-transparent md:hidden" />
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
    >
      {children}
    </Link>
  );
}

/**
 * Primary nav item — visible on every device. Highlights the active section
 * so residents on tablet/mobile know exactly which page they are on.
 */
function MobileNavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : (pathname ?? "").startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border border-cyan-400/60 bg-cyan-400/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,.25)]"
          : "border border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}

/* ---------- Keymaster session ---------- */

export type Session = { name: string; code: string; role: string; unit: string };

const SESSION_KEY = "neo_session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.name ? s : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("neo:session"));
  window.dispatchEvent(new Event("neo:user"));
}

/** Module cache of "does the Keymaster List have any keys yet". */
let cachedHasKeys: boolean | null = null;
export function peekHasKeys(): boolean | null {
  return cachedHasKeys;
}
export async function refreshHasKeys(): Promise<boolean> {
  try {
    const r = await fetch("/api/keymasters?meta=1", { cache: "no-store" });
    const j = await r.json();
    cachedHasKeys = Boolean(j.hasKeys);
    window.dispatchEvent(new Event("neo:keys"));
    return cachedHasKeys;
  } catch {
    return cachedHasKeys ?? false;
  }
}

/** Signed-in identity; name is empty when nobody is signed in. */
export function useUser() {
  const [session, setS] = useState<Session | null>(() => getSession());
  useEffect(() => {
    const sync = () => setS(getSession());
    window.addEventListener("neo:session", sync);
    window.addEventListener("storage", sync);
    refreshHasKeys();
    return () => {
      window.removeEventListener("neo:session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return {
    name: session?.name ?? "",
    code: session?.code ?? "",
    role: session?.role ?? "",
    unit: session?.unit ?? "",
    signedIn: !!session,
    signIn: (s: Session) => setSession(s),
    signOut: () => setSession(null),
    /** legacy no-op kept for call-site compatibility */
    save: (_n: string) => undefined,
  };
}

/** Sign in against the Keymaster List (employee code = password). */
export async function signIn(name: string, code: string): Promise<{ ok: boolean; error?: string; session?: Session }> {
  try {
    const r = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    const j = await r.json();
    if (r.ok && j.ok) {
      const session: Session = { name: j.name, code, role: j.role ?? "", unit: j.unit ?? "" };
      setSession(session);
      return { ok: true, session };
    }
    return { ok: false, error: j.error ?? "Sign-in failed." };
  } catch {
    return { ok: false, error: "Network error — try again." };
  }
}

/**
 * Temperature display unit — LOCKED TO FAHRENHEIT across the whole app.
 * Values are still stored in Celsius in the database so clinical range
 * flagging (hypothermia / fever) stays accurate; only display + entry are °F.
 */
export function useTempUnit(): { unit: "F" } {
  return { unit: "F" };
}

/** Sign-in control in the top bar: badge when signed in, button + modal otherwise. */
function StaffNameInput() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const f = () => {
      setFlash(true);
      setTimeout(() => setFlash(false), 1400);
    };
    window.addEventListener("neo:lockflash", f);
    return () => window.removeEventListener("neo:lockflash", f);
  }, []);
  return (
    <>
      {user.signedIn ? (
        <div
          className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 transition ${
            flash ? "border-amber-400 ring-2 ring-amber-400/60" : "border-emerald-400/40 bg-emerald-400/10"
          }`}
          title={`Signed in as ${user.name} — employee code verified`}
        >
          <span aria-hidden className="text-[11px]">✍️</span>
          <span className="max-w-[9rem] truncate text-xs font-semibold text-white">{user.name}</span>
          {user.role && (
            <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300 sm:inline">
              {user.role}
            </span>
          )}
          <button
            onClick={user.signOut}
            className="ml-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-rose-300"
            title="Sign out (returns to view-only)"
          >
            sign out
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition ${
            flash ? "border-amber-400 ring-2 ring-amber-400/60" : "border-amber-400/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
          }`}
          title="Sign in with your employee code to unlock editing"
        >
          <LockIcon size={12} strokeWidth={2.5} /> Sign in to edit
        </button>
      )}
      {open && <SignInModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** Name + employee-code sign-in dialog backed by the Keymaster List. */
export function SignInModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(() => localStorage.getItem("neo_last_name") || "");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/keymasters", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setNames((j.rows ?? []).map((r: { name: string }) => r.name)))
      .catch(() => undefined);
  }, []);
  const submit = async () => {
    setBusy(true);
    setErr("");
    const res = await signIn(name.trim(), code.trim());
    setBusy(false);
    if (res.ok) {
      localStorage.setItem("neo_last_name", name.trim());
      onClose();
    } else {
      setErr(res.error ?? "Sign-in failed.");
    }
  };
  const dialog = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="card max-h-[90vh] w-full max-w-sm overflow-y-auto! p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <KeyRound size={15} />
          </span>
          <div>
            <h2 className="text-sm font-black text-white">Sign in to edit</h2>
            <p className="text-[10px] text-slate-400">Your employee code is the password.</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <label className="lbl mb-1 block">Name on the Keymaster List</label>
        <input
          className="inp mb-2"
          list="keymaster-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Start typing your name…"
          autoFocus
        />
        <datalist id="keymaster-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <label className="lbl mb-1 block">Employee code</label>
        <input
          className="inp mb-2"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="••••••"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <p className="mb-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !name.trim() || !code.trim()}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
        <p className="mt-3 text-[10px] text-slate-500">
          Not on the list? Ask a Keymaster to add you, or register the first key in{" "}
          <Link href="/keymasters" className="font-bold text-cyan-300 underline">
            Keymaster List
          </Link>
          .
        </p>
      </div>
    </div>
  );
  if (typeof document === "undefined") return null as unknown as React.ReactNode;
  return createPortal(dialog, document.body);
}

/** Lightweight realtime: polls an endpoint and re-renders when the payload changes. */
export function usePoll<T>(url: string, ms = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const hash = useRef("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        const s = JSON.stringify(j);
        if (alive && s !== hash.current) {
          hash.current = s;
          setData(j as T);
        }
      } catch {
        /* offline – keep last snapshot */
      }
    };
    load();
    const t = setInterval(load, ms);
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("neo:board-reload", bump);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("neo:board-reload", bump);
    };
  }, [url, ms, tick]);
  return { data, reload: () => setTick((t) => t + 1) };
}

/** Current signed-in editor name (empty = view-only). */
export function getUserName(): string {
  return getSession()?.name ?? "";
}

/**
 * True while editing is locked: keys exist but nobody is signed in.
 * While the Keymaster List is still empty the unit is in open setup mode.
 */
export function useLocked(): boolean {
  const user = useUser();
  const [hasKeys, setHasKeys] = useState<boolean | null>(() => peekHasKeys());
  useEffect(() => {
    const sync = () => setHasKeys(peekHasKeys());
    refreshHasKeys();
    window.addEventListener("neo:keys", sync);
    window.addEventListener("neo:session", sync);
    return () => {
      window.removeEventListener("neo:keys", sync);
      window.removeEventListener("neo:session", sync);
    };
  }, []);
  if (user.signedIn) return false;
  return hasKeys !== false;
}

/** Amber strip shown while the session is view-only. */
export function LockBanner() {
  const locked = useLocked();
  const user = useUser();
  useEffect(() => {
    // View-only is also a privacy state: keep the navigation tabs available,
    // but visually obscure all clinical page content until the session is
    // authenticated. This is deliberately independent of `locked` so setup
    // mode cannot accidentally expose patient data to an unsigned visitor.
    document.body.classList.toggle("view-only", locked);
    document.body.classList.toggle("privacy-view", !user.signedIn);
  }, [locked, user.signedIn]);
  if (!locked) return null;
  return (
    <div className="no-print relative z-40 border-b border-amber-400/40 bg-amber-500/15 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2 text-[11px] font-semibold text-amber-200">
        <LockIcon size={12} strokeWidth={2.5} aria-hidden />
        <span>
          <b>View-only privacy mode.</b> Clinical content is blurred until you sign in with your <b>employee code</b>
          {" "}(top-right). The navigation tabs remain available.
        </span>
      </div>
    </div>
  );
}

export async function api(url: string, method: string, body?: unknown) {
  if (typeof window !== "undefined" && method !== "GET") {
    const session = getSession();
    const openSetup = peekHasKeys() === false;
    if (!session && !openSetup) {
      window.dispatchEvent(
        new CustomEvent("neo:error", { detail: "🔒 View-only — sign in with your employee code to save changes" }),
      );
      window.dispatchEvent(new Event("neo:lockflash"));
      return { error: "view-only" };
    }
    try {
      const { capturePreEditBackup } = await import("@/lib/backup");
      await capturePreEditBackup(url, method);
    } catch {
      /* never block a clinical save */
    }
  }
  try {
    const session = typeof window !== "undefined" ? getSession() : null;
    const r = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(typeof window !== "undefined" && method !== "GET"
          ? {
              "x-editor": session?.name ?? getUserName(),
              ...(session?.code ? { "x-code": session.code } : {}),
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (r.ok) {
      const silent = url.includes("/restore") || method === "DELETE";
      if (!silent && method !== "GET") {
        window.dispatchEvent(new CustomEvent("neo:saved", { detail: "Saved to cloud ✓" }));
      }
    } else if (r.status === 401) {
      window.dispatchEvent(
        new CustomEvent("neo:error", {
          detail: (j && j.error) || "🔒 View-only — sign in with your employee code to save changes",
        }),
      );
      window.dispatchEvent(new Event("neo:lockflash"));
      refreshHasKeys();
    } else {
      window.dispatchEvent(new CustomEvent("neo:error", { detail: "Cloud save failed — retry" }));
    }
    return j;
  } catch {
    window.dispatchEvent(new CustomEvent("neo:error", { detail: "Offline / no connection — will retry" }));
    throw new Error("network");
  }
}

/** Floating confirmation that every entry/change is synced to the cloud. */
export function SaveToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    const show = (ok: boolean) => (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMsg({ text: detail ?? (ok ? "Saved to cloud ✓" : "Cloud sync issue"), ok });
      setTimeout(() => setMsg(null), ok ? 2200 : 3500);
    };
    window.addEventListener("neo:saved", show(true));
    window.addEventListener("neo:error", show(false));
    return () => {
      window.removeEventListener("neo:saved", show(true));
      window.removeEventListener("neo:error", show(false));
    };
  }, []);
  if (!msg) return null;
  return (
    <div
      className={`no-print fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-bold shadow-xl backdrop-blur ${
        msg.ok
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : "border-rose-400/40 bg-rose-500/15 text-rose-200"
      }`}
    >
      {msg.ok ? "☁️ " : "⚠️ "}
      {msg.text}
    </div>
  );
}

/** Share the live unit link on iOS / Android / Windows — native share sheet with clipboard fallback. */
export function ShareButton() {
  const [state, setState] = useState<"idle" | "copied">("idle");
  const share = async () => {
    const url = window.location.href;
    const payload = {
      title: "Sri Ramakrishna Hospital — NICU Handover",
      text: "Live NICU cloud handover — tap to open on any device",
      url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch {
      /* user cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setState("copied");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button onClick={share} title="Copy or share this unit link" className="btn-ghost text-xs">
      🔗 {state === "copied" ? "Link copied!" : "Share link"}
    </button>
  );
}
