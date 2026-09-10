// client-safe: no node imports, no server-only
export const ADMIN_NAME = "Dr. Suseender Durairaj";
export const ADMIN_ROLE = "Admin";

/** case-insensitive trimmed compare */
export function sameName(a: string, b: string): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** true when role is Admin (case-insensitive trimmed) */
export function isAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toLowerCase() === ADMIN_ROLE.toLowerCase();
}
