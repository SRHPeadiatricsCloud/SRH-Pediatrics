/**
 * Discharge register & MRD archive helpers.
 *
 * Pure and dependency-free so the grouping that decides what lands in a
 * day batch or a monthly archive can be unit-tested. Dates are grouped on the
 * LOCAL calendar day, never UTC: the unit runs on IST, and slicing an ISO
 * string would file an evening discharge under the following day.
 */
import { DISCHARGE_OUTCOMES, type DischargeOutcome, type DischargeRecord } from "./clinical";

/** Anything with the fields the archive needs — keeps the helpers testable. */
export type Archivable = {
  id: number;
  babyName: string;
  uhid: string;
  motherName?: string;
  bed?: string;
  unit?: string;
  status: string;
  dob?: string | Date | null;
  currentWeight?: number;
  updatedAt?: string | Date | null;
  clinical?: { dischargeRecord?: DischargeRecord } | null;
};

export type DayGroup = {
  /** YYYY-MM-DD */
  day: string;
  babies: Archivable[];
};

export type MonthGroup = {
  /** YYYY-MM */
  month: string;
  /** Day groups inside the month, newest first. */
  days: DayGroup[];
  babies: Archivable[];
  /** Baby names in discharge order — what the monthly archive lists. */
  names: string[];
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local calendar day as YYYY-MM-DD. */
export function isoDay(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM from a YYYY-MM-DD day (or any ISO timestamp). */
export function monthKey(day: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(day ?? "");
  return m ? `${m[1]}-${m[2]}` : "";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Fri, 19 Sep 2026" — parsed as a local date, not UTC. */
export function formatDayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!m) return day || "Undated";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DAY_NAMES[d.getDay()]}, ${Number(m[3])} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${m[1]}`;
}

/** "September 2026" */
export function formatMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m) return month || "Undated";
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

export const OUTCOME_LABEL: Record<DischargeOutcome, string> = {
  discharged: "Discharged home",
  transferred: "Transferred",
  death: "Death",
};

/** True when the baby has left the unit and belongs in the archive. */
export function isDischarged(b: Archivable): boolean {
  return b.status === "discharged" || b.status === "transferred" || b.status === "death";
}

export function dischargeOf(b: Archivable): DischargeRecord | null {
  return b.clinical?.dischargeRecord ?? null;
}

/**
 * The calendar day a baby left. Falls back to the record's own timestamp, then
 * to the row's updatedAt, so a card discharged before this feature existed
 * still files under a sensible day instead of vanishing from the archive.
 */
export function dischargeDay(b: Archivable): string {
  const rec = dischargeOf(b);
  if (rec?.date && /^\d{4}-\d{2}-\d{2}$/.test(rec.date)) return rec.date;
  if (rec?.at) {
    const d = isoDay(rec.at);
    if (d) return d;
  }
  if (b.updatedAt) {
    const d = isoDay(b.updatedAt);
    if (d) return d;
  }
  return "";
}

/** Length of stay in whole days, or null when the birth date is unknown. */
export function lengthOfStayDays(b: Archivable): number | null {
  if (!b.dob) return null;
  const start = new Date(b.dob);
  const rec = dischargeOf(b);
  const end = rec?.at ? new Date(rec.at) : b.updatedAt ? new Date(b.updatedAt) : null;
  if (!end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

/**
 * Sort for the archive: same-day babies are listed by UHID so a printed batch
 * is stable and matches the MRD index, rather than jumping around between
 * renders as `updatedAt` changes.
 */
function byUhid(a: Archivable, b: Archivable): number {
  return (a.uhid || "").localeCompare(b.uhid || "", undefined, { numeric: true }) || a.id - b.id;
}

/** Group discharged babies by local day, newest day first. */
export function groupByDay(rows: Archivable[]): DayGroup[] {
  const map = new Map<string, Archivable[]>();
  const undated: Archivable[] = [];
  for (const b of rows) {
    if (!isDischarged(b)) continue;
    const day = dischargeDay(b);
    if (!day) {
      undated.push(b);
      continue;
    }
    const list = map.get(day);
    if (list) list.push(b);
    else map.set(day, [b]);
  }
  const groups = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, babies]) => ({ day, babies: [...babies].sort(byUhid) }));
  if (undated.length) groups.push({ day: "", babies: undated.sort(byUhid) });
  return groups;
}

/** Group discharged babies by month, newest month first. */
export function groupByMonth(rows: Archivable[]): MonthGroup[] {
  const map = new Map<string, DayGroup[]>();
  const undated: Archivable[] = [];
  for (const g of groupByDay(rows)) {
    if (!g.day) {
      undated.push(...g.babies);
      continue;
    }
    const mk = monthKey(g.day);
    const list = map.get(mk);
    if (list) list.push(g);
    else map.set(mk, [g]);
  }
  const groups = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([month, days]) => {
      const babies = days.flatMap((d) => d.babies);
      return { month, days, babies, names: babies.map((b) => b.babyName) };
    });
  if (undated.length) {
    groups.push({ month: "", days: [{ day: "", babies: undated }], babies: undated, names: undated.map((b) => b.babyName) });
  }
  return groups;
}

/** The day groups for one month, for the per-month archive panel. */
export function monthOf(rows: Archivable[], month: string): MonthGroup | null {
  return groupByMonth(rows).find((m) => m.month === month) ?? null;
}

/** The discharged babies for one local day. */
export function dayOf(rows: Archivable[], day: string): Archivable[] {
  return groupByDay(rows).find((g) => g.day === day)?.babies ?? [];
}

/** Build a discharge record; `at` defaults to now. */
export function buildDischargeRecord(input: {
  outcome?: DischargeOutcome;
  summary?: string;
  signedBy?: string;
  at?: Date;
  weightAtDischarge?: number;
  bedAtDischarge?: string;
  unitAtDischarge?: string;
}): DischargeRecord {
  const outcome: DischargeOutcome = DISCHARGE_OUTCOMES.includes(input.outcome as DischargeOutcome)
    ? (input.outcome as DischargeOutcome)
    : "discharged";
  const at = input.at ?? new Date();
  return {
    at: at.toISOString(),
    date: isoDay(at),
    outcome,
    summary: (input.summary ?? "").trim(),
    signedBy: (input.signedBy ?? "").trim(),
    weightAtDischarge: input.weightAtDischarge,
    bedAtDischarge: input.bedAtDischarge,
    unitAtDischarge: input.unitAtDischarge,
  };
}

/**
 * Parse `?ids=1,2,3` (also accepts `day=` / `month=`). Returns positive,
 * de-duplicated ids in the order given, so a print URL stays predictable.
 */
export function parseIdList(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of String(raw).split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Filename-safe slug for an exported PDF. */
export function fileSlug(s: string): string {
  return (s || "baby")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "baby";
}
