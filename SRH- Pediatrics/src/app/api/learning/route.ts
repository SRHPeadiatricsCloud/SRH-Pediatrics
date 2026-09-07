import { NextResponse } from "next/server";
import { db } from "@/db";
import { learningItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get("day");
  const q = db.select().from(learningItems).orderBy(asc(learningItems.time), asc(learningItems.id));
  const rows = day ? await q.where(eq(learningItems.day, day)) : await q;
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const b = await req.json();
  const [row] = await db
    .insert(learningItems)
    .values({
      day: String(b.day ?? new Date().toISOString().slice(0, 10)),
      time: String(b.time ?? ""),
      title: String(b.title ?? "Class"),
      kind: String(b.kind ?? "class"),
      presenter: String(b.presenter ?? ""),
      venue: String(b.venue ?? ""),
      audience: String(b.audience ?? ""),
      notes: String(b.notes ?? ""),
      link: String(b.link ?? ""),
      createdBy: editor,
    })
    .returning();
  return NextResponse.json({ row });
}

export async function PATCH(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const b = await req.json();
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["day", "time", "title", "kind", "presenter", "venue", "audience", "notes", "link"] as const) {
    if (k in b) patch[k] = String(b[k] ?? "");
  }
  const [row] = await db.update(learningItems).set(patch).where(eq(learningItems.id, id)).returning();
  return NextResponse.json({ row });
}

export async function DELETE(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(learningItems).where(eq(learningItems.id, id));
  return NextResponse.json({ ok: true });
}
