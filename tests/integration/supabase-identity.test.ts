/**
 * Integration tests of the Supabase identity adapter against a REAL Supabase Auth service (dev project, synthetic user).
 * Skipped unless SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are set.
 * The user-link store and sign-in guard are in-memory fakes (the database is not reachable from the sandbox).
 * Run: NODE_USE_ENV_PROXY=1 SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_TEST_EMAIL=… SUPABASE_TEST_PASSWORD=… npx vitest run tests/integration
 */
import { describe, expect, it } from "vitest";
import { createSupabaseIdentity, type CookieJar, type SignInGuard, type UserLinks } from "../../src/server/adapters/supabase/identity-core";
import { checkTimers, COOKIE_ACTIVITY, COOKIE_START, signStamp } from "../../src/server/adapters/supabase/session-clock";
import { hotp, totpStep } from "../../src/server/adapters/local/totp";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SUPABASE_TEST_EMAIL, password = process.env.SUPABASE_TEST_PASSWORD;
const enabled = !!(url && key && email && password);
const secret = "integration-test-signing-secret-0000";
const APP_USER = "11111111-1111-4111-8111-111111111111";

function makeJar() {
  const store = new Map<string, string>();
  const jar: CookieJar = {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value, options }) => ((options as { maxAge?: number }).maxAge === 0 || value === "" ? store.delete(name) : store.set(name, value))),
  };
  return { jar, store };
}

function make(opts: { links?: UserLinks; guard?: Partial<SignInGuard>; jar?: ReturnType<typeof makeJar>; now?: () => number } = {}) {
  const j = opts.jar ?? makeJar();
  const failures: string[] = [];
  const guard: SignInGuard = {
    check: async () => "ok",
    recordFailure: async (e) => { failures.push(e); },
    allowMfaAttempt: async () => true,
    ...opts.guard,
  };
  const links: UserLinks = opts.links ?? { resolve: async (_s, e) => (e === email ? APP_USER : null) };
  const idp = createSupabaseIdentity({ url: url!, publishableKey: key!, secret, secureCookies: false, cookies: () => j.jar, links, guard, now: opts.now });
  return { idp, ...j, failures };
}
const meta = { ipHash: "test" };

