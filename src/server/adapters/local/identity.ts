import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { config, isProd } from "../../config";
import { withAnon } from "../../db";
import { rateLimit } from "../../ratelimit";
import type { AuthSession, IdentityProvider, RequestMeta, SignInResult } from "../../ports/identity";
import { hashPassword, verifyPassword } from "./password";
import { decrypt, encrypt, generateSecret, otpauthUri, verifyTotp } from "./totp";

/**
 * DEVELOPMENT/TEST identity provider (AUTH_PROVIDER=local). Real deployments use Supabase Auth / Entra ID.
 * Implements: scrypt passwords, TOTP MFA (mandatory), lockout, rate limiting, opaque server-side sessions
 * with idle + absolute timeouts and token rotation on privilege change (MFA).
 */
const COOKIE = "pv_session";
const IDLE_MS = 30 * 60_000;
const ABSOLUTE_MS = 12 * 3600_000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// Pre-computed so unknown-email attempts cost the same as real ones (no user enumeration by timing).
const dummyHash = hashPassword("dummy-password-for-timing");

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

async function currentRow() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 128) return null;
  const rows = await withAnon(
    (tx) => tx`select s.id, s.user_id, s.created_at, s.last_seen_at, s.mfa_verified_at, s.expires_at,
                      c.totp_enrolled_at
               from local_auth.sessions s
               left join local_auth.credentials c on c.user_id = s.user_id
               where s.token_hash = ${sha(token)} and s.revoked_at is null and s.expires_at > now()`,
  );
  const r = rows[0];
  if (!r) return null; // (user status is enforced in requireUser/getUserOrNull: `users` is RLS-protected)
  if (Date.now() - new Date(r.last_seen_at).getTime() > IDLE_MS) return null;
  return { ...r, token } as typeof r & { token: string };
}

