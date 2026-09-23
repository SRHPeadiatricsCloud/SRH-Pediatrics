import { feedsPerDay, relTime } from "@/lib/clinical";
import type { Detail } from "@/lib/types";

/**
 * The daily round, worked out from what is already in the chart.
 *
 * A Level IIIB unit runs on a fixed set of things that have to happen every
 * day. None of this is a clinical judgement — it is bookkeeping: has today's
 * weight been entered, are the observations current, is an action overdue. The
 * one timing rule reused here is the feed interval the Fluids tab already
 * applies (feedsPerDay, with the same ten-minute grace), so the two screens can
 * never disagree.
 *
 * Nothing is invented. If a figure is not recorded, the item says so.
 */

export type RoundState = "done" | "todo" | "overdue" | "na";

export type RoundItem = {
  key: string;
  label: string;
  state: RoundState;
  /** Short factual readout — a value or "not recorded", never advice. */
  value: string;
};

export type RoundSummary = {
  items: RoundItem[];
  /** Items that still need something today. */
  outstanding: number;
  /** Items past their point in the day. */
  overdue: number;
};

/** The vitals rows are a loose record; keep only usable timestamps. */
function asIso(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  return Number.isNaN(new Date(v).getTime()) ? undefined : v;
}

/** True when both dates fall on the same local calendar day. */
export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function newest<T>(rows: T[], at: (row: T) => string | null | undefined): T | undefined {
  let best: T | undefined;
  let bestAt = -Infinity;
  for (const row of rows) {
    const raw = at(row);
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    if (t > bestAt) {
      bestAt = t;
      best = row;
    }
  }
  return best;
}

/** Hours between then and now, to one decimal. */
function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3600000;
}

function wholeDays(iso: string, now: Date): number {
  return Math.floor(hoursSince(iso, now) / 24);
}

