/**
 * Identity provider port. Core code never sees provider-specific user objects:
 * a provider returns a stable APP user id (users.id) and MFA state only.
 * Adapters: local (dev/test), supabase (MVP hosting), entra (future).
 */
export type AuthSession = {
  userId: string; // users.id (application-level, provider independent)
  mfaVerified: boolean;
  mfaEnrolled: boolean;
};

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "locked" | "rate_limited" };

export type RequestMeta = { ipHash: string | null };

export interface IdentityProvider {
  /** Verify email+password; on success establish a (pre-MFA) session cookie. Never reveals which factor failed. */
  signIn(email: string, password: string, meta: RequestMeta): Promise<SignInResult>;
  /** Current session from the request cookies, or null. Enforces expiry/idle timeout. */
  getSession(): Promise<AuthSession | null>;
  /** Start TOTP enrolment for the current session. Refuses if already enrolled. */
  mfaBeginEnrolment(): Promise<{ secret: string; otpauthUri: string } | null>;
  /** Verify a TOTP code (login or enrolment). On success the session becomes MFA-verified (token rotated). */
  mfaVerify(code: string, meta: RequestMeta): Promise<{ ok: boolean; locked?: boolean; enrolled?: boolean }>;
  signOut(): Promise<void>;
  /** Admin adds a person: create credentials. Returns the provider subject and, if applicable, a one-time password. */
  provisionUser(userId: string, email: string): Promise<{ subject: string; temporaryPassword?: string }>;
}
