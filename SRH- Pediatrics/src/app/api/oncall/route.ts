import { NextResponse } from "next/server";
import { db } from "@/db";
import { oncall } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get("day");
  if (day) {
    const [row] = await db.select().from(oncall).where(eq(oncall.day, day));
    return NextResponse.json({ row: row ?? null });
  }
  const [row] = await db.select().from(oncall).orderBy(desc(oncall.day));
  return NextResponse.json({ row: row ?? null });
}

export async function POST(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const body = await req.json();
  const day: string = body.day || new Date().toISOString().slice(0, 10);
  const fields = body.fields ?? {};
  const [existing] = await db.select().from(oncall).where(eq(oncall.day, day));
  if (existing) {
    const [row] = await db
      .update(oncall)
      .set({ fields: { ...((existing.fields as object) ?? {}), ...fields }, updatedBy: editor, updatedAt: new Date() })
      .where(eq(oncall.id, existing.id))
      .returning();
    return NextResponse.json({ row });
  }
  const [row] = await db
    .insert(oncall)
    .values({ day, fields, updatedBy: editor })
    .returning();
  return NextResponse.json({ row });
}