export const localIdentity: IdentityProvider = {
  async signIn(email, password, meta: RequestMeta): Promise<SignInResult> {
    const e = email.trim().toLowerCase().slice(0, 254);
    const okIp = !meta.ipHash || (await rateLimit(`login:ip:${meta.ipHash}`, 600, 30));
    const okEmail = await rateLimit(`login:email:${sha(e)}`, 900, 10);
    if (!okIp || !okEmail) return { ok: false, reason: "rate_limited" };

    const [cred] = await withAnon(
      (tx) => tx`select c.user_id, c.password_hash, c.failed_attempts, c.locked_until
                 from local_auth.credentials c where c.email = ${e}`,
    );
    if (!cred) {
      await verifyPassword(password, await dummyHash);
      return { ok: false, reason: "invalid" };
    }
    if (cred.locked_until && new Date(cred.locked_until) > new Date()) {
      await verifyPassword(password, await dummyHash);
      return { ok: false, reason: "locked" };
    }
    const good = await verifyPassword(password, cred.password_hash);
    if (!good) {
      await withAnon(
        (tx) => tx`update local_auth.credentials set
                     failed_attempts = case when failed_attempts + 1 >= ${MAX_FAILS} then 0 else failed_attempts + 1 end,
                     locked_until = case when failed_attempts + 1 >= ${MAX_FAILS} then now() + ${LOCK_MS / 1000} * interval '1 second' else locked_until end
                   where user_id = ${cred.user_id}`,
      );
      return { ok: false, reason: "invalid" };
    }
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + ABSOLUTE_MS);
    await withAnon(async (tx) => {
      await tx`update local_auth.credentials set failed_attempts = 0, locked_until = null where user_id = ${cred.user_id}`;
      await tx`insert into local_auth.sessions(token_hash, user_id, expires_at) values (${sha(token)}, ${cred.user_id}, ${expires})`;
    });
    await setCookie(token, expires);
    return { ok: true };
  },

  async getSession(): Promise<AuthSession | null> {
    const r = await currentRow();
    if (!r) return null;
    if (Date.now() - new Date(r.last_seen_at).getTime() > 60_000) {
      await withAnon((tx) => tx`update local_auth.sessions set last_seen_at = now() where id = ${r.id}`);
    }
    return { userId: r.user_id, mfaVerified: r.mfa_verified_at !== null, mfaEnrolled: r.totp_enrolled_at !== null };
  },

  async mfaBeginEnrolment() {
    const r = await currentRow();
    if (!r || r.totp_enrolled_at) return null;
    const [existing] = await withAnon((tx) => tx`select email, totp_secret_enc from local_auth.credentials where user_id = ${r.user_id}`);
    // Reuse a pending (not yet confirmed) secret so a page refresh never invalidates the QR code being scanned.
    if (existing.totp_secret_enc) {
      const secret = decrypt(existing.totp_secret_enc, config().AUTH_ENC_KEY!);
      return { secret, otpauthUri: otpauthUri(secret, existing.email) };
    }
    const secret = generateSecret();
    await withAnon(
      (tx) => tx`update local_auth.credentials set totp_secret_enc = ${encrypt(secret, config().AUTH_ENC_KEY!)}, last_totp_step = null
                 where user_id = ${r.user_id} and totp_enrolled_at is null and totp_secret_enc is null`,
    );
    return { secret, otpauthUri: otpauthUri(secret, existing.email) };
  },

  async mfaVerify(code, meta) {
    const r = await currentRow();
    if (!r) return { ok: false };
    if (!(await rateLimit(`mfa:user:${r.user_id}`, 300, 10))) return { ok: false, locked: true };
    const [c] = await withAnon(
      (tx) => tx`select totp_secret_enc, last_totp_step, locked_until, totp_enrolled_at
                 from local_auth.credentials where user_id = ${r.user_id}`,
    );
    if (!c?.totp_secret_enc) return { ok: false };
    if (c.locked_until && new Date(c.locked_until) > new Date()) return { ok: false, locked: true };
    const step = verifyTotp(
      decrypt(c.totp_secret_enc, config().AUTH_ENC_KEY!),
      code.replace(/\s+/g, ""),
      c.last_totp_step === null ? null : Number(c.last_totp_step),
    );
    if (step === null) {
      await withAnon(
        (tx) => tx`update local_auth.credentials set
                     failed_attempts = case when failed_attempts + 1 >= ${MAX_FAILS} then 0 else failed_attempts + 1 end,
                     locked_until = case when failed_attempts + 1 >= ${MAX_FAILS} then now() + ${LOCK_MS / 1000} * interval '1 second' else locked_until end
                   where user_id = ${r.user_id}`,
      );
      return { ok: false };
    }
    // Success: rotate the session token (defends against session fixation) and mark MFA verified.
    const newToken = randomBytes(32).toString("base64url");
    await withAnon(async (tx) => {
      await tx`update local_auth.credentials set last_totp_step = ${step}, failed_attempts = 0,
                 totp_enrolled_at = coalesce(totp_enrolled_at, now()) where user_id = ${r.user_id}`;
      await tx`update local_auth.sessions set token_hash = ${sha(newToken)}, mfa_verified_at = now(), last_seen_at = now()
               where id = ${r.id}`;
    });
    await setCookie(newToken, new Date(r.expires_at));
    void meta;
    return { ok: true, enrolled: !c.totp_enrolled_at };
  },

  async signOut() {
    const token = (await cookies()).get(COOKIE)?.value;
    if (token) {
      await withAnon((tx) => tx`update local_auth.sessions set revoked_at = now() where token_hash = ${sha(token)}`);
    }
    (await cookies()).delete(COOKIE);
  },

  async provisionUser(userId, email) {
    const temporaryPassword = randomBytes(12).toString("base64url") + "!9a";
    await withAnon(async (tx) => {
      await tx`insert into local_auth.credentials(user_id, email, password_hash) values (${userId}, ${email}, ${await hashPassword(temporaryPassword)})`;
    });
    return { subject: userId, temporaryPassword };
  },
};

export const newUserId = () => randomUUID();
