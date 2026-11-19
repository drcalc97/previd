import { expect, test, type Page } from "@playwright/test";
import { admin, alerts, ids, login } from "./helpers";

async function openRecorder(page: Page, family?: string) {
  const { pats } = await ids();
  const p = pats.find((x) => x.slug === "northfield" && (!family || x.family_name === family)) ?? pats.find((x) => x.slug === "northfield")!;
  await login(page, "clinician@northfield.demo");
  await page.goto(`/o/northfield/patients/${p.id}`);
  await expect(page.getByTestId("patient-banner")).toBeVisible();
  await page.getByRole("link", { name: "Record new video" }).click();
  await expect(page.getByRole("heading", { name: /Confirm patient identity/ })).toBeVisible();
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
