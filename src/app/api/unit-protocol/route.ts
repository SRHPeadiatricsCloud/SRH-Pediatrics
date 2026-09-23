import { NextResponse } from "next/server";
import { db } from "@/db";
import { unitProtocols } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";
import { isProtocolKey } from "@/lib/feed-guide";

export const dynamic = "force-dynamic";

/**
 * The unit-wide feeding protocol: the figures a unit replaces from the
 * published guidance in `src/lib/feed-guide.ts`.
 *
 * One row per unit. A baby's own `clinical.fluids.protocol` still wins over
 * this, so an individual chart can depart from the unit without changing it.
 */
export async function GET(req: Request) {
  const unit = new URL(req.url).searchParams.get("unit") ?? "nicu";
  const [row] = await db.select().from(unitProtocols).where(eq(unitProtocols.unit, unit));
  return NextResponse.json({ unit, row: row ?? null });
}

/**
 * Replaces the unit's protocol wholesale.
 *
 * A merge would make it impossible to remove a figure: once a unit had typed a
 * number there would be no way to go back to the published value. Sending the
 * whole object means an empty field is an empty field.
 */
export async function POST(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const body = await req.json();
  const unit = String(body.unit ?? "nicu");
  const protocol =
    body.protocol && typeof body.protocol === "object" && !Array.isArray(body.protocol)
      ? (body.protocol as Record<string, unknown>)
      : {};
  // Keep only real figures with finite numbers, so a cleared field really does
  // fall back to the published value and nothing else can be stored.
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(protocol)) {
    if (!isProtocolKey(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
  }
  const [existing] = await db.select().from(unitProtocols).where(eq(unitProtocols.unit, unit));
  if (existing) {
    const [row] = await db
      .update(unitProtocols)
      .set({ protocol: clean, updatedBy: editor, updatedAt: new Date() })
      .where(eq(unitProtocols.id, existing.id))
      .returning();
    return NextResponse.json({ unit, row });
  }
  const [row] = await db.insert(unitProtocols).values({ unit, protocol: clean, updatedBy: editor }).returning();
  return NextResponse.json({ unit, row });
}