function agoLabel(iso: string, now: Date): string {
  const h = hoursSince(iso, now);
  if (h < 1) return `${Math.max(0, Math.round(h * 60))} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  const d = wholeDays(iso, now);
  return d === 1 ? "yesterday" : `${d} d ago`;
}

/** The feed interval in hours, using the same pattern the Fluids tab uses. */
function intervalHoursOf(feedFreq: string | undefined): number | undefined {
  const match = feedFreq?.trim().match(/^(\d+(?:\.5)?) hourly$/i);
  return match ? Number(match[1]) : undefined;
}

/**
 * Same ten-minute grace the Fluids tab gives a feed before calling it late, so
 * the board and the chart always agree.
 */
export const FEED_GRACE_MIN = 10;

export function dailyRound(d: Detail, now: Date = new Date()): RoundSummary {
  const items: RoundItem[] = [];
  const c = d.baby.clinical ?? {};

  /* ---- weight ---------------------------------------------------------- */
  const weight = newest(c.growth ?? [], (g) => g.at);
  if (!weight) {
    items.push({ key: "weight", label: "Weight", state: "todo", value: "not recorded" });
  } else if (sameLocalDay(new Date(weight.at), now)) {
    items.push({ key: "weight", label: "Weight", state: "done", value: `${weight.weight} kg today` });
  } else {
    items.push({
      key: "weight",
      label: "Weight",
      state: "todo",
      value: `${weight.weight} kg · ${agoLabel(weight.at, now)}`,
    });
  }

  /* ---- observations ---------------------------------------------------- */
  // `vitals` is typed as a loose record, so read the timestamp defensively.
  const obsRow = newest(d.vitals ?? [], (v) => asIso(v.recordedAt));
  const obsAt = obsRow ? asIso(obsRow.recordedAt) : undefined;
  if (!obsRow || !obsAt) {
    items.push({ key: "obs", label: "Observations", state: "todo", value: "none recorded" });
  } else if (sameLocalDay(new Date(obsAt), now)) {
    items.push({ key: "obs", label: "Observations", state: "done", value: relTime(obsAt) });
  } else {
    items.push({
      key: "obs",
      label: "Observations",
      state: "overdue",
      value: `last ${agoLabel(obsAt, now)}`,
    });
  }

  /* ---- feeds ----------------------------------------------------------- */
  const lastFeedAt = c.fluids?.lastFeedAt;
  if (!lastFeedAt) {
    items.push({ key: "feeds", label: "Feeds", state: "todo", value: "no feed time recorded" });
  } else {
    const interval = intervalHoursOf(c.fluids?.feedFreq);
    const perDay = feedsPerDay(c.fluids?.feedFreq);
    const hours = hoursSince(lastFeedAt, now);
    const due = interval ?? (perDay && perDay > 1 ? 24 / perDay : undefined);
    if (due !== undefined && hours * 60 > due * 60 + FEED_GRACE_MIN) {
      items.push({ key: "feeds", label: "Feeds", state: "overdue", value: `last ${relTime(lastFeedAt)}` });
    } else {
      items.push({ key: "feeds", label: "Feeds", state: "done", value: `last ${relTime(lastFeedAt)}` });
    }
  }

  /* ---- open actions ---------------------------------------------------- */
  const open = (d.tasks ?? []).filter((t) => !t.done);
  const late = open.filter((t) => t.scheduledAt && new Date(t.scheduledAt).getTime() < now.getTime());
  const urgent = open.filter((t) => t.priority === "now" || t.priority === "today");
  if (late.length > 0) {
    items.push({ key: "actions", label: "Actions", state: "overdue", value: `${late.length} past due` });
  } else if (open.length === 0) {
    items.push({ key: "actions", label: "Actions", state: "done", value: "none open" });
  } else {
    items.push({
      key: "actions",
      label: "Actions",
      state: "todo",
      value: urgent.length > 0 ? `${urgent.length} for today` : `${open.length} open`,
    });
  }

  /* ---- lines ----------------------------------------------------------- */
  const lines = c.lines ?? [];
  if (lines.length === 0) {
    items.push({ key: "lines", label: "Lines", state: "na", value: "none in situ" });
  } else {
    const undated = lines.filter((l) => !l.day);
    items.push({
      key: "lines",
      label: "Lines",
      state: undated.length > 0 ? "todo" : "done",
      value: undated.length > 0 ? `${undated.length} undated` : `${lines.length} in situ`,
    });
  }

  /* ---- medicines ------------------------------------------------------- */
  const drugs = c.drugs ?? [];
  if (drugs.length === 0) {
    items.push({ key: "medicines", label: "Medicines", state: "na", value: "none running" });
  } else {
    const undated = drugs.filter((x) => !x.startedAt);
    items.push({
      key: "medicines",
      label: "Medicines",
      state: undated.length > 0 ? "todo" : "done",
      value: undated.length > 0 ? `${undated.length} without a start date` : `${drugs.length} running`,
    });
  }

  /* ---- problem list ---------------------------------------------------- */
  const active = (d.problems ?? []).filter((p) => p.status !== "resolved");
  items.push({
    key: "problems",
    label: "Problems",
    state: active.length > 0 ? "done" : "todo",
    value: active.length > 0 ? `${active.length} active` : "none listed",
  });

  return {
    items,
    outstanding: items.filter((i) => i.state === "todo" || i.state === "overdue").length,
    overdue: items.filter((i) => i.state === "overdue").length,
  };
}

/**
 * Rolls the round up across the unit so the board can say what needs doing
 * first, without a clinician opening every chart.
 */
export function unitRound(babies: Detail[], now: Date = new Date()) {
  let outstanding = 0;
  let overdue = 0;
  const byItem = new Map<string, { label: string; babies: { id: number; name: string; value: string }[] }>();

  for (const d of babies) {
    const round = dailyRound(d, now);
    outstanding += round.outstanding;
    overdue += round.overdue;
    for (const item of round.items) {
      if (item.state === "done" || item.state === "na") continue;
      const bucket = byItem.get(item.key) ?? { label: item.label, babies: [] };
      bucket.babies.push({ id: d.baby.id, name: d.baby.babyName || d.baby.uhid, value: item.value });
      byItem.set(item.key, bucket);
    }
  }

  return { outstanding, overdue, byItem };
}

export type BoardBabyLite = {
  id: number;
  uhid: string;
  babyName: string;
  clinical?: Detail["baby"]["clinical"];
  problems?: { status: string }[];
  openTasks?: {
    id: number;
    text: string;
    priority?: string;
    scheduledAt?: string | null;
    done?: boolean;
    doneAt?: string | null;
    doneBy?: string;
    note?: string;
    owner?: string;
  }[];
  lastVital?: Record<string, number | string | null> | null;
};

export function dailyRoundBoard(b: BoardBabyLite, now: Date = new Date()): RoundSummary {
  // Convert board baby row into Detail shape required by dailyRound
  const mockDetail: Detail = {
    baby: {
      id: b.id,
      uhid: b.uhid,
      babyName: b.babyName,
      motherName: "",
      bed: "",
      sex: "",
      dob: new Date().toISOString(),
      gestWeeks: 30,
      gestDays: 0,
      birthWeight: 0,
      currentWeight: 0,
      birthLength: 0,
      birthHc: 0,
      deliveryMode: "",
      apgar1: 0,
      apgar5: 0,
      bloodGroup: "",
      motherBloodGroup: "",
      inborn: true,
      acuity: "stable",
      status: "active",
      isolation: "none",
      consultant: "",
      unit: "nicu",
      subspecialty: "",
      insurance: "",
      insuranceName: "",
      clinical: b.clinical ?? {},
      updatedAt: new Date().toISOString(),
    },
    problems: (b.problems ?? []).map((p, i) => ({
      id: i,
      system: "gen",
      label: "",
      status: p.status,
      onsetAt: "",
      resolvedAt: null,
    })),
    vitals: b.lastVital ? [b.lastVital] : [],
    events: [],
    tasks: (b.openTasks ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      priority: t.priority ?? "routine",
      done: t.done ?? false,
      doneAt: t.doneAt ?? null,
      doneBy: t.doneBy ?? "",
      scheduledAt: t.scheduledAt ?? null,
      note: t.note ?? "",
      owner: t.owner ?? "Team",
    })),
    handovers: [],
  };

  return dailyRound(mockDetail, now);
}
