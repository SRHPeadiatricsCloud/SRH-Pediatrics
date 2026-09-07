/**
 * Pure heuristics that turn imported roster text (xls / doc / pdf / OCR)
 * into per-day duty assignments. No browser or package imports so it can be
 * unit-tested directly in Node.
 */

export const ROLE_KEYS = [
  "nicu",
  "picu",
  "delPreterm",
  "delTerm",
  "peds",
  "sr",
  "pgSenior",
  "pgJunior",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];
export type RosterDay = Partial<Record<RoleKey, string>>;
export type RosterData = Record<string, RosterDay>;

export const ROLE_META: Record<RoleKey, { label: string; short: string }> = {
  nicu: { label: "On-call Consultant — NICU", short: "NICU" },
  picu: { label: "On-call Consultant — PICU", short: "PICU" },
  delPreterm: { label: "On-call Delivery — Preterm", short: "Del·Pre" },
  delTerm: { label: "On-call Delivery — Term", short: "Del·Term" },
  peds: { label: "On-call Consultant — Pediatrics", short: "Peds" },
  sr: { label: "On-call Senior Registrar", short: "SR" },
  pgSenior: { label: "On-call Postgraduate — Senior", short: "PG-Sr" },
  pgJunior: { label: "On-call Postgraduate — Junior", short: "PG-Jr" },
};

const ROLE_PATTERNS: [RoleKey, RegExp][] = [
  ["nicu", /n\s*i\s*c\s*u|neonat/i],
  ["picu", /p\s*i\s*c\s*u/i],
  ["delPreterm", /pre\s?-?term|preterm/i],
  ["delTerm", /(?<!pre[- ]?)\bterm\b|labou?r\s*room\s*term/i],
  ["peds", /pa?eds|pa?ediatric|child\s*ward/i],
  ["sr", /senior\s*reg|registrar|\bsr\b/i],
  ["pgSenior", /pg\s*-?\s*(sen|sr)|senior\s*pg|post\s*-?grad(uate)?\s*-?\s*(sen|sr)/i],
  ["pgJunior", /pg\s*-?\s*(jun|jr)|junior\s*pg|post\s*-?grad(uate)?\s*-?\s*(jun|jr)|\bpg\b(?!\s*-?\s*(sen|sr))/i],
];

const NAME_RE = /\bDr\.?\s+[A-Z][A-Za-z.'\-]*(?:\s+[A-Z][A-Za-z.'\-]*)?/g;

/** Trailing tokens that are role labels, not part of a person's name. */
const STOP_TOKEN =
  /^(NICU|PICU|CCU|CVICU|LICU|SR|PG|PGs?|Preterm|Pre\-?term|Term|Peds|Paeds|Pediatrics|Paediatrics|Registrar|Senior|Junior|Duty|Roster|On|Call|Consultant|Delivery|Ward|ICU)$/i;

export function extractNames(line: string): string[] {
  const found = line.match(NAME_RE) ?? [];
  return found
    .map((n) => {
      const toks = n.replace(/\s+/g, " ").trim().split(" ");
      while (toks.length > 2 && STOP_TOKEN.test(toks[toks.length - 1])) toks.pop();
      return toks.join(" ");
    })
    .filter((n) => n.replace(/^Dr\.?\s*/i, "").length > 1);
}

/** Day-of-month detected at the start of a line, or null. */
export function detectDay(line: string, monthHint?: number): number | null {
  const t = line.trim();
  // dd/mm/yyyy or dd-mm-yy or dd.mm
  let m = t.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (monthHint && mo !== monthHint && Number(m[1]) <= 12 && mo > 12) return Number(m[1]); // swapped
    if (d >= 1 && d <= 31) return d;
  }
  // dd/mm
  m = t.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\b/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return d;
  }
  // bare day number followed by separator or name
  m = t.match(/^(\d{1,2})\s*[:\-–]?\s*(?=[A-Z(]|Dr)/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return d;
  }
  // weekday + day e.g. "Mon 05"
  m = t.match(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(\d{1,2})\b/i);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return d;
  }
  return null;
}

/**
 * Assign extracted names to roles for one line.
 * If role keywords are present, names after a keyword belong to that role.
 * Otherwise names fill the role list in order.
 */
