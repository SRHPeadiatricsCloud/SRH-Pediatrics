/**
 * The daily round: has today's work actually been recorded?
 *
 * The rule being tested is bookkeeping, not medicine — every state must follow
 * from something in the chart, and a missing figure must say "not recorded"
 * rather than guess. The feed-timing rule is the same one the Fluids tab uses
 * (interval from feedFreq, ten-minute grace), so the two screens cannot
 * disagree.
 *
 * Run with: npx tsx scripts/test-daily-round.ts
 */
import assert from "node:assert/strict";
import { dailyRound, unitRound, sameLocalDay, FEED_GRACE_MIN } from "../src/lib/daily-round";
import type { Detail } from "../src/lib/types";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

/** A fixed "now" so nothing here depends on the clock. */
const NOW = new Date(2026, 8, 22, 14, 0, 0); // 22 Sep 2026, 14:00 local
const iso = (d: Date) => d.toISOString();
const hoursAgo = (h: number) => iso(new Date(NOW.getTime() - h * 3600000));
const daysAgo = (d: number) => iso(new Date(NOW.getTime() - d * 86400000));

type Patch = {
  growth?: Detail["baby"]["clinical"]["growth"];
  fluids?: Detail["baby"]["clinical"]["fluids"];
  lines?: Detail["baby"]["clinical"]["lines"];
  drugs?: Detail["baby"]["clinical"]["drugs"];
  vitals?: Detail["vitals"];
  tasks?: Detail["tasks"];
  problems?: Detail["problems"];
};

function make(p: Patch = {}): Detail {
  return {
    baby: {
      id: 1,
      uhid: "UH-1",
      babyName: "Test Baby",
      motherName: "Mother",
      bed: "1",
      sex: "male",
      dob: daysAgo(6),
      gestWeeks: 30,
      gestDays: 0,
      birthWeight: 1200,
      currentWeight: 1200,
      birthLength: 0,
      birthHc: 0,
      deliveryMode: "NVD",
      apgar1: 0,
      apgar5: 0,
      bloodGroup: "",
      motherBloodGroup: "",
      inborn: true,
      acuity: "stable",
      status: "active",
      isolation: "none",
      consultant: "Dr A",
      unit: "nicu",
      subspecialty: "",
      insurance: "Self-pay",
      insuranceName: "",
      clinical: {
        growth: p.growth ?? [],
        fluids: p.fluids,
        lines: p.lines,
        drugs: p.drugs,
      },
      updatedAt: iso(NOW),
    },
    problems: p.problems ?? [],
    vitals: p.vitals ?? [],
    events: [],
    tasks: p.tasks ?? [],
    handovers: [],
  };
}

const item = (d: Detail, key: string) => dailyRound(d, NOW).items.find((i) => i.key === key)!;

/* --- 1. an empty chart reports every gap, and invents nothing ------------- */
{
  const r = dailyRound(make(), NOW);
  ok(r.items.length === 7, `seven round items (got ${r.items.length})`);
  ok(item(make(), "weight").value === "not recorded", "no weight says not recorded");
  ok(item(make(), "weight").state === "todo", "and is outstanding");
  ok(item(make(), "obs").value === "none recorded", "no observations says none recorded");
  ok(item(make(), "feeds").value === "no feed time recorded", "no feed time says so");
  ok(item(make(), "lines").state === "na", "no lines is not-applicable, not a gap");
  ok(item(make(), "medicines").state === "na", "no medicines is not-applicable, not a gap");
  ok(item(make(), "problems").state === "todo", "an empty problem list is a gap");
  // weight, obs, feeds, actions(none open -> done), lines(na), medicines(na), problems(todo)
  ok(r.outstanding === 4, `four things outstanding on an empty chart (got ${r.outstanding})`);
  ok(r.overdue === 0, "nothing is overdue when nothing was ever due");
}

/* --- 2. weight ----------------------------------------------------------- */
{
  const today = make({ growth: [{ at: hoursAgo(3), weight: 1.35 }] });
  ok(item(today, "weight").state === "done", "a weight today is done");
  ok(item(today, "weight").value === "1.35 kg today", `reads the value (${item(today, "weight").value})`);

  const old = make({ growth: [{ at: daysAgo(2), weight: 1.3 }] });
  ok(item(old, "weight").state === "todo", "an old weight is still outstanding");
  ok(item(old, "weight").value === "1.3 kg · 2 d ago", `says how old (${item(old, "weight").value})`);

  const newest = make({
    growth: [
      { at: daysAgo(4), weight: 1.2 },
      { at: hoursAgo(5), weight: 1.4 },
      { at: daysAgo(2), weight: 1.3 },
    ],
  });
  ok(item(newest, "weight").state === "done", "the newest entry wins, not the last in the array");
}

/* --- 3. observations ----------------------------------------------------- */
{
  const fresh = make({ vitals: [{ recordedAt: hoursAgo(2), hr: 145 }] });
  ok(item(fresh, "obs").state === "done", "observations today are done");

  const stale = make({ vitals: [{ recordedAt: daysAgo(1), hr: 145 }] });
  ok(item(stale, "obs").state === "overdue", "observations from yesterday are overdue");
  ok(item(stale, "obs").value === "last yesterday", `says when (${item(stale, "obs").value})`);

  const unparseable = make({ vitals: [{ recordedAt: "not a date", hr: 145 }] });
  ok(item(unparseable, "obs").state === "todo", "an unparseable timestamp is not treated as a reading");
}

