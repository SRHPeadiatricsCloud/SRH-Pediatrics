import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { keymasters } from "@/db/schema";

/** SHA-256 of an employee code — the code itself is never stored or logged. */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function editorOf(req: Request): string {
  return (req.headers.get("x-editor") || "").trim();
}

export function codeOf(req: Request): string {
  return (req.headers.get("x-code") || "").trim();
}

export function unsigned() {
  return NextResponse.json(
    { error: "View-only: sign in with your employee code to edit & save." },
    { status: 401 },
  );
}

/**
 * Resolve the editing identity for a mutating request.
 *
 * Rules:
 *  - While the Keymaster List is empty the unit is in open setup mode and any
 *    named editor may write (so the first keymaster can be registered).
 *  - Once at least one keymaster exists, the request must carry a matching
 *    name + employee code (the code is the password). Anything else is
 *    view-only and receives 401.
 */
export async function editorOfChecked(req: Request): Promise<string | null> {
  const name = editorOf(req);
  if (!name) return null;
  const rows = await db.select().from(keymasters);
  if (rows.length === 0) return name; // open setup phase
  const code = codeOf(req);
  if (!code) return null;
  const hash = hashCode(code);
  const match = rows.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.codeHash === hash);
  return match ? match.name : null;
}

export async function hasKeys(): Promise<boolean> {
  const rows = await db.select({ id: keymasters.id }).from(keymasters).limit(1);
  return rows.length > 0;
}