export function assignRoles(line: string, names: string[]): RosterDay {
  const day: RosterDay = {};
  if (!names.length) return day;

  // find keyword positions
  const marks: { idx: number; role: RoleKey }[] = [];
  for (const [role, re] of ROLE_PATTERNS) {
    const m = line.search(re);
    if (m >= 0) marks.push({ idx: m, role });
  }
  marks.sort((a, b) => a.idx - b.idx);

  if (marks.length === 0) {
    names.slice(0, ROLE_KEYS.length).forEach((n, i) => {
      day[ROLE_KEYS[i]] = n;
    });
    return day;
  }

  // map each name to the nearest preceding keyword
  for (const name of names) {
    const at = line.indexOf(name);
    let role: RoleKey | null = null;
    for (const mk of marks) if (mk.idx <= at) role = mk.role;
    if (!role) continue;
    const cur = day[role];
    if (!cur) day[role] = name;
    else if (!cur.includes(name)) day[role] = `${cur} / ${name}`;
  }
  // fill any roles that got no name sequentially from leftovers
  const used = new Set(Object.values(day));
  const leftover = names.filter((n) => !used.has(n));
  if (leftover.length) {
    for (const key of ROLE_KEYS) {
      if (!day[key] && leftover.length) day[key] = leftover.shift()!;
    }
  }
  return day;
}

export interface ParseResult {
  data: RosterData;
  unmatched: string[];
  lines: number;
}

/** Parse free text (from any importer) into a month roster. */
export function parseRosterText(text: string, month?: string): ParseResult {
  const monthHint = month ? Number(month.slice(5, 7)) : undefined;
  const data: RosterData = {};
  const unmatched: string[] = [];
  const lines = text.split(/\r?\n/);
  let lastDay: number | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s*\|\s*/g, "  ").replace(/\t/g, "  ").trim();
    if (!line || line.length < 3) continue;

    const day = detectDay(line, monthHint);
    const names = extractNames(line);
    if (day !== null) lastDay = day;

    if (day !== null && names.length) {
      const key = String(day).padStart(2, "0");
      data[key] = { ...(data[key] ?? {}), ...assignRoles(line, names) };
    } else if (day === null && names.length && lastDay !== null && /continues?|same|\/\s*$|^and\b/i.test(line)) {
      // continuation line belongs to previous day
      const key = String(lastDay).padStart(2, "0");
      data[key] = { ...data[key], ...assignRoles(line, names) };
    } else if (names.length && /duty|on\s*-?\s*call|roster/i.test(line) && !data["00"]) {
      // header-ish line: remember nothing
      continue;
    } else if (names.length) {
      unmatched.push(line);
    }
  }
  return { data, unmatched, lines: lines.length };
}

/**
 * Column-aware parse for spreadsheets: if a header row names the roles,
 * map columns to roles; first column = day.
 */
export function parseSheetRows(rows: (string | number)[][]): ParseResult {
  const data: RosterData = {};
  const unmatched: string[] = [];
  let colMap: Record<number, RoleKey> | null = null;

  for (const row of rows) {
    const cells = row.map((c) => String(c ?? "").trim());
    if (!cells.some((c) => c)) continue;

    // header detection
    const hits: Record<number, RoleKey> = {};
    let hitCount = 0;
    cells.forEach((c, i) => {
      for (const [role, re] of ROLE_PATTERNS) {
        if (re.test(c)) {
          hits[i] = role;
          hitCount++;
          break;
        }
      }
    });
    if (hitCount >= 2) {
      colMap = hits;
      continue;
    }

    // day from first cell
    let day: number | null = null;
    const first = cells[0] ?? "";
    if (/^\d{1,2}$/.test(first)) day = Number(first);
    else day = detectDay(first);
    if (day === null || day < 1 || day > 31) {
      const joined = cells.join("  ");
      if (extractNames(joined).length) unmatched.push(joined);
      continue;
    }

    const key = String(day).padStart(2, "0");
    const existing = data[key] ?? {};
    if (colMap) {
      for (const [idx, role] of Object.entries(colMap)) {
        const val = cells[Number(idx)];
        if (val && /dr\.?/i.test(val)) existing[role] = val;
        else if (val && /[A-Z]/.test(val) && val.length > 2) existing[role] = `Dr. ${val}`;
      }
    } else {
      const joined = cells.join("  ");
      Object.assign(existing, assignRoles(joined, extractNames(joined)));
    }
    data[key] = existing;
  }
  return { data, unmatched, lines: rows.length };
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
