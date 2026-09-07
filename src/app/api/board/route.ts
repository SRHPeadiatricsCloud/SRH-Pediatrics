import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, problems, tasks, vitals, handovers } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unit = new URL(req.url).searchParams.get("unit");
  const base = db.select().from(babies).orderBy(desc(babies.updatedAt));
  const rows = unit ? await base.where(eq(babies.unit, unit)) : await base;
  const ids = rows.map((r) => r.id);
  const allProblems = ids.length
    ? await db.select().from(problems).where(inArray(problems.babyId, ids))
    : [];
  const allTasks = ids.length
    ? await db.select().from(tasks).where(inArray(tasks.babyId, ids))
    : [];
  const recentVitals = ids.length
    ? await db
        .select()
        .from(vitals)
        .where(inArray(vitals.babyId, ids))
        .orderBy(desc(vitals.recordedAt))
        .limit(400)
    : [];
  const recentHandovers = ids.length
    ? await db
        .select()
        .from(handovers)
        .where(inArray(handovers.babyId, ids))
        .orderBy(desc(handovers.createdAt))
        .limit(200)
    : [];

  const data = rows.map((b) => ({
    ...b,
    problems: allProblems.filter((p) => p.babyId === b.id && p.status !== "resolved"),
    openTasks: allTasks.filter((t) => t.babyId === b.id && !t.done),
    lastVital: recentVitals.find((v) => v.babyId === b.id) ?? null,
    lastHandover: recentHandovers.find((h) => h.babyId === b.id) ?? null,
  }));

  return NextResponse.json({ babies: data, serverTime: new Date().toISOString() });
}

export async function DELETE(req: Request) {
  if (!(await editorOfChecked(req))) return unsigned();
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(babies).where(eq(babies.id, id));
  await db.delete(problems).where(eq(problems.babyId, id));
  await db.delete(tasks).where(eq(tasks.babyId, id));
  await db.delete(vitals).where(eq(vitals.babyId, id));
  await db.delete(handovers).where(eq(handovers.babyId, id));
  return NextResponse.json({ ok: true });
}
