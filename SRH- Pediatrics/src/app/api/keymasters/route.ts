import { NextResponse } from "next/server";
import { db } from "@/db";
import { keymasters } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { editorOfChecked, hashCode, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

const mask = (n: number) => `•••• ${String(n).slice(-2).padStart(2, "•")}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("meta") === "1") {
    const one = await db.select({ id: keymasters.id }).from(keymasters).limit(1);
    return NextResponse.json({ hasKeys: one.length > 0 });
  }
  const rows = await db.select().from(keymasters).orderBy(asc(keymasters.id));
  return NextResponse.json({
    hasKeys: rows.length > 0,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      unit: r.unit,
      codeMask: mask(r.id),
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    })),
  });
}

/** Register a keymaster. Open while the list is empty (setup); signed-in afterwards. */
export async function POST(req: Request) {
  const existing = await db.select({ id: keymasters.id }).from(keymasters).limit(1);
  const bootstrapping = existing.length === 0;
  const editor: string = bootstrapping ? "bootstrap" : ((await editorOfChecked(req)) ?? "");
  if (!editor) return unsigned();

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim();
  const role = String(body.role ?? "Consultant").trim() || "Consultant";
  const unit = String(body.unit ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!code || code.length < 3) {
    return NextResponse.json({ error: "Employee code must be at least 3 characters." }, { status: 400 });
  }
  const dup = await db.select({ id: keymasters.id }).from(keymasters).where(eq(keymasters.name, name)).limit(1);
  if (dup.length) return NextResponse.json({ error: "That name is already on the Keymaster List." }, { status: 409 });

  const [row] = await db
    .insert(keymasters)
    .values({ name, codeHash: hashCode(code), role, unit, createdBy: editor })
    .returning();
  return NextResponse.json({ row: { id: row.id, name: row.name, role: row.role, unit: row.unit } });
}

/** Rename / change role / rotate code. Requires the caller's own valid code. */
export async function PATCH(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const [row] = await db.select().from(keymasters).where(eq(keymasters.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.name) patch.name = String(body.name).trim();
  if (body.role) patch.role = String(body.role).trim();
  if (body.unit !== undefined) patch.unit = String(body.unit).trim();
  if (body.code) {
    // Rotating a code requires the caller to present the current code for that row.
    const current = String(body.currentCode ?? "").trim();
    if (hashCode(current) !== row.codeHash) {
      return NextResponse.json({ error: "Current employee code is incorrect." }, { status: 403 });
    }
    patch.codeHash = hashCode(String(body.code));
  }
  const [updated] = await db.update(keymasters).set(patch).where(eq(keymasters.id, id)).returning();
  return NextResponse.json({ row: { id: updated.id, name: updated.name, role: updated.role, unit: updated.unit } });
}

export async function DELETE(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const count = await db.select({ id: keymasters.id }).from(keymasters);
  if (count.length <= 1) {
    return NextResponse.json({ error: "Cannot remove the last keymaster — the unit would lock." }, { status: 409 });
  }
  await db.delete(keymasters).where(eq(keymasters.id, id));
  return NextResponse.json({ ok: true });
}
