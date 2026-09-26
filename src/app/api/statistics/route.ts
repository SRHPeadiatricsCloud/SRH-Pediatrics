import { NextRequest, NextResponse } from "next/server";
import { and, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { babies, handovers, problems, tasks, vitals } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Data feed for the month-end Statistics report.
 *
 * Returns every baby chart plus the observations, problems, handovers and
 * tasks recorded inside the requested month (and the previous month, so the
 * report can show month-over-month deltas). The numbers themselves are
 * computed client-side by src/lib/stats.ts, where they are unit-tested.
 *
 *   GET /api/statistics?month=YYYY-MM
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  // Window starts on the 1st of the PREVIOUS month (for the delta columns)
  // and ends just after the last day of the requested month. Local time —
  // the same convention as everywhere else in the app.
  const from = new Date(y, mo - 2, 1, 0, 0, 0);
  const to = new Date(y, mo, 1, 0, 0, 0);

  const [babyRows, vitalRows, problemRows, handoverRows, taskRows] = await Promise.all([
    db.select().from(babies),
    db.select().from(vitals).where(and(gte(vitals.recordedAt, from), lt(vitals.recordedAt, to))),
    db.select().from(problems),
    db.select().from(handovers).where(and(gte(handovers.createdAt, from), lt(handovers.createdAt, to))),
    db.select().from(tasks).where(and(gte(tasks.createdAt, from), lt(tasks.createdAt, to))),
  ]);

  return NextResponse.json({
    month,
    babies: babyRows,
    vitals: vitalRows,
    problems: problemRows,
    handovers: handoverRows,
    tasks: taskRows,
  });
}
