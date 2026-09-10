import { db } from "@/db";
import { keymasters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ADMIN_NAME, ADMIN_ROLE, isAdminRole, sameName } from "./admin-constants";
import { hashCode } from "./guard";

/** Resolve the admin employee code: env override or default. */
export function adminCode(): string {
  const env = process.env.ADMIN_EMPLOYEE_CODE?.trim();
  return env && env.length > 0 ? env : "SRH1001";
}

/**
 * Ensure the built-in Admin row exists.
 * - If absent, insert it (role Admin, hashed code, created_by "system").
 * - If present but role != Admin, update role to Admin but never overwrite code hash.
 */
export async function ensureAdmin(): Promise<void> {
  const rows = await db.select().from(keymasters);
  const adminRow = rows.find((r) => sameName(r.name, ADMIN_NAME));
  if (!adminRow) {
    await db.insert(keymasters).values({
      name: ADMIN_NAME,
      codeHash: hashCode(adminCode()),
      role: ADMIN_ROLE,
      unit: "",
      createdBy: "system",
    });
  } else if (!isAdminRole(adminRow.role)) {
    await db.update(keymasters).set({ role: ADMIN_ROLE }).where(eq(keymasters.id, adminRow.id));
  }
}

/** True when the editor name matches the built-in Admin (case-insensitive trimmed). */
export function isEditorAdmin(editor: string): boolean {
  return sameName(editor ?? "", ADMIN_NAME);
}
