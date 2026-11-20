import { readFileSync } from "node:fs";
import postgres from "postgres";
import { expect, type Page } from "@playwright/test";
import { decrypt, hotp, totpStep } from "../../src/server/adapters/local/totp";

const envFile: Record<string, string> = {};
for (const l of readFileSync(".env.test", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) envFile[m[1]] = m[2];
}
export const DEMO_PASSWORD = "PreVid-demo-2026!";
export const admin = () => postgres(envFile.DATABASE_ADMIN_URL, { max: 1, onnotice: () => {} });

/** Sign in with password + TOTP (reads the pending/enrolled secret from the test DB; test-only). */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  { // the suite signs in far more often than a human would; clear throttling counters (the limiter itself is tested in auth.spec)
    const s = admin();
    await s`delete from rate_limits`;
    await s.end();
  }
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/mfa/);
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const sql = admin();
  try {
    const [c] = await sql`select totp_secret_enc from local_auth.credentials where email = ${email}`;
    const secret = decrypt(c.totp_secret_enc, envFile.AUTH_ENC_KEY);
    await sql`update local_auth.credentials set last_totp_step = null where email = ${email}`; // allow repeated logins in one 30s step
    await page.getByLabel("6-digit code").fill(hotp(secret, totpStep()));
  } finally {
    await sql.end();
  }
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function ids() {
  const sql = admin();
  try {
    const orgs = await sql`select id, slug from organisations`;
    const pats = await sql`select p.id, p.org_id, o.slug, p.family_name, p.given_name from patients p join organisations o on o.id = p.org_id where p.archived_at is null and p.synthetic_ref like 'SYN-%' order by p.synthetic_ref`;
    return { orgs, pats };
  } finally {
    await sql.end();
  }
}

// A minimal but valid WebM (EBML header) payload for upload/sniffing tests.
export function fakeWebm(size = 4096): Buffer {
  const b = Buffer.alloc(size, 7);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b, 0);
  return b;
}

/** App alerts (excludes Next.js's hidden route announcer, which also has role=alert). */
export const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Create an 'available' recording through the real API flow (init -> signed upload -> complete). Returns its id. */
export async function createRecordingViaApi(page: Page, org: string, patientId: string): Promise<string> {
  const video = readFileSync("tests/fixtures/sample.webm"); // a real, playable 2 s WebM
  const json = { "Content-Type": "application/json", Origin: "http://localhost:3100" };
  const init = await page.request.post(`/api/o/${org}/recordings`, {
    data: { patientId, idempotencyKey: `seed-${Date.now()}-${Math.random().toString(36).slice(2)}-xxxx`, consentConfirmed: true, identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: video.length, durationSec: 2 },
    headers: json,
  });
  expect(init.status()).toBe(200);
  const { recordingId, target } = await init.json();
  expect((await page.request.put(target.url, { data: video, headers: target.headers })).status()).toBe(200);
  expect((await page.request.post(`/api/o/${org}/recordings/${recordingId}/complete`, { data: {}, headers: json })).status()).toBe(200);
  return recordingId;
}
