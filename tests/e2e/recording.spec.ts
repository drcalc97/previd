import { expect, test, type Page } from "@playwright/test";
import { admin, alerts, ids, login } from "./helpers";

async function openRecorder(page: Page, family?: string) {
  const { pats } = await ids();
  const p = pats.find((x) => x.slug === "northfield" && (!family || x.family_name === family)) ?? pats.find((x) => x.slug === "northfield")!;
  await login(page, "clinician@northfield.demo");
  await page.goto(`/o/northfield/patients/${p.id}`);
  await expect(page.getByTestId("patient-banner")).toBeVisible();
  await page.getByRole("link", { name: "Record new video" }).click();
  await expect(page.getByRole("heading", { name: /Confirm consent and identity/ })).toBeVisible();
  return p;
}

async function verifyAndRecord(page: Page, seconds = 2) {
  const cont = page.getByRole("button", { name: "Continue to camera" });
  await expect(cont).toBeDisabled(); // cannot proceed without identity checks
  for (const c of await page.getByRole("checkbox").all()) await c.check();
  await cont.click();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("rec-timer")).toBeVisible();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByTestId("review-video")).toBeVisible();
}

const count = async (patientId: string) => {
  const sql = admin();
  try {
    const [r] = await sql`select count(*)::int as n from recordings where patient_id = ${patientId} and status = 'available'`;
    return r.n as number;
  } finally {
    await sql.end();
  }
};

test.describe("recording workflow", () => {
  test("record, review, upload, see in timeline, play back @mobile", async ({ page }) => {
    const p = await openRecorder(page);
    const before = await count(p.id);
    await verifyAndRecord(page);
    await page.getByRole("button", { name: "Confirm and upload" }).click();
    await expect(page.getByRole("heading", { name: "Recording saved" })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("back-to-patient").click();
    await expect(page.getByRole("heading", { name: "Recording timeline" })).toBeVisible();
    expect(await count(p.id)).toBe(before + 1);
    await page.getByRole("link", { name: /^Watch/ }).first().click();
    await expect(page.getByTestId("recording-date")).toContainText("Recorded");
    const player = page.getByTestId("player");
    await expect(player).toBeVisible();
    const src = await player.getAttribute("src");
    expect(src).toMatch(/^\/api\/storage\/play\?t=/); // short-lived signed URL, never a durable one
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);
    // The signed URL itself works...
    const ok = await page.request.get(src!);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("no-store");
    // ...and a tampered one does not.
    expect((await page.request.get(src!.slice(0, -3) + "AAA")).status()).toBe(403);
  });

  test("interrupted upload keeps the recording, offers retry, and creates exactly one record", async ({ page }) => {
    const p = await openRecorder(page, undefined);
    const before = await count(p.id);
    await verifyAndRecord(page);
    let aborted = false;
    await page.route("**/api/storage/upload*", async (route) => {
      if (!aborted) { aborted = true; await route.abort("connectionreset"); } else await route.continue();
    });
    await page.getByRole("button", { name: "Confirm and upload" }).click();
    await expect(alerts(page)).toContainText("interrupted");
    await expect(page.getByTestId("review-video")).toBeVisible(); // recording still held locally
    await page.getByRole("button", { name: "Retry upload" }).click();
    await expect(page.getByRole("heading", { name: "Recording saved" })).toBeVisible({ timeout: 30_000 });
    expect(await count(p.id)).toBe(before + 1);
  });

  test("double-clicking confirm does not create duplicates", async ({ page }) => {
    const p = await openRecorder(page);
    const before = await count(p.id);
    await verifyAndRecord(page);
    await page.getByRole("button", { name: "Confirm and upload" }).dblclick();
    await expect(page.getByRole("heading", { name: "Recording saved" })).toBeVisible({ timeout: 30_000 });
    expect(await count(p.id)).toBe(before + 1);
  });

  test("retake discards the first take", async ({ page }) => {
    await openRecorder(page);
    await verifyAndRecord(page, 1);
    await page.getByRole("button", { name: "Retake" }).click();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
  });
});

