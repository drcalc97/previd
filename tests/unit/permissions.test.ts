import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can } from "@/domain/permissions";

describe("permission matrix", () => {
  it("MDT reviewers are strictly read-only", () => {
    for (const p of PERMISSIONS) {
      expect(can("mdt_reviewer", p), p).toBe(["patient:read", "recording:read", "mdt:read"].includes(p));
    }
  });
  it("clinicians can record and manage patients but not administer", () => {
    expect(can("clinician", "recording:create")).toBe(true);
    expect(can("clinician", "patient:write")).toBe(true);
    expect(can("clinician", "recording:delete_own")).toBe(true);
    for (const p of ["admin:users", "admin:settings", "admin:audit", "recording:delete_any"] as const) expect(can("clinician", p), p).toBe(false);
  });
  it("org admins hold every permission, including viewing video (owner decision)", () => {
    for (const p of PERMISSIONS) expect(can("org_admin", p), p).toBe(true);
  });
  it("every role is known", () => {
    expect(ROLES).toEqual(["org_admin", "clinician", "mdt_reviewer"]);
  });
});
