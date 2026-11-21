import { createServerClient } from "@supabase/ssr";
import type { AuthSession, IdentityProvider, RequestMeta, SignInResult } from "../../ports/identity";
import { checkTimers, COOKIE_ACTIVITY, COOKIE_START, signStamp } from "./session-clock";

/**
 * Supabase Auth implementation of the IdentityProvider port. Framework-independent: cookies, the user-link store and the
 * sign-in guard (rate limits / lockout) are injected, so the same code runs in Next.js and in integration tests.
 * No Supabase user objects leave this module: callers only ever see the application user id (ADR-002).
 */
export type CookieJar = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: Record<string, unknown> }[]): void;
};

export interface UserLinks {
  /** Maps a CONFIRMED Supabase identity to our application user id (linking on first sign-in by verified email), or null. */
  resolve(subject: string, email: string): Promise<string | null>;
}

export interface SignInGuard {
  /** Before checking a password. */
  check(email: string, meta: RequestMeta): Promise<"ok" | "rate_limited" | "locked">;
  recordFailure(email: string): Promise<void>;
  /** MFA attempts per user; false = blocked. */
  allowMfaAttempt(appUserId: string): Promise<boolean>;
}

export type SupabaseIdentityDeps = {
  url: string;
  publishableKey: string;
  secret: string; // signs the idle/absolute-timeout cookies
  secureCookies: boolean;
  cookies: () => Promise<CookieJar> | CookieJar;
  links: UserLinks;
  guard: SignInGuard;
  now?: () => number;
};

export function createSupabaseIdentity(deps: SupabaseIdentityDeps): IdentityProvider {
  const now = () => (deps.now ? deps.now() : Date.now());

  async function client() {
    const jar = await deps.cookies();
    const supabase = createServerClient(deps.url, deps.publishableKey, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (cookiesToSet) => {
          try {
            jar.setAll(cookiesToSet as never);
          } catch {
            /* called from a Server Component render: cookies are refreshed by the proxy instead */
          }
        },
      },
      // Server-side flow only: the browser never talks to Supabase Auth directly.
      auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    });
    return { supabase, jar };
  }

  type Resolved = { appUserId: string; subject: string } | null;

  /** Verified identity for this request (server-checked), mapped to an app user. */
  async function currentIdentity(supabase: Awaited<ReturnType<typeof client>>["supabase"], jar: CookieJar): Promise<Resolved> {
    const get = (n: string) => jar.getAll().find((c) => c.name === n)?.value;
    const timers = await checkTimers({ activity: get(COOKIE_ACTIVITY), start: get(COOKIE_START) }, deps.secret, now());
    if (timers !== "ok") return null;
    const { data, error } = await supabase.auth.getUser(); // validated by the Auth server each time (detects revoked sessions)
    const user = data?.user;
    if (error || !user || !user.email || !user.email_confirmed_at) return null; // only confirmed email addresses
    const appUserId = await deps.links.resolve(user.id, user.email);
    return appUserId ? { appUserId, subject: user.id } : null;
  }

  return {
    async signIn(email, password, meta): Promise<SignInResult> {
      const e = email.trim().toLowerCase().slice(0, 254);
      const g = await deps.guard.check(e, meta);
      if (g !== "ok") return { ok: false, reason: g };
      const { supabase, jar } = await client();
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error || !data.user || !data.user.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        await deps.guard.recordFailure(e);
        return { ok: false, reason: "invalid" };
      }
      // Must map to an application user (accounts are created only by invitation); otherwise refuse without detail.
      const appUser = await deps.links.resolve(data.user.id, data.user.email ?? e);
      if (!appUser) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        await deps.guard.recordFailure(e);
        return { ok: false, reason: "invalid" };
      }
      const stamp = await signStamp("start", now(), deps.secret);
      const opts = { httpOnly: true, secure: deps.secureCookies, sameSite: "lax" as const, path: "/" };
      jar.setAll([{ name: COOKIE_START, value: stamp, options: opts }]);
      return { ok: true };
    },

    async getSession(): Promise<AuthSession | null> {
      const { supabase, jar } = await client();
      const id = await currentIdentity(supabase, jar);
      if (!id) return null;
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!data) return null;
      return {
        userId: id.appUserId,
        mfaVerified: data.currentLevel === "aal2", // MFA only counts at assurance level 2
        mfaEnrolled: data.currentLevel === "aal2" || data.nextLevel === "aal2",
      };
    },

    async mfaBeginEnrolment() {
      const { supabase, jar } = await client();
      const id = await currentIdentity(supabase, jar);
      if (!id) return null;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp?.length) return null; // verified factor already exists (listFactors returns verified factors only)
      // Remove abandoned unverified factors so a refresh never accumulates them (the previous QR code stops working).
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `PreVid-${now()}`, issuer: "PreVid" });
      if (error || !data?.totp) return null;
      return { secret: data.totp.secret, otpauthUri: data.totp.uri };
    },

    async mfaVerify(code, meta) {
      void meta;
      const { supabase, jar } = await client();
      const id = await currentIdentity(supabase, jar);
      if (!id) return { ok: false };
      if (!(await deps.guard.allowMfaAttempt(id.appUserId))) return { ok: false, locked: true };
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.[0];
      const pending = (factors?.all ?? []).find((f) => f.factor_type === "totp" && f.status === "unverified");
      const factor = verified ?? pending;
      if (!factor) return { ok: false };
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s+/g, "") });
      if (error) return { ok: false };
      return { ok: true, enrolled: !verified };
    },

    async signOut() {
      const { supabase, jar } = await client();
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      const expired = { path: "/", maxAge: 0 };
      jar.setAll([
        { name: COOKIE_START, value: "", options: expired },
        { name: COOKIE_ACTIVITY, value: "", options: expired },
      ]);
    },

    async provisionUser() {
      // Accounts are created ONLY through the emailed-invitation flow (docs/SUPABASE_PLAN.md §3): never by an admin choosing credentials.
      throw new Error("Direct provisioning is disabled for Supabase Auth; use invitations (not yet implemented).");
    },
  };
}