/* --- 4. feeds use the Fluids tab's own interval and grace ---------------- */
{
  const onTime = make({ fluids: { feedFreq: "3 hourly", lastFeedAt: hoursAgo(2) } });
  ok(item(onTime, "feeds").state === "done", "a feed inside its interval is done");

  const late = make({ fluids: { feedFreq: "3 hourly", lastFeedAt: hoursAgo(4) } });
  ok(item(late, "feeds").state === "overdue", "a feed past 3 hourly is overdue");

  const grace = new Date(NOW.getTime() - (3 * 60 + FEED_GRACE_MIN) * 60000);
  const atGrace = make({ fluids: { feedFreq: "3 hourly", lastFeedAt: iso(grace) } });
  ok(item(atGrace, "feeds").state === "done", "exactly at the grace limit is not late");

  const pastGrace = make({
    fluids: { feedFreq: "3 hourly", lastFeedAt: iso(new Date(NOW.getTime() - (3 * 60 + FEED_GRACE_MIN + 1) * 60000)) },
  });
  ok(item(pastGrace, "feeds").state === "overdue", "one minute past the grace limit is late");

  const nonHourly = make({ fluids: { feedFreq: "continuous", lastFeedAt: hoursAgo(30) } });
  ok(item(nonHourly, "feeds").state === "done", "a frequency with no interval is never called late");
}

/* --- 5. actions ---------------------------------------------------------- */
{
  const task = (p: Partial<Detail["tasks"][number]> = {}) => ({
    id: 1,
    text: "Do it",
    priority: "routine",
    done: false,
    doneAt: null,
    doneBy: "",
    ...p,
  });

  ok(item(make({ tasks: [] }), "actions").state === "done", "no open actions is done");
  ok(item(make({ tasks: [task()] }), "actions").state === "todo", "an open action is outstanding");
  ok(item(make({ tasks: [task({ done: true })] }), "actions").state === "done", "a completed action is not");
  ok(
    item(make({ tasks: [task({ priority: "now" }), task({ priority: "today" })] }), "actions").value === "2 for today",
    "now/today actions are counted as today's work",
  );

  const lateTask = make({ tasks: [task({ scheduledAt: hoursAgo(6) })] });
  ok(item(lateTask, "actions").state === "overdue", "a scheduled action in the past is overdue");
  ok(item(lateTask, "actions").value === "1 past due", `says how many (${item(lateTask, "actions").value})`);

  const future = make({ tasks: [task({ scheduledAt: hoursAgo(-6) })] });
  ok(item(future, "actions").state === "todo", "a future action is outstanding, not overdue");
}

/* --- 6. lines and medicines ---------------------------------------------- */
{
  ok(item(make({ lines: [{ name: "UVC", day: 3 }] }), "lines").state === "done", "a dated line is done");
  ok(item(make({ lines: [{ name: "UVC", day: 0 }] }), "lines").state === "todo", "an undated line is a gap");
  ok(item(make({ lines: [{ name: "UVC", day: 3 }, { name: "PICC", day: 0 }] }), "lines").value === "1 undated", "counts the undated ones");

  ok(item(make({ drugs: [{ name: "Ampicillin", startedAt: daysAgo(2) }] }), "medicines").state === "done", "a dated medicine is done");
  ok(item(make({ drugs: [{ name: "Ampicillin" }] }), "medicines").state === "todo", "a medicine with no start date is a gap");
}

/* --- 7. problem list ----------------------------------------------------- */
{
  const withProblems = make({
    problems: [
      { id: 1, system: "resp", label: "RDS", status: "active", onsetAt: daysAgo(3), resolvedAt: null },
      { id: 2, system: "cvs", label: "PDA", status: "resolved", onsetAt: daysAgo(5), resolvedAt: daysAgo(1) },
    ],
  });
  ok(item(withProblems, "problems").value === "1 active", "only unresolved problems count");
  ok(item(withProblems, "problems").state === "done", "a populated list is done");
}

/* --- 8. the unit roll-up -------------------------------------------------- */
{
  const a = make({ growth: [{ at: hoursAgo(1), weight: 1.4 }] });
  const b = make({ vitals: [{ recordedAt: daysAgo(1), hr: 140 }] });
  const roll = unitRound([a, b], NOW);
  ok(roll.outstanding > 0, "the roll-up counts outstanding items across babies");
  ok(roll.overdue === 1, `one overdue across the two babies (got ${roll.overdue})`);
  ok(roll.byItem.get("obs")?.babies.length === 2, "both babies need observations");
  ok(roll.byItem.get("weight")?.babies.length === 1, "only the second is missing a weight");
  ok(roll.byItem.has("lines") === false, "not-applicable items never appear in the roll-up");
}

/* --- 9. day boundaries use the local calendar ---------------------------- */
{
  const lateNight = new Date(2026, 8, 22, 23, 30, 0);
  const justAfter = new Date(2026, 8, 23, 0, 30, 0);
  ok(sameLocalDay(lateNight, justAfter) === false, "midnight starts a new round day");
  const w = make({ growth: [{ at: iso(lateNight), weight: 1.4 }] });
  ok(item(w, "weight").state === "done", "a weight at 23:30 counts for that day");
  ok(dailyRound(w, justAfter).items.find((i) => i.key === "weight")!.state === "todo", "and not for the next");
}

console.log(`Daily round tests passed (${checks} checks)`);