describe.skipIf(!enabled)("Supabase identity adapter (real Auth service)", () => {
  it("rejects a wrong password and records the failure", async () => {
    const t = make();
    expect(await t.idp.signIn(email!, "definitely-wrong-password", meta)).toEqual({ ok: false, reason: "invalid" });
    expect(t.failures).toHaveLength(1);
    expect(await t.idp.getSession()).toBeNull();
  });

  it("refuses a confirmed Supabase user that has no application account", async () => {
    const t = make({ links: { resolve: async () => null } });
    expect(await t.idp.signIn(email!, password!, meta)).toEqual({ ok: false, reason: "invalid" });
    expect(await t.idp.getSession()).toBeNull();
  });

  it("honours the guard (rate limit / lockout) without contacting Supabase", async () => {
    const t = make({ guard: { check: async () => "locked" } });
    expect(await t.idp.signIn(email!, password!, meta)).toEqual({ ok: false, reason: "locked" });
    expect(t.store.size).toBe(0);
  });

  it("never offers a password-only session as MFA-verified; enrols TOTP; enforces AAL2; supports re-login; signs out", { timeout: 60_000 }, async () => {
    const t = make();
    expect(await t.idp.signIn(email!, password!, meta)).toEqual({ ok: true });
    let s = await t.idp.getSession();
    expect(s).toEqual({ userId: APP_USER, mfaVerified: false, mfaEnrolled: false }); // AAL1 only

    const enrol = await t.idp.mfaBeginEnrolment();
    expect(enrol?.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrol?.otpauthUri).toContain("otpauth://totp/");

    expect((await t.idp.mfaVerify("000000", meta)).ok).toBe(false);
    expect((await t.idp.getSession())?.mfaVerified).toBe(false); // wrong code does not upgrade the session

    const step = totpStep();
    const ok = await t.idp.mfaVerify(hotp(enrol!.secret, step), meta);
    expect(ok).toMatchObject({ ok: true, enrolled: true });
    s = await t.idp.getSession();
    expect(s).toEqual({ userId: APP_USER, mfaVerified: true, mfaEnrolled: true }); // AAL2

    // A second browser: password then MFA again; no new enrolment is offered.
    const t2 = make();
    expect(await t2.idp.signIn(email!, password!, meta)).toEqual({ ok: true });
    expect(await t2.idp.getSession()).toEqual({ userId: APP_USER, mfaVerified: false, mfaEnrolled: true });
    expect(await t2.idp.mfaBeginEnrolment()).toBeNull();
    const again = await t2.idp.mfaVerify(hotp(enrol!.secret, step - 1), meta);
    expect(again.ok).toBe(true);
    expect((await t2.idp.getSession())?.mfaVerified).toBe(true);

    // A guard that blocks MFA attempts stops verification.
    const blocked = make({ guard: { allowMfaAttempt: async () => false } });
    await blocked.idp.signIn(email!, password!, meta);
    expect(await blocked.idp.mfaVerify("123456", meta)).toEqual({ ok: false, locked: true });

    // Sign-out: this browser has no session any more; a copy of the old cookies is revoked server-side too.
    const stolen = new Map(t.store);
    await t.idp.signOut();
    expect(await t.idp.getSession()).toBeNull();
    const replay = makeJar();
    stolen.forEach((v, k) => replay.store.set(k, v));
    const r = make({ jar: replay });
    expect(await r.idp.getSession()).toBeNull();
  });

  it("ends sessions after 30 minutes idle and after 12 hours absolute, and ignores forged timer cookies", { timeout: 60_000 }, async () => {
    let clock = Date.now();
    const t = make({ now: () => clock });
    expect(await t.idp.signIn(email!, password!, meta)).toEqual({ ok: true });
    expect(await t.idp.getSession()).not.toBeNull();
    clock += 31 * 60_000; // idle > 30 min, no activity stamp refresh
    expect(await t.idp.getSession()).toBeNull();

    clock = Date.now();
    const t2 = make({ now: () => clock });
    await t2.idp.signIn(email!, password!, meta);
    t2.store.set(COOKIE_ACTIVITY, await signStamp("act", clock, secret));
    clock += 29 * 60_000;
    t2.store.set(COOKIE_ACTIVITY, await signStamp("act", clock, secret)); // proxy refreshed activity
    expect(await t2.idp.getSession()).not.toBeNull();
    clock += 12 * 3600_000; // absolute limit
    t2.store.set(COOKIE_ACTIVITY, await signStamp("act", clock, secret));
    expect(await t2.idp.getSession()).toBeNull();

    const t3 = make();
    await t3.idp.signIn(email!, password!, meta);
    t3.store.set(COOKIE_START, "9999999999999.forged-signature"); // forged start stamp fails closed
    expect(await t3.idp.getSession()).toBeNull();
    t3.store.delete(COOKIE_START); // missing start stamp fails closed
    expect(await t3.idp.getSession()).toBeNull();
  });

  it("does not allow direct provisioning (accounts only via invitation)", async () => {
    await expect(make().idp.provisionUser("x", "y@example.test")).rejects.toThrow(/invitation/i);
  });
});

describe("session timers (no network)", () => {
  it("accepts fresh sessions, rejects idle/absolute/forged/missing stamps", async () => {
    const now = 1_700_000_000_000;
    const start = await signStamp("start", now, secret), act = await signStamp("act", now, secret);
    expect(await checkTimers({ start, activity: act }, secret, now + 60_000)).toBe("ok");
    expect(await checkTimers({ start, activity: undefined }, secret, now + 60_000)).toBe("ok"); // just signed in
    expect(await checkTimers({ start, activity: act }, secret, now + 31 * 60_000)).toBe("idle");
    expect(await checkTimers({ start, activity: await signStamp("act", now + 11 * 3600_000, secret) }, secret, now + 12 * 3600_000 + 1)).toBe("absolute");
    expect(await checkTimers({ start: "123.bad", activity: act }, secret, now)).toBe("missing");
    expect(await checkTimers({ start: undefined, activity: act }, secret, now)).toBe("missing");
    expect(await checkTimers({ start: await signStamp("start", now, "other-secret"), activity: act }, secret, now)).toBe("missing");
    expect(await checkTimers({ start, activity: await signStamp("start", now, secret) }, secret, now + 31 * 60_000)).toBe("idle"); // wrong-kind activity stamp ignored
  });
});
