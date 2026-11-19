import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { can, type Permission, type Role } from "@/domain/permissions";
import { audit } from "../audit";
import { withAnon, withUser, type OrgContext } from "../db";
import { identity } from "../providers";
import { requestMeta } from "../ratelimit";

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super("Forbidden");
  }
}
export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** Authenticated + MFA-verified current user, or redirect to sign-in. Pages/actions call this. */
export const requireUser = cache(async () => {
  const s = await identity().getSession();
  if (!s) redirect("/login");
  if (!s.mfaVerified) redirect("/login/mfa");
  const [u] = await withUser(s.userId, (tx) => tx`select id, email, display_name from users where id = ${s.userId} and status = 'active'`);
  if (!u) redirect("/login"); // unknown or disabled user
  return { id: u.id as string, email: u.email as string, displayName: u.display_name as string };
});

/** API variant: never redirects; returns null when not authenticated/MFA-verified. */
export async function getUserOrNull() {
  const s = await identity().getSession();
  if (!s || !s.mfaVerified) return null;
  const [u] = await withUser(s.userId, (tx) => tx`select id from users where id = ${s.userId} and status = 'active'`);
  return u ? { id: s.userId } : null;
}

export type Membership = { orgId: string; slug: string; name: string; role: Role };

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = await withUser(
    userId,
    (tx) => tx`select o.id, o.slug, o.name, m.role from memberships m join organisations o on o.id = m.org_id
               where m.user_id = ${userId} and m.status = 'active' and o.status = 'active' order by o.name`,
  );
  return rows.map((r) => ({ orgId: r.id, slug: r.slug, name: r.name, role: r.role }));
}

/**
 * Resolve the org context for a URL slug. The slug is just a lookup key: the user's ACTIVE MEMBERSHIP is
 * what grants access. Non-members get the same 404 as a non-existent org (no existence oracle) and the
 * attempt is audited.
 */
async function resolveOrg(userId: string, slug: string): Promise<OrgContext | null> {
  const meta = await requestMeta();
  const rows = await withUser(
    userId,
    (tx) => tx`select o.id, o.slug, m.role from memberships m join organisations o on o.id = m.org_id
               where o.slug = ${slug} and m.user_id = ${userId} and m.status = 'active' and o.status = 'active'`,
  );
  const r = rows[0];
  if (!r) {
    await withAnon((tx) =>
      audit(tx, { orgId: null, actorUserId: userId, action: "authz.denied", outcome: "denied", ipHash: meta.ipHash, metadata: { reason: "not_member" } }),
    );
    return null;
  }
  return { userId, orgId: r.id, orgSlug: r.slug, role: r.role as Role, ipHash: meta.ipHash };
}

/** For pages: resolve or 404/redirect. */
export const requireOrg = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const ctx = await resolveOrg(user.id, slug);
  if (!ctx) notFound();
  return ctx;
});

/** For route handlers: returns null instead of redirecting. */
export async function getOrgContextOrNull(slug: string): Promise<OrgContext | null> {
  const user = await getUserOrNull();
  if (!user) return null;
  return resolveOrg(user.id, slug);
}

/** The single choke point for permission checks. Throws ForbiddenError (and audits the denial). */
export async function requirePermission(ctx: OrgContext, permission: Permission): Promise<void> {
  if (can(ctx.role, permission)) return;
  await withUser(ctx.userId, async (tx) => {
    await tx`select set_config('app.org_id', ${ctx.orgId}, true)`;
    await audit(tx, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "authz.denied",
      outcome: "denied",
      ipHash: ctx.ipHash,
      metadata: { permission },
    });
  });
  throw new ForbiddenError(permission);
}

/** Page-level guard: audits the denial, then renders a 404 (does not reveal that the page exists). */
export async function requirePagePermission(ctx: OrgContext, permission: Permission): Promise<void> {
  try {
    await requirePermission(ctx, permission);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}
