import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, handovers, problems, tasks, vitals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

const intFields = new Set(["gestWeeks", "gestDays", "birthWeight", "currentWeight", "apgar1", "apgar5"]);
const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : v;
};

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const [baby] = await db.select().from(babies).where(eq(babies.id, id));
  if (!baby) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [probs, vits, evts, tsks, hos] = await Promise.all([
    db.select().from(problems).where(eq(problems.babyId, id)).orderBy(desc(problems.createdAt)),
    db.select().from(vitals).where(eq(vitals.babyId, id)).orderBy(desc(vitals.recordedAt)).limit(40),
    db.select().from(events).where(eq(events.babyId, id)).orderBy(desc(events.at)).limit(60),
    db.select().from(tasks).where(eq(tasks.babyId, id)).orderBy(desc(tasks.createdAt)),
    db.select().from(handovers).where(eq(handovers.babyId, id)).orderBy(desc(handovers.createdAt)).limit(20),
  ]);
  return NextResponse.json({
    baby,
    problems: probs,
    vitals: vits,
    events: evts,
    tasks: tsks,
    handovers: hos,
    serverTime: new Date().toISOString(),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const id = Number((await ctx.params).id);
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const scalar = [
    "uhid",
    "babyName",
    "motherName",
    "bed",
    "unit",
    "subspecialty",
    "insurance",
    "insuranceName",
    "sex",
    "gestWeeks",
    "gestDays",
    "birthWeight",
    "currentWeight",
    "birthLength",
    "birthHc",
    "deliveryMode",
    "apgar1",
    "apgar5",
    "bloodGroup",
    "motherBloodGroup",
    "inborn",
    "acuity",
    "status",
    "isolation",
    "consultant",
  ];
  for (const k of scalar) if (k in body) patch[k] = intFields.has(k) ? int(body[k]) : body[k];
  if (body.dob) patch.dob = new Date(body.dob);
  if (body.clinical) {
    const [cur] = await db.select().from(babies).where(eq(babies.id, id));
    patch.clinical = { ...((cur?.clinical as object) ?? {}), ...body.clinical };
  }
  const [row] = await db.update(babies).set(patch).where(eq(babies.id, id)).returning();
  if (body.logEvent) {
    const kind = String(body.logEvent.kind ?? "update");
    const text = String(body.logEvent.text ?? "").trim();
    if (text) {
      const [alreadyLogged] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.babyId, id), eq(events.kind, kind), eq(events.text, text)))
        .limit(1);
      if (!alreadyLogged) {
        await db.insert(events).values({
          babyId: id,
          kind,
          text,
          author: body.logEvent.author ?? "Team",
        });
      }
    }
  }
  return NextResponse.json({ baby: row });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const id = Number((await ctx.params).id);
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  if (!permanent) {
    const [row] = await db
      .update(babies)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(babies.id, id))
      .returning();
    if (row) {
      await db.insert(events).values({
        babyId: id,
        kind: "delete",
        text: "Baby card moved to Recently deleted — can be undone or restored from local backup",
        author: "Team",
      });
    }
    return NextResponse.json({ ok: true, soft: true, baby: row ?? null });
  }
  await db.delete(problems).where(eq(problems.babyId, id));
  await db.delete(vitals).where(eq(vitals.babyId, id));
  await db.delete(events).where(eq(events.babyId, id));
  await db.delete(tasks).where(eq(tasks.babyId, id));
  await db.delete(handovers).where(eq(handovers.babyId, id));
  await db.delete(babies).where(and(eq(babies.id, id)));
  return NextResponse.json({ ok: true, soft: false });
}
