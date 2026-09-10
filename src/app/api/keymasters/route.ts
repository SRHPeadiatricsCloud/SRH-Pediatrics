import { NextResponse } from "next/server";
import { db } from "@/db";
import { keymasters } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { editorOfChecked, hashCode, unsigned } from "@/lib/guard";
import { ensureAdmin, isEditorAdmin } from "@/lib/admin";
import { ADMIN_NAME, isAdminRole, sameName } from "@/lib/admin-constants";

export const dynamic = "force-dynamic";

const mask = (n: number) => `•••• ${String(n).slice(-2).padStart(2, "•")}`;

export async function GET(req: Request) {
  await ensureAdmin();
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

/** Register a keymaster. Only Admin may add; role "Admin" is reserved. */
export async function POST(req: Request) {
  await ensureAdmin();
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  if (!isEditorAdmin(editor)) {
    return NextResponse.json({ error: "Only the Admin may add keymasters." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim();
  const role = String(body.role ?? "Consultant").trim() || "Consultant";
  const unit = String(body.unit ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!code || code.length < 3) {
    return NextResponse.json({ error: "Employee code must be at least 3 characters." }, { status: 400 });
  }
  if (isAdminRole(role)) {
    return NextResponse.json({ error: 'Role "Admin" is reserved.' }, { status: 403 });
  }
  if (sameName(name, ADMIN_NAME)) {
    return NextResponse.json({ error: "That name is reserved." }, { status: 403 });
  }
  const dup = await db.select({ id: keymasters.id }).from(keymasters).where(eq(keymasters.name, name)).limit(1);
  if (dup.length) return NextResponse.json({ error: "That name is already on the Keymaster List." }, { status: 409 });
  // also prevent case-insensitive duplicate that would bypass exact match
  const all = await db.select().from(keymasters);
  if (all.some((r) => sameName(r.name, name))) {
    return NextResponse.json({ error: "That name is already on the Keymaster List." }, { status: 409 });
  }

  const [row] = await db
    .insert(keymasters)
    .values({ name, codeHash: hashCode(code), role, unit, createdBy: editor })
    .returning();
  return NextResponse.json({ row: { id: row.id, name: row.name, role: row.role, unit: row.unit } });
}

/** Rename / change role / rotate code. */
export async function PATCH(req: Request) {
  await ensureAdmin();
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const [row] = await db.select().from(keymasters).where(eq(keymasters.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isAdmin = isEditorAdmin(editor);
  const targetIsAdmin = sameName(row.name, ADMIN_NAME);

  // Admin row is editable only by Admin
  if (targetIsAdmin && !isAdmin) {
    return NextResponse.json({ error: "Only the Admin may edit the Admin entry." }, { status: 403 });
  }
  // Others may edit only their own row; Admin may edit any
  if (!isAdmin && !sameName(editor, row.name)) {
    return NextResponse.json({ error: "You may only edit your own entry." }, { status: 403 });
  }
  // Cannot grant Admin role to anyone else
  if (body.role !== undefined) {
    const newRole = String(body.role).trim();
    if (newRole && isAdminRole(newRole) && !targetIsAdmin) {
      return NextResponse.json({ error: 'Role "Admin" is reserved.' }, { status: 403 });
    }
    // Optionally prevent demoting the Admin row away from Admin; keep it locked
    if (targetIsAdmin && newRole && !isAdminRole(newRole)) {
      return NextResponse.json({ error: 'The Admin role cannot be changed.' }, { status: 403 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (n) {
      // prevent renaming a non-admin to the admin name
      if (sameName(n, ADMIN_NAME) && !targetIsAdmin) {
        return NextResponse.json({ error: "That name is reserved." }, { status: 403 });
      }
      // prevent duplicate names (case-insensitive)
      if (!sameName(n, row.name)) {
        const all = await db.select().from(keymasters);
        if (all.some((r) => r.id !== row.id && sameName(r.name, n))) {
          return NextResponse.json({ error: "That name is already on the Keymaster List." }, { status: 409 });
        }
      }
      patch.name = n;
    }
  }
  if (body.role !== undefined) {
    const r = String(body.role).trim();
    if (r) patch.role = r;
  }
  if (body.unit !== undefined) patch.unit = String(body.unit).trim();
  if (body.code) {
    // Rotating a code requires the caller to present the current code for that row.
    const current = String(body.currentCode ?? "").trim();
    if (hashCode(current) !== row.codeHash) {
      return NextResponse.json({ error: "Current employee code is incorrect." }, { status: 403 });
    }
    patch.codeHash = hashCode(String(body.code));
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ row: { id: row.id, name: row.name, role: row.role, unit: row.unit } });
  }
  const [updated] = await db.update(keymasters).set(patch).where(eq(keymasters.id, id)).returning();
  return NextResponse.json({ row: { id: updated.id, name: updated.name, role: updated.role, unit: updated.unit } });
}

export async function DELETE(req: Request) {
  await ensureAdmin();
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  if (!isEditorAdmin(editor)) {
    return NextResponse.json({ error: "Only the Admin may delete keymasters." }, { status: 403 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const [target] = await db.select().from(keymasters).where(eq(keymasters.id, id));
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (sameName(target.name, ADMIN_NAME)) {
    return NextResponse.json({ error: "The Admin entry cannot be deleted." }, { status: 403 });
  }
  const count = await db.select({ id: keymasters.id }).from(keymasters);
  if (count.length <= 1) {
    return NextResponse.json({ error: "Cannot remove the last keymaster — the unit would lock." }, { status: 409 });
  }
  await db.delete(keymasters).where(eq(keymasters.id, id));
  return NextResponse.json({ ok: true });
}
