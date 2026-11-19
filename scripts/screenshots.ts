/**
 * Captures UI screenshots of the running dev app (default http://localhost:3200) using the seeded synthetic data
 * and a fake camera. Usage: npx tsx --env-file=.env.local scripts/screenshots.ts
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import postgres from "postgres";
import { decrypt, hotp, totpStep } from "../src/server/adapters/local/totp";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3200";
const OUT = "docs/screenshots";
const admin = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1, onnotice: () => {} });

async function login(page: Page, email: string) {
  await admin`delete from rate_limits`;
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("PreVid-demo-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/login\/mfa/);
  await page.getByLabel("6-digit code").waitFor();
  const [c] = await admin`select totp_secret_enc from local_auth.credentials where email = ${email}`;
  await admin`update local_auth.credentials set last_totp_step = null where email = ${email}`;
  await page.getByLabel("6-digit code").fill(hotp(decrypt(c.totp_secret_enc, process.env.AUTH_ENC_KEY!), totpStep()));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function main() {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-sandbox"] });
  const mk = (mobile: boolean): Promise<BrowserContext> =>
    browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["camera", "microphone"] }
      : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, permissions: ["camera", "microphone"] });

  // Public pages
  let ctx = await mk(false);
  let page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.screenshot({ path: `${OUT}/01-login.png` });

  // Clinician: patients, record flow on mobile, timeline, playback
  await login(page, "clinician@northfield.demo");
  await page.goto(`${BASE}/o/northfield`);
  await page.screenshot({ path: `${OUT}/02-home.png` });
  await page.goto(`${BASE}/o/northfield/patients`);
  await page.screenshot({ path: `${OUT}/03-patients.png` });
  const firstPatient = await page.getByRole("link", { name: /^[A-Z]+, / }).first().getAttribute("href");

  const m = await mk(true);
  const mp = await m.newPage();
  await login(mp, "clinician@northfield.demo");
  await mp.goto(`${BASE}${firstPatient}/record`);
  await mp.screenshot({ path: `${OUT}/04-record-verify-mobile.png` });
  for (const c of await mp.getByRole("checkbox").all()) await c.check();
  await mp.getByRole("button", { name: "Continue to camera" }).click();
  await mp.getByRole("button", { name: "Start recording" }).waitFor();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}/05-record-camera-mobile.png` });
  await mp.getByRole("button", { name: "Start recording" }).click();
  await mp.waitForTimeout(3500);
  await mp.screenshot({ path: `${OUT}/06-recording-mobile.png` });
  await mp.getByRole("button", { name: "Stop recording" }).click();
  await mp.getByTestId("review-video").waitFor();
  await mp.screenshot({ path: `${OUT}/07-review-mobile.png` });
  await mp.getByRole("button", { name: "Confirm and upload" }).click();
  await mp.getByRole("heading", { name: "Recording saved" }).waitFor({ timeout: 30000 });
  await mp.screenshot({ path: `${OUT}/08-saved-mobile.png` });
  await m.close();
  { const pid = firstPatient!.split("/").pop()!;
    await admin`insert into mdt_meeting_patients(org_id, meeting_id, patient_id, position)
      select m.org_id, m.id, ${pid}, 99 from mdt_meetings m join organisations o on o.id = m.org_id where o.slug = 'northfield' limit 1 on conflict do nothing`; }

  await page.goto(`${BASE}${firstPatient}`);
  await page.screenshot({ path: `${OUT}/09-patient-timeline.png` });
  await page.getByRole("link", { name: /^Watch/ }).first().click();
  await page.getByTestId("player").waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/10-playback.png` });
  await ctx.close();

  // Reviewer: MDT viewer
  ctx = await mk(false);
  page = await ctx.newPage();
  await login(page, "reviewer@northfield.demo");
  await page.goto(`${BASE}/o/northfield/mdt`);
  await page.screenshot({ path: `${OUT}/11-mdt-list.png` });
  await page.getByRole("link", { name: /Pre-op MDT/ }).click();
  // open a patient that has a recording (needs the clinician's recording to be on the MDT list; add it if missing)
  const withVideo = page.getByRole("navigation", { name: "Patients in this meeting" }).getByRole("link", { name: /Latest video/ });
  if (await withVideo.count()) await withVideo.first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/12-mdt-viewer.png` });
  await ctx.close();

  // Admin
  ctx = await mk(false);
  page = await ctx.newPage();
  await login(page, "admin@northfield.demo");
  await page.goto(`${BASE}/o/northfield/admin/users`);
  await page.screenshot({ path: `${OUT}/13-admin-users.png`, fullPage: true });
  await page.goto(`${BASE}/o/northfield/admin/audit`);
  await page.screenshot({ path: `${OUT}/14-audit-log.png` });
  await ctx.close();
  await browser.close();
  await admin.end();
}
void main();
