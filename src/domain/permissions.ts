/** Roles and permissions. Single source of truth; enforced server-side (and again by DB RLS). */
export const ROLES = ["org_admin", "clinician", "mdt_reviewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "patient:read",
  "patient:write",
  "recording:create",
  "recording:read",
  "recording:delete_own",
  "recording:delete_any",
  "mdt:read",
  "mdt:write",
  "admin:users",
  "admin:settings",
  "admin:audit",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = ["patient:read", "recording:read", "mdt:read"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  mdt_reviewer: new Set(READ),
  clinician: new Set<Permission>([...READ, "patient:write", "recording:create", "recording:delete_own", "mdt:write"]),
  org_admin: new Set<Permission>(PERMISSIONS), // admins may also view video (owner decision, ADR-014)
};

export const ROLE_LABELS: Record<Role, string> = {
  org_admin: "Organisation administrator",
  clinician: "Clinician",
  mdt_reviewer: "MDT reviewer (read-only)",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
