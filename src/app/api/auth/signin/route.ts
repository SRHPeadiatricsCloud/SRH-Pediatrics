import { NextResponse } from "next/server";
import { db } from "@/db";
import { keymasters } from "@/db/schema";
import { hashCode } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Verify a name + employee code against the Keymaster List. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim();
  if (!name || !code) {
    return NextResponse.json({ ok: false, error: "Enter your name and employee code." }, { status: 400 });
  }
  const rows = await db.select().from(keymasters);
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No keys registered yet — add the first person in the Keymaster List." },
      { status: 404 },
    );
  }
  const hash = hashCode(code);
  const match = rows.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.codeHash === hash);
  if (!match) {
    return NextResponse.json({ ok: false, error: "Name and employee code do not match." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, name: match.name, role: match.role, unit: match.unit });
}
