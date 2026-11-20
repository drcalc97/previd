import "server-only";
import { randomUUID } from "node:crypto";
import { addUserInput, settingsInput } from "@/domain/schemas";
import type { Role } from "@/domain/permissions";
import { audit, type AuditAction } from "../audit";
import { requirePermission, NotFoundError } from "../authz";
import { withOrg, type OrgContext } from "../db";
import { identity } from "../providers";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export type Member = { userId: string; email: string; displayName: string; role: Role; status: "active" | "suspended" };

export async function listMembers(ctx: OrgContext): Promise<Member[]> {
  await requirePermission(ctx, "admin:users");
  const rows = await withOrg(
    ctx,
    (tx) => tx`select u.id, u.email, u.display_name, m.role, m.status from memberships m join users u on u.id = m.user_id
               where m.org_id = ${ctx.orgId} order by u.display_name`,
  );
  return rows.map((r: Row) => ({ userId: r.id, email: r.email, displayName: r.display_name, role: r.role, status: r.status }));
}

export type AddUserResult = { ok: true; temporaryPassword?: string; existingUser: boolean } | { ok: false; error: string };

export async function addMember(ctx: OrgContext, raw: unknown): Promise<AddUserResult> {
  await requirePermission(ctx, "admin:users");
  const parsed = addUserInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the name, email address and role." };
  const v = parsed.data;

  const step1 = await withOrg(ctx, async (tx) => {
    const [found] = await tx`select app_find_user_id_by_email(${v.email}) as id`;
    let userId = found.id as string | null;
    const isNew = !userId;
    if (userId) {
      const [m] = await tx`select 1 as x from memberships where org_id = ${ctx.orgId} and user_id = ${userId}`;
      if (m) return { error: "That person is already a member of this organisation." } as const;
    } else {
      userId = randomUUID();
      // Plain INSERT inside a savepoint (ON CONFLICT would apply the SELECT policy to a row the admin cannot yet read).
      let exists = false;
      try {
        await tx.savepoint((sp) => sp`insert into users(id, email, display_name) values (${userId}, ${v.email}, ${v.displayName})`);
      } catch (e) {
        if ((e as { code?: string }).code !== "23505") throw e;
        exists = true; // address already registered
      }
      if (exists) return { error: "That email address cannot be added directly. Ask the person to be invited through the verified sign-up process." } as const;
    }
    await tx`insert into memberships(org_id, user_id, role) values (${ctx.orgId}, ${userId}, ${v.role})`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "admin.user_add", targetType: "user", targetId: userId, ipHash: ctx.ipHash, metadata: { role: v.role, new_user: isNew } });
    return { userId: userId!, isNew } as const;
  });
  if ("error" in step1 && step1.error) return { ok: false, error: step1.error };
  if (!step1.isNew) return { ok: true, existingUser: true };

  try {
    const p = await identity().provisionUser(step1.userId, v.email);
    return { ok: true, temporaryPassword: p.temporaryPassword, existingUser: false };
  } catch {
    // Compensate: do not leave an active membership for a person who cannot sign in.
    await withOrg(ctx, (tx) => tx`update memberships set status = 'suspended' where org_id = ${ctx.orgId} and user_id = ${step1.userId}`);
    return { ok: false, error: "Could not create the sign-in for this user. Nothing was granted; please retry." };
  }
}

async function activeAdminCount(tx: Parameters<Parameters<typeof withOrg>[1]>[0], orgId: string) {
  // Lock the admin rows so concurrent demotions/suspensions serialise (SEC-009).
  const rows = await tx`select user_id from memberships where org_id = ${orgId} and role = 'org_admin' and status = 'active' for update`;
  return rows.length;
}

export async function changeRole(ctx: OrgContext, userId: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  await requirePermission(ctx, "admin:users");
  return withOrg(ctx, async (tx) => {
    const [m] = await tx`select role, status from memberships where org_id = ${ctx.orgId} and user_id = ${userId}`;
    if (!m) throw new NotFoundError();
    if (m.role === "org_admin" && role !== "org_admin" && m.status === "active" && (await activeAdminCount(tx, ctx.orgId)) <= 1) {
      return { ok: false, error: "An organisation must keep at least one active administrator." };
    }
    await tx`update memberships set role = ${role} where org_id = ${ctx.orgId} and user_id = ${userId}`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "admin.role_change", targetType: "user", targetId: userId, ipHash: ctx.ipHash, metadata: { role } });
    return { ok: true };
  });
}

export async function setMemberStatus(ctx: OrgContext, userId: string, status: "active" | "suspended"): Promise<{ ok: boolean; error?: string }> {
  await requirePermission(ctx, "admin:users");
  return withOrg(ctx, async (tx) => {
    const [m] = await tx`select role, status from memberships where org_id = ${ctx.orgId} and user_id = ${userId}`;
    if (!m) throw new NotFoundError();
    if (status === "suspended" && m.role === "org_admin" && m.status === "active" && (await activeAdminCount(tx, ctx.orgId)) <= 1) {
      return { ok: false, error: "An organisation must keep at least one active administrator." };
    }
    await tx`update memberships set status = ${status} where org_id = ${ctx.orgId} and user_id = ${userId}`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "admin.user_suspend", targetType: "user", targetId: userId, ipHash: ctx.ipHash, metadata: { status } });
    return { ok: true };
  });
}

export async function updateSettings(ctx: OrgContext, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  await requirePermission(ctx, "admin:settings");
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the values entered." };
  const v = parsed.data;
  await withOrg(ctx, async (tx) => {
    await tx`update org_settings set retention_days = ${v.retentionDays}, max_duration_sec = ${v.maxDurationSec},
               max_file_bytes = ${v.maxFileMb * 1024 * 1024}, updated_at = now(), updated_by = ${ctx.userId} where org_id = ${ctx.orgId}`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "admin.settings_change", targetType: "settings", ipHash: ctx.ipHash,
      metadata: { retention_days: v.retentionDays, max_duration_sec: v.maxDurationSec, max_file_mb: v.maxFileMb } });
  });
  return { ok: true };
}

export type AuditRow = { id: string; occurredAt: string; actor: string | null; action: AuditAction | string; outcome: string; targetType: string | null; targetId: string | null; metadata: Record<string, unknown> };

export async function listAudit(ctx: OrgContext, opts: { action?: string; limit?: number } = {}): Promise<AuditRow[]> {
  await requirePermission(ctx, "admin:audit");
  const limit = Math.min(opts.limit ?? 100, 500);
  const rows = await withOrg(ctx, async (tx) => {
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "audit.view", ipHash: ctx.ipHash });
    return tx`select a.id, a.occurred_at, u.display_name, a.action, a.outcome, a.target_type, a.target_id, a.metadata
               from audit_events a left join users u on u.id = a.actor_user_id
               where a.org_id = ${ctx.orgId} and (${!opts.action} or a.action = ${opts.action ?? ""})
               order by a.id desc limit ${limit}`;
  });
  return rows.map((r: Row) => ({
    id: String(r.id), occurredAt: iso(r.occurred_at)!, actor: r.display_name, action: r.action, outcome: r.outcome,
    targetType: r.target_type, targetId: r.target_id, metadata: r.metadata ?? {},
  }));
}
