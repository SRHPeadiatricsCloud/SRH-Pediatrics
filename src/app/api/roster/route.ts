import { NextResponse } from "next/server";
import { db } from "@/db";
import { roster } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get("month");
  if (month) {
    const [row] = await db.select().from(roster).where(eq(roster.month, month));
    return NextResponse.json({ row: row ?? null });
  }
  const rows = await db.select().from(roster);
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const body = await req.json();
  const month: string = body.month;
  if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const data = body.data ?? {};
  const source = body.source ?? "manual";
  const [existing] = await db.select().from(roster).where(eq(roster.month, month));
  if (existing) {
    const [row] = await db
      .update(roster)
      .set({
        data: { ...((existing.data as object) ?? {}), ...data },
        source,
        updatedBy: editor,
        updatedAt: new Date(),
      })
      .where(eq(roster.id, existing.id))
      .returning();
    return NextResponse.json({ row });
  }
  const [row] = await db.insert(roster).values({ month, data, source, updatedBy: editor }).returning();
  return NextResponse.json({ row });
}

export async function DELETE(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const month = new URL(req.url).searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
  await db.delete(roster).where(eq(roster.month, month));
  return NextResponse.json({ ok: true });
}
