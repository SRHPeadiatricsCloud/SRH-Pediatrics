import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, handovers, problems, tasks, vitals } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(babies);
  const ids = rows.map((r) => r.id);
  const empty = { problems: [], vitals: [], events: [], tasks: [], handovers: [] };
  if (!ids.length) {
    return NextResponse.json({ at: new Date().toISOString(), babies: [] });
  }
  const [allProblems, allVitals, allEvents, allTasks, allHandovers] = await Promise.all([
    db.select().from(problems).where(inArray(problems.babyId, ids)),
    db.select().from(vitals).where(inArray(vitals.babyId, ids)),
    db.select().from(events).where(inArray(events.babyId, ids)),
    db.select().from(tasks).where(inArray(tasks.babyId, ids)),
    db.select().from(handovers).where(inArray(handovers.babyId, ids)),
  ]);

  const pack = rows.map((baby) => ({
    baby,
    problems: allProblems.filter((p) => p.babyId === baby.id),
    vitals: allVitals.filter((v) => v.babyId === baby.id),
    events: allEvents.filter((e) => e.babyId === baby.id),
    tasks: allTasks.filter((t) => t.babyId === baby.id),
    handovers: allHandovers.filter((h) => h.babyId === baby.id),
  }));

  return NextResponse.json({
    at: new Date().toISOString(),
    babies: pack,
    empty,
  });
}
