"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/server/audit";
import { withAnon, withUser } from "@/server/db";
import { identity } from "@/server/providers";
import { requestMeta } from "@/server/ratelimit";

export type FormState = { error?: string } | undefined;

const loginSchema = z.object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) });

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email address and password." };
  const meta = await requestMeta();
  const r = await identity().signIn(parsed.data.email, parsed.data.password, meta);
  if (!r.ok) {
    await withAnon((tx) => audit(tx, { orgId: null, actorUserId: null, action: "auth.login_failed", outcome: "denied", ipHash: meta.ipHash, metadata: { reason: r.reason } }));
    if (r.reason === "rate_limited") return { error: "Too many attempts. Please wait a few minutes and try again." };
    // A distinct "locked" message would confirm that the account exists (SEC-008): use the generic one.
    return { error: "Email or password is incorrect." };
  }
  redirect("/login/mfa");
}

export async function mfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = z.string().trim().min(6).max(12).safeParse(formData.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code from your authenticator app." };
  const meta = await requestMeta();
  const session = await identity().getSession();
  if (!session) redirect("/login");
  const r = await identity().mfaVerify(code.data, meta);
  if (!r.ok) {
    await withUser(session.userId, (tx) => audit(tx, { orgId: null, actorUserId: session.userId, action: "auth.mfa_failed", outcome: "denied", ipHash: meta.ipHash }));
    return { error: r.locked ? "Too many attempts. Please wait and try again." : "That code was not accepted. Check the time on your device and try again." };
  }
  await withUser(session.userId, async (tx) => {
    if (r.enrolled) await audit(tx, { orgId: null, actorUserId: session.userId, action: "auth.mfa_enrolled", ipHash: meta.ipHash });
    await audit(tx, { orgId: null, actorUserId: session.userId, action: "auth.login_success", ipHash: meta.ipHash });
  });
  redirect("/");
}

export async function logoutAction() {
  const s = await identity().getSession();
  if (s) {
    const meta = await requestMeta();
    await withUser(s.userId, (tx) => audit(tx, { orgId: null, actorUserId: s.userId, action: "auth.logout", ipHash: meta.ipHash }));
  }
  await identity().signOut();
  redirect("/login");
}
