"use server";

import { revalidatePath } from "next/cache";
import { ROLES } from "@/domain/permissions";
import { orgSlug, uuid } from "@/domain/schemas";
import { z } from "zod";
import { requireOrg } from "@/server/authz";
import { addMember, changeRole, setMemberStatus, updateSettings } from "@/server/services/admin";

export type AdminState = { error?: string; ok?: string; temporaryPassword?: string; email?: string } | undefined;

export async function addUserAction(slug: string, _p: AdminState, fd: FormData): Promise<AdminState> {
  const ctx = await requireOrg(orgSlug.parse(slug));
  const r = await addMember(ctx, { email: fd.get("email"), displayName: fd.get("displayName"), role: fd.get("role") });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/o/${ctx.orgSlug}/admin/users`);
  return r.existingUser
    ? { ok: "Existing PreVid user added to this organisation." }
    : { ok: "User created. Share the temporary password securely — it is shown only once.", temporaryPassword: r.temporaryPassword, email: String(fd.get("email")) };
}

export async function changeRoleAction(slug: string, userId: string, fd: FormData) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await changeRole(ctx, uuid.parse(userId), z.enum(ROLES).parse(fd.get("role")));
  revalidatePath(`/o/${ctx.orgSlug}/admin/users`);
}

export async function setStatusAction(slug: string, userId: string, status: "active" | "suspended") {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await setMemberStatus(ctx, uuid.parse(userId), status);
  revalidatePath(`/o/${ctx.orgSlug}/admin/users`);
}

export async function updateSettingsAction(slug: string, _p: AdminState, fd: FormData): Promise<AdminState> {
  const ctx = await requireOrg(orgSlug.parse(slug));
  const r = await updateSettings(ctx, { retentionDays: fd.get("retentionDays"), maxDurationSec: fd.get("maxDurationSec"), maxFileMb: fd.get("maxFileMb") });
  return r.ok ? { ok: "Settings saved." } : { error: r.error };
}
