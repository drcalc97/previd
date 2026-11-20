import "server-only";
import type { Tx } from "./db";

/** Enumerated audit actions. Metadata must contain only IDs/codes — never names, DOBs, NHS numbers or free text. */
export type AuditAction =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.mfa_failed"
  | "auth.mfa_enrolled"
  | "auth.logout"
  | "authz.denied"
  | "patient.create"
  | "patient.view"
  | "patient.list"
  | "mdt.view"
  | "audit.view"
  | "recording.upload_rejected"
  | "patient.archive"
  | "recording.init"
  | "recording.complete"
  | "recording.play"
  | "recording.delete"
  | "recording.purge"
  | "mdt.create"
  | "mdt.patient_add"
  | "mdt.patient_remove"
  | "admin.user_add"
  | "admin.role_change"
  | "admin.user_suspend"
  | "admin.settings_change";

export type AuditInput = {
  orgId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  targetType?: "patient" | "recording" | "user" | "meeting" | "org" | "settings";
  targetId?: string | null;
  outcome?: "success" | "denied" | "error";
  ipHash?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

const SAFE_KEY = /^[a-z_]{1,32}$/;

export async function audit(tx: Tx, e: AuditInput): Promise<void> {
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e.metadata ?? {})) {
    if (!SAFE_KEY.test(k)) continue;
    meta[k] = typeof v === "string" ? v.slice(0, 64) : v; // hard cap defends against accidental free text
  }
  await tx`insert into audit_events (org_id, actor_user_id, action, target_type, target_id, outcome, ip_hash, metadata)
    values (${e.orgId}, ${e.actorUserId}, ${e.action}, ${e.targetType ?? null}, ${e.targetId ?? null},
            ${e.outcome ?? "success"}, ${e.ipHash ?? null}, ${tx.json(meta as never)})`;
}
