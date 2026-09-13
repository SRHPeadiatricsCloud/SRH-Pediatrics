import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, handovers, problems, tasks, vitals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

const asIntOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const asRealOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Ctx = { params: Promise<{ id: string; resource: string }> };

async function log(babyId: number, kind: string, text: string, author = "Team") {
  await db.insert(events).values({ babyId, kind, text, author });
  await db.update(babies).set({ updatedAt: new Date() }).where(eq(babies.id, babyId));
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const { id: rawId, resource } = await ctx.params;
  const id = Number(rawId);
  const body = await req.json();

  switch (resource) {
    case "problems": {
      const items: { system: string; label: string; detail?: string; status?: string }[] =
        body.items ?? [body];
      const rows = await db
        .insert(problems)
        .values(
          items.map((p) => ({
            babyId: id,
            system: p.system,
            label: p.label,
            detail: p.detail ?? "",
            status: p.status ?? "active",
          })),
        )
        .returning();
      await log(id, "problem", `Problem added: ${items.map((i) => i.label).join(", ")}`, body.author);
      return NextResponse.json({ rows });
    }
    case "vitals": {
      const [row] = await db
        .insert(vitals)
        .values({
          babyId: id,
          recordedBy: body.recordedBy ?? "Nurse",
          hr: asIntOrNull(body.hr),
          rr: asIntOrNull(body.rr),
          spo2: asIntOrNull(body.spo2),
          spo2Post: asIntOrNull(body.spo2Post),
          temp: asRealOrNull(body.temp),
          sbp: asIntOrNull(body.sbp),
          dbp: asIntOrNull(body.dbp),
          map: asIntOrNull(body.map),
          crt: asIntOrNull(body.crt),
          rbs: asIntOrNull(body.rbs),
          fio2: asIntOrNull(body.fio2),
          painScore: asIntOrNull(body.painScore),
          painScale: String(body.painScale ?? "NIPS"),
          painRaw: asRealOrNull(body.painRaw ?? body.painScore),
          urineMlKgHr: asRealOrNull(body.urineMlKgHr),
          notes: body.notes ?? "",
        })
        .returning();
      await db.update(babies).set({ updatedAt: new Date() }).where(eq(babies.id, id));
      return NextResponse.json({ row });
    }
    case "events": {
      const [row] = await db
        .insert(events)
        .values({ babyId: id, kind: body.kind ?? "note", text: body.text, author: body.author ?? "Team" })
        .returning();
      await db.update(babies).set({ updatedAt: new Date() }).where(eq(babies.id, id));
      return NextResponse.json({ row });
    }
    case "tasks": {
      // items may be plain strings or rich objects {text, priority, owner, scheduledAt, note}
      const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [body.text];
      const items = rawItems
        .map((t) => (typeof t === "string" ? { text: t } : (t as Record<string, unknown>)))
        .filter((t) => t && String(t.text ?? "").trim());
      const rows = await db
        .insert(tasks)
        .values(
          items.map((t) => ({
            babyId: id,
            text: String(t.text).trim(),
            priority: String(t.priority ?? body.priority ?? "today"),
            owner: String(t.owner ?? body.owner ?? "Team"),
            scheduledAt: t.scheduledAt ? new Date(String(t.scheduledAt)) : null,
            note: String(t.note ?? ""),
          })),
        )
        .returning();
      return NextResponse.json({ rows });
    }
    case "handovers": {
      const rawActions: unknown[] = Array.isArray(body.actions) ? body.actions : [];
      const seenText = new Set<string>();
      const actionItems: unknown[] = [];
      for (const a of rawActions) {
        const t0 = typeof a === "string" ? a : String((a as Record<string, unknown>).text ?? "");
        const text = t0.trim();
        if (!text || seenText.has(text.toLowerCase())) continue;
        seenText.add(text.toLowerCase());
        actionItems.push(typeof a === "string" ? text : { ...(a as Record<string, unknown>), text });
      }
      const [row] = await db
        .insert(handovers)
        .values({
          babyId: id,
          shift: body.shift ?? "Morning",
          fromStaff: body.fromStaff ?? "",
          toStaff: body.toStaff ?? "",
          illness: body.illness ?? "stable",
          summary: body.summary ?? "",
          actions: actionItems,
          contingency: [],
          synthesis: body.synthesis ?? "",
          snapshot: body.snapshot ?? {},
        })
        .returning();
      if (actionItems.length) {
        const currentTasks = await db.select().from(tasks).where(eq(tasks.babyId, id));
        const existingOpen = new Set(
          currentTasks.filter((t) => !t.done).map((t) => t.text.trim().toLowerCase()),
        );
        const rich = actionItems
          .map((a) => (typeof a === "string" ? { text: a } : (a as Record<string, unknown>)))
          .filter((a) => String(a.text ?? "").trim());
        const newTasks = rich.filter((a) => !existingOpen.has(String(a.text).trim().toLowerCase()));
        if (newTasks.length) {
          await db.insert(tasks).values(
            newTasks.map((a) => ({
              babyId: id,
              text: String(a.text).trim(),
              priority: String(a.priority ?? "today"),
              owner: String(a.owner || body.toStaff || "Team"),
              scheduledAt: a.scheduledAt ? new Date(String(a.scheduledAt)) : null,
              note: String(a.note ?? ""),
            })),
          );
        }
      }
      await log(
        id,
        "handover",
        `${body.shift} handover signed by ${body.fromStaff || "staff"} · ${actionItems.length} action${actionItems.length === 1 ? "" : "s"}`,
        body.fromStaff,
      );
      return NextResponse.json({ row });
    }
    default:
      return NextResponse.json({ error: "unknown resource" }, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const { id: rawId, resource } = await ctx.params;
  const id = Number(rawId);
  const body = await req.json();

  if (resource === "problems") {
    const [row] = await db
      .update(problems)
      .set({
        status: body.status,
        detail: body.detail,
        resolvedAt: body.status === "resolved" ? new Date() : null,
      })
      .where(eq(problems.id, body.id))
      .returning();
    await log(id, "problem", `Problem "${row?.label}" → ${body.status}`, body.author);
    return NextResponse.json({ row });
  }
  if (resource === "tasks") {
    const patch: Record<string, unknown> = {};
    if (body.text !== undefined) patch.text = String(body.text);
    if (body.priority !== undefined) patch.priority = String(body.priority);
    if (body.owner !== undefined) patch.owner = String(body.owner);
    if (body.note !== undefined) patch.note = String(body.note);
    if (body.scheduledAt !== undefined) {
      patch.scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    }
    if (body.done !== undefined) {
      const done = Boolean(body.done);
      patch.done = done;
      patch.doneAt = done ? new Date() : null;
      patch.doneBy = done ? String(body.doneBy ?? (await editorOfChecked(req)) ?? "") : "";
    }
    const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, body.id)).returning();
    return NextResponse.json({ row });
  }
  if (resource === "handovers") {
    const [row] = await db
      .update(handovers)
      .set({ acknowledgedBy: body.acknowledgedBy, acknowledgedAt: new Date() })
      .where(eq(handovers.id, body.id))
      .returning();
    await log(id, "handover", `Handover received & acknowledged by ${body.acknowledgedBy}`, body.acknowledgedBy);
    return NextResponse.json({ row });
  }
  return NextResponse.json({ error: "unknown resource" }, { status: 400 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const { resource } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const rowId = Number(searchParams.get("rowId"));
  if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });
  if (resource === "problems") await db.delete(problems).where(eq(problems.id, rowId));
  else if (resource === "tasks") await db.delete(tasks).where(eq(tasks.id, rowId));
  else if (resource === "vitals") await db.delete(vitals).where(eq(vitals.id, rowId));
  else return NextResponse.json({ error: "unknown resource" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
