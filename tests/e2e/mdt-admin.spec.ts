import { expect, test } from "@playwright/test";
import { admin, alerts, createRecordingViaApi, ids, login } from "./helpers";

test.describe("MDT viewer", () => {
  test("reviewer can find and open recordings with dates; cannot edit the meeting @mobile", async ({ page, browser }) => {
    // A clinician records for a patient that is on the seeded MDT list.
    const { pats } = await ids();
    const target = pats.find((x) => x.slug === "northfield")!;
    const clin = await (await browser.newContext()).newPage();
    await login(clin, "clinician@northfield.demo");
    const recId = await createRecordingViaApi(clin, "northfield", target.id);
    const sql = admin();
    const [m] = await sql`select m.id, m.org_id, ${target.id}::uuid as patient_id from mdt_meetings m join organisations o on o.id = m.org_id where o.slug = 'northfield' and m.title like 'Pre-op%' limit 1`;
    await sql`insert into mdt_meeting_patients(org_id, meeting_id, patient_id, position) values (${m.org_id}, ${m.id}, ${target.id}, 0) on conflict do nothing`;
    await sql.end();

    await login(page, "reviewer@northfield.demo");
    await page.goto("/o/northfield/mdt");
    await page.getByRole("link", { name: /Pre-op MDT/ }).click();
    await expect(page.getByRole("navigation", { name: "Patients in this meeting" })).toBeVisible();
    await expect(page.getByText(/Latest video/).first()).toBeVisible(); // dates visible in the list
    await page.locator(`a[href*="${m.patient_id}"]`).first().click();
    await expect(page.getByTestId("patient-banner")).toBeVisible();
    await expect(page.getByTestId("mdt-rec-date")).toContainText("Recorded");
    const player = page.getByTestId("player");
    await expect(player).toBeVisible();
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1); // really decodes
    // read-only: no add/remove/create controls
    await expect(page.getByRole("button", { name: /Remove .* from this meeting/ })).toHaveCount(0);
    await expect(page.getByLabel("Add patient")).toHaveCount(0);
    await page.goto("/o/northfield/mdt");
    await expect(page.getByRole("button", { name: "Create meeting" })).toHaveCount(0);
    // direct recording page also works for reviewers and is audited
    await page.goto(`/o/northfield/recordings/${recId}`);
    await expect(page.getByTestId("recording-date")).toBeVisible();
    const s2 = admin();
    const [n] = await s2`select count(*)::int as n from audit_events where action = 'recording.play' and target_id = ${recId}`;
    await s2.end();
    expect(n.n).toBeGreaterThan(0);
  });

  test("clinician builds a numbered discussion list with identity-free 'No PreVid' slots", async ({ page }) => {
    const { pats } = await ids();
    const withVideo = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    await page.goto("/o/northfield/mdt");
    await page.getByLabel("Title").fill("E2E MDT");
    await page.getByLabel("Date and time").fill("2030-01-15T09:00");
    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(page.getByRole("heading", { name: "E2E MDT" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Patients in this meeting" });
    // 1: a patient being discussed who has no PreVid recording -> placeholder only, no identity
    await page.getByRole("button", { name: /Add .No PreVid. slot/ }).click();
    await expect(page.getByTestId("mdt-placeholder")).toHaveText("No PreVid for patient 1");
    // 2: a patient who does have a recording
    const select = page.getByLabel("Add patient with a recording");
    const opts = await select.locator("option").allInnerTexts();
    await select.selectOption({ label: opts.find((o) => o.includes(withVideo.family_name.toUpperCase()))! });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(nav.getByText(new RegExp(`2\\. ${withVideo.family_name.toUpperCase()}`))).toBeVisible();
    await nav.getByText(new RegExp(`2\\. ${withVideo.family_name.toUpperCase()}`)).click();
    await expect(page.getByTestId("patient-banner")).toBeVisible();
    await expect(page.getByTestId("player")).toBeVisible();
    // 3: another placeholder; numbering follows the discussion order
    await page.getByRole("button", { name: /Add .No PreVid. slot/ }).click();
    await expect(nav.getByText("1. No PreVid for patient 1")).toBeVisible();
    await expect(nav.getByText("3. No PreVid for patient 3")).toBeVisible();
    // placeholders never store identity (DB columns checked in tests/db/rls.test.ts)
    await nav.getByText("3. No PreVid for patient 3").click();
    await page.getByRole("button", { name: "Remove this slot" }).click();
    await expect(nav.getByText("3. No PreVid for patient 3")).toHaveCount(0);
  });

  test("reviewers see placeholders but cannot add or remove them", async ({ page, browser }) => {
    const clin = await (await browser.newContext()).newPage();
    await login(clin, "clinician@northfield.demo");
    await clin.goto("/o/northfield/mdt");
    await clin.getByLabel("Title").fill("Placeholder MDT");
    await clin.getByLabel("Date and time").fill("2030-02-01T09:00");
    await clin.getByRole("button", { name: "Create meeting" }).click();
    await clin.getByRole("button", { name: /Add .No PreVid. slot/ }).click();
    const url = clin.url().split("?")[0];
    await login(page, "reviewer@northfield.demo");
    await page.goto(url);
    await expect(page.getByTestId("mdt-placeholder")).toHaveText("No PreVid for patient 1");
    await expect(page.getByRole("button", { name: /No PreVid. slot/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove this slot" })).toHaveCount(0);
  });
});

test.describe("administration", () => {
  test("admin adds a user, who can sign in; admin can suspend them; audit log records it", async ({ page, browser }) => {
    await login(page, "admin@northfield.demo");
    await page.goto("/o/northfield/admin/users");
    await page.getByLabel("Full name").fill("Nina New");
    await page.getByLabel("Email address").fill("nina.new@northfield.demo");
    await page.getByLabel("Role", { exact: true }).selectOption("clinician");
    await page.getByRole("button", { name: "Add user" }).click();
    const pw = (await page.getByTestId("temp-password").innerText()).trim();
    expect(pw.length).toBeGreaterThan(12);

    const ctx2 = await browser.newContext();
    const nina = await ctx2.newPage();
    await login(nina, "nina.new@northfield.demo", pw);
    await expect(nina.getByTestId("org-name")).toContainText("Northfield");
    await expect(nina.getByRole("link", { name: "Users" })).toHaveCount(0); // clinician: no admin nav

    await page.reload();
    await page.getByRole("button", { name: /Suspend Nina New/ }).click();
    await expect(page.getByRole("button", { name: /Reactivate Nina New/ })).toBeVisible();
    expect((await nina.goto("/o/northfield/patients"))?.status()).toBe(404);

    await page.goto("/o/northfield/admin/audit");
    await expect(page.getByText("admin.user_add").first()).toBeVisible();
    await expect(page.getByText("admin.user_suspend").first()).toBeVisible();
  });

  test("the last administrator cannot be demoted", async ({ page }) => {
    const sql = admin(); // the lockout test in auth.spec.ts locks this account on purpose

    await sql`update local_auth.credentials set locked_until = null, failed_attempts = 0`;
    await sql.end();
    await login(page, "admin@riverside.demo");
    await page.goto("/o/riverside/admin/users");
    const row = page.getByRole("row", { name: /Morgan Admin/ });
    await row.getByRole("combobox").selectOption("clinician");
    await row.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.getByRole("row", { name: /Morgan Admin/ }).getByRole("combobox")).toHaveValue("org_admin");
  });

  test("settings can be changed and are audited", async ({ page }) => {
    await login(page, "admin@northfield.demo");
    await page.goto("/o/northfield/admin/settings");
    await page.getByLabel("Retention period (days)").fill("90");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Retention period (days)")).toHaveValue("90");
    const s = admin();
    const [a] = await s`select count(*)::int as n from audit_events where action = 'admin.settings_change'`;
    await s.end();
    expect(a.n).toBeGreaterThan(0);
  });

  test("admins can also view video (owner decision)", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "admin@northfield.demo");
    const id = await createRecordingViaApi(page, "northfield", p.id);
    await page.goto(`/o/northfield/recordings/${id}`);
    await expect(page.getByTestId("player")).toBeVisible();
  });
});

test.describe("retention and deletion", () => {
  test("an organisation admin can delete a clinician's recording", async ({ page, browser }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    const clin = await (await browser.newContext()).newPage();
    await login(clin, "clinician@northfield.demo");
    const id = await createRecordingViaApi(clin, "northfield", p.id);
    await login(page, "admin@northfield.demo");
    await page.goto(`/o/northfield/recordings/${id}`);
    await page.getByLabel("Delete this recording").selectOption("admin_request");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recording timeline" })).toBeVisible();
    const s = admin();
    const [r] = await s`select status, delete_reason, deleted_by from recordings where id = ${id}`;
    const [a] = await s`select u.email from users u where u.id = ${r.deleted_by}`;
    await s.end();
    expect(r.status).toBe("deleted");
    expect(r.delete_reason).toBe("admin_request");
    expect(a.email).toBe("admin@northfield.demo");
  });

  test("a reviewer cannot delete recordings", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    const id = await createRecordingViaApi(page, "northfield", p.id);
    const rev = await page.context().browser()!.newContext();
    const rp = await rev.newPage();
    await login(rp, "reviewer@northfield.demo");
    await rp.goto(`/o/northfield/recordings/${id}`);
    await expect(rp.getByLabel("Delete this recording")).toHaveCount(0);
  });

  test("clinician can delete own recording with a reason; stored object is removed", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    const id = await createRecordingViaApi(page, "northfield", p.id);
    await page.goto(`/o/northfield/recordings/${id}`);
    await page.getByLabel("Delete this recording").selectOption("wrong_patient");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recording timeline" })).toBeVisible();
    expect((await page.goto(`/o/northfield/recordings/${id}`))?.status()).toBe(404);
    const s = admin();
    const [r] = await s`select status, delete_reason, storage_deleted_at from recordings where id = ${id}`;
    await s.end();
    expect(r.status).toBe("deleted");
    expect(r.delete_reason).toBe("wrong_patient");
    expect(r.storage_deleted_at).not.toBeNull();
  });

  test("expired recordings are purged by the retention job and the purge is audited", async ({ page, request }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    const id = await createRecordingViaApi(page, "northfield", p.id);
    const s = admin();
    await s`update recordings set purge_after = now() - interval '1 minute' where id = ${id}`;
    const r = await request.get("/api/cron/retention", { headers: { Authorization: "Bearer test-cron-secret-0000000000" } });
    expect(r.status()).toBe(200);
    expect((await r.json()).purged).toBeGreaterThanOrEqual(1);
    const [row] = await s`select status, delete_reason from recordings where id = ${id}`;
    const [a] = await s`select count(*)::int as n from audit_events where action = 'recording.purge' and target_id = ${id}`;
    await s.end();
    expect(row.status).toBe("deleted");
    expect(row.delete_reason).toBe("retention_expired");
    expect(a.n).toBe(1);
  });
});