test.describe("new patient: consent is confirmed as part of the recording (ADR-017)", () => {
  const sqlOne = async <T,>(f: (sql: ReturnType<typeof admin>) => Promise<T>) => { const s = admin(); try { return await f(s); } finally { await s.end(); } };

  async function fillDetails(page: Page, ref: string, over: Partial<Record<string, string>> = {}) {
    const d = { ref, given: "Nova", family: "Consentest", dob: "1962-03-04", nhs: "999 123 4567", ...over };
    await page.getByLabel("Reference").fill(d.ref);
    await page.getByLabel("Given name").fill(d.given);
    await page.getByLabel("Family name").fill(d.family);
    await page.getByLabel("Date of birth").fill(d.dob);
    await page.getByLabel(/NHS number/).fill(d.nhs);
    await page.getByRole("button", { name: "Continue" }).click();
  }

  test("abandoning before upload stores nothing; saving creates the patient with consent recorded", async ({ page }) => {
    const ref = `NEW-${Date.now()}`;
    await login(page, "clinician@northfield.demo");
    await page.goto("/o/northfield/record");
    await expect(page.getByRole("heading", { name: "1. Patient details" })).toBeVisible();
    await fillDetails(page, ref);
    await expect(page.getByRole("heading", { name: /Confirm consent and identity/ })).toBeVisible();
    // Consent is a hard requirement: ticking identity boxes alone is not enough.
    const cont = page.getByRole("button", { name: "Continue to camera" });
    for (const c of await page.getByRole("checkbox").all()) if (!(await c.getAttribute("checked")) && !(await c.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent?.includes("agrees")))) await c.check();
    await expect(cont).toBeDisabled();
    await page.getByRole("checkbox", { name: /agrees to being recorded/ }).check();
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();
    // Abandon: nothing about this person exists server-side.
    await page.goto("/o/northfield/patients");
    expect(await sqlOne((s) => s`select count(*)::int as n from patients where synthetic_ref = ${ref}`).then((r) => r[0].n)).toBe(0);

    // Now do it properly.
    await page.goto("/o/northfield/record");
    await fillDetails(page, ref);
    for (const c of await page.getByRole("checkbox").all()) await c.check();
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await page.getByRole("button", { name: "Start recording" }).click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Stop recording" }).click();
    await page.getByRole("button", { name: "Confirm and upload" }).click();
    await expect(page.getByRole("heading", { name: "Recording saved" })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("back-to-patient").click();
    await expect(page.getByTestId("patient-banner")).toContainText("CONSENTEST, Nova");
    const rows = await sqlOne((s) => s`select r.consent_confirmed_at, r.consent_confirmed_by, u.email, r.status from recordings r join patients p on p.id = r.patient_id join users u on u.id = r.consent_confirmed_by where p.synthetic_ref = ${ref}`);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("available");
    expect(rows[0].consent_confirmed_at).not.toBeNull();
    expect(rows[0].email).toBe("clinician@northfield.demo");
    // The patient now appears in the list.
    await page.goto(`/o/northfield/patients?q=${ref}`);
    await expect(page.getByRole("link", { name: /CONSENTEST/ })).toBeVisible();
  });

  test("client-side validation of details; duplicate reference is refused at upload", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    await page.goto("/o/northfield/record");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter a reference")).toBeVisible();
    await expect(page.getByText("Enter the given name.")).toBeVisible();
    await fillDetails(page, "SYN-NOR-001"); // exists (seeded)
    for (const c of await page.getByRole("checkbox").all()) await c.check();
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await page.getByRole("button", { name: "Start recording" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop recording" }).click();
    await page.getByRole("button", { name: "Confirm and upload" }).click();
    await expect(alerts(page).filter({ hasText: "already exists" })).toBeVisible();
  });

  test("deleting a patient's only recording removes their identity; other recordings keep it", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    const json = { "Content-Type": "application/json", Origin: "http://localhost:3100" };
    const ref = `SCRUBE2E-${Date.now()}`;
    const video = (await import("node:fs")).readFileSync("tests/fixtures/sample.webm");
    const mk = async (patientPart: object, key: string) => {
      const init = await page.request.post("/api/o/northfield/recordings", {
        data: { ...patientPart, consentConfirmed: true, idempotencyKey: key, identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: video.length, durationSec: 2 }, headers: json });
      expect(init.status()).toBe(200);
      const r = await init.json();
      expect((await page.request.put(r.target.url, { data: video, headers: r.target.headers })).status()).toBe(200);
      expect((await page.request.post(`/api/o/northfield/recordings/${r.recordingId}/complete`, { data: {}, headers: json })).status()).toBe(200);
      return r as { recordingId: string; patientId: string };
    };
    const a = await mk({ newPatient: { syntheticRef: ref, givenName: "Scrub", familyName: "Eee", dateOfBirth: "1970-01-01", nhsNumber: "" } }, `scrub-a-${Date.now()}-abcdef`);
    const b = await mk({ patientId: a.patientId }, `scrub-b-${Date.now()}-abcdef`);
    const del = async (id: string) => {
      await page.goto(`/o/northfield/recordings/${id}`);
      await page.getByLabel("Delete this recording").selectOption("wrong_patient");
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.waitForURL(/\/patients\//);
    };
    await del(a.recordingId);
    expect((await sqlOne((s) => s`select given_name from patients where id = ${a.patientId}`))[0].given_name).toBe("Scrub"); // another recording remains
    await del(b.recordingId);
    const [p] = await sqlOne((s) => s`select given_name, family_name, synthetic_ref, nhs_number from patients where id = ${a.patientId}`);
    expect(p.given_name).toBe("Removed");
    expect(p.family_name).toBe("Removed");
    expect(p.synthetic_ref).toMatch(/^REMOVED-/);
    expect((await page.goto(`/o/northfield/patients/${a.patientId}`))?.status()).toBe(404);
  });
});

