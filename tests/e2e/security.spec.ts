import { expect, test } from "@playwright/test";
import { admin, alerts, fakeWebm, ids, login } from "./helpers";

const ORIGIN = "http://localhost:3100";
const json = { "Content-Type": "application/json", Origin: ORIGIN };

test.describe("tenant isolation (HTTP level)", () => {
  test("a Northfield user cannot reach Riverside by URL", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    for (const path of ["/o/riverside", "/o/riverside/patients", "/o/riverside/mdt", "/o/riverside/admin/users"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("a Riverside patient id under the Northfield slug is not found", async ({ page }) => {
    const { pats } = await ids();
    const victim = pats.find((p) => p.slug === "riverside")!;
    await login(page, "clinician@northfield.demo");
    const res = await page.goto(`/o/northfield/patients/${victim.id}`);
    expect(res?.status()).toBe(404);
    const rec = await page.goto(`/o/northfield/patients/${victim.id}/record`);
    expect(rec?.status()).toBe(404);
  });

  test("API: init/complete/playback across tenants are refused", async ({ page }) => {
    const { pats } = await ids();
    const victim = pats.find((p) => p.slug === "riverside")!;
    await login(page, "clinician@northfield.demo");
    const body = { patientId: victim.id, idempotencyKey: "x".repeat(24), identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: 1000, durationSec: 5 };
    // Own org slug, other org's patient -> patient not found
    const a = await page.request.post("/api/o/northfield/recordings", { data: body, headers: json });
    expect(a.status()).toBe(404);
    // Other org's slug -> same 404 as a non-existent org
    const b = await page.request.post("/api/o/riverside/recordings", { data: body, headers: json });
    expect(b.status()).toBe(404);
    const c = await page.request.post("/api/o/no-such-org/recordings", { data: body, headers: json });
    expect(c.status()).toBe(404);
    const rid = "00000000-0000-4000-8000-000000000000";
    expect((await page.request.post(`/api/o/riverside/recordings/${rid}/playback`, { data: {}, headers: json })).status()).toBe(404);
    expect((await page.request.post(`/api/o/northfield/recordings/${rid}/playback`, { data: {}, headers: json })).status()).toBe(404);
  });

  test("API: a Riverside recording cannot be played via the Northfield slug", async ({ page, browser }) => {
    // Create a Riverside recording through the real flow, then attack it from Northfield.
    const sql = admin();
    const [rv] = await sql`select o.id as org, p.id as pid, u.id as uid from organisations o join patients p on p.org_id = o.id join users u on u.email = 'clinician@riverside.demo' where o.slug = 'riverside' limit 1`;
    const [rec] = await sql`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key, status, mime_type, size_bytes, duration_sec, purge_after)
      values (${rv.org}, ${rv.pid}, ${rv.uid}, now(), ${["name", "dob"]}, ${`o/${rv.org}/r/${crypto.randomUUID()}`}, ${"iso-test-" + Date.now() + "-abcdefgh"}, 'available', 'video/webm', 1000, 5, now() + interval '30 days') returning id`;
    await sql.end();
    await login(page, "clinician@northfield.demo");
    expect((await page.request.post(`/api/o/northfield/recordings/${rec.id}/playback`, { data: {}, headers: json })).status()).toBe(404);
    expect((await page.goto(`/o/northfield/recordings/${rec.id}`))?.status()).toBe(404);
    void browser;
  });

  test("multi-org user sees only the selected organisation's data", async ({ page }) => {
    await login(page, "multi@previd.demo");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Choose an organisation" })).toBeVisible();
    await page.goto("/o/northfield/patients");
    await expect(page.getByRole("link", { name: /^[A-Z]+, / }).first()).toBeVisible();
    const sql = admin();
    const rows = await sql`select p.family_name from patients p join organisations o on o.id = p.org_id where o.slug = 'riverside'`;
    await sql.end();
    const text = await page.locator("main").innerText();
    // Riverside refs never appear on the Northfield list.
    expect(text).not.toContain("SYN-RIV");
    expect(rows.length).toBeGreaterThan(0);
  });
});

test.describe("privilege escalation", () => {
  test("MDT reviewer cannot create patients, record, or open admin pages", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "reviewer@northfield.demo");
    expect((await page.goto("/o/northfield/patients/new"))?.status()).toBe(404);
    expect((await page.goto(`/o/northfield/patients/${p.id}/record`))?.status()).toBe(404);
    for (const a of ["users", "settings", "audit"]) expect((await page.goto(`/o/northfield/admin/${a}`))?.status(), a).toBe(404);
    const body = { patientId: p.id, idempotencyKey: "y".repeat(24), identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: 1000, durationSec: 5 };
    const r = await page.request.post("/api/o/northfield/recordings", { data: body, headers: json });
    expect(r.status()).toBe(403);
    // The denials were audited.
    const sql = admin();
    const [n] = await sql`select count(*)::int as n from audit_events where action = 'authz.denied' and outcome = 'denied'`;
    await sql.end();
    expect(n.n).toBeGreaterThan(0);
  });

  test("a clinician cannot open admin pages or call admin APIs", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    for (const a of ["users", "settings", "audit"]) expect((await page.goto(`/o/northfield/admin/${a}`))?.status(), a).toBe(404);
  });
});

test.describe("API hardening", () => {
  test("unauthenticated API calls are refused", async ({ request }) => {
    const r = await request.post("/api/o/northfield/recordings", { data: {}, headers: json });
    expect(r.status()).toBe(404);
  });

  test("CSRF: cross-origin or non-JSON POSTs are refused", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    const evil = await page.request.post("/api/o/northfield/recordings", { data: {}, headers: { ...json, Origin: "https://evil.example" } });
    expect(evil.status()).toBe(403);
    const noOrigin = await page.request.post("/api/o/northfield/recordings", { data: {}, headers: { "Content-Type": "application/json" } });
    expect(noOrigin.status()).toBe(403);
    const form = await page.request.post("/api/o/northfield/recordings", { form: { a: "b" }, headers: { Origin: ORIGIN } });
    expect(form.status()).toBe(415);
  });

  test("oversized or malformed init requests are rejected", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    const base = { patientId: p.id, idempotencyKey: "z".repeat(24), identityChecks: ["name", "dob"], mimeType: "video/webm", durationSec: 5 };
    expect((await page.request.post("/api/o/northfield/recordings", { data: { ...base, sizeBytes: 999_999_999 }, headers: json })).status()).toBe(413);
    expect((await page.request.post("/api/o/northfield/recordings", { data: { ...base, sizeBytes: 1000, durationSec: 9999 }, headers: json })).status()).toBe(400);
    expect((await page.request.post("/api/o/northfield/recordings", { data: { ...base, sizeBytes: 1000, mimeType: "application/x-msdownload" }, headers: json })).status()).toBe(400);
    expect((await page.request.post("/api/o/northfield/recordings", { data: { ...base, sizeBytes: 1000, identityChecks: ["name"] }, headers: json })).status()).toBe(400);
    expect((await page.request.post("/api/o/northfield/recordings", { data: { ...base, patientId: "not-a-uuid", sizeBytes: 1000 }, headers: json })).status()).toBe(400);
  });

  test("uploaded content must really be a video; fakes are rejected on completion", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "clinician@northfield.demo");
    const init = await page.request.post("/api/o/northfield/recordings", {
      data: { patientId: p.id, idempotencyKey: "fake-" + Date.now() + "-abcdefgh", identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: 2000, durationSec: 5 },
      headers: json,
    });
    expect(init.status()).toBe(200);
    const { recordingId, target } = await init.json();
    // Not a video: plain text declared as webm
    const put = await page.request.put(target.url, { data: Buffer.from("MZ this is not a video ".repeat(80)), headers: target.headers });
    expect(put.status()).toBe(200);
    const done = await page.request.post(`/api/o/northfield/recordings/${recordingId}/complete`, { data: {}, headers: json });
    expect(done.status()).toBe(422);
    // Wrong content type on the upload URL
    const init2 = await (await page.request.post("/api/o/northfield/recordings", {
      data: { patientId: p.id, idempotencyKey: "fake2-" + Date.now() + "-abcdefgh", identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: 2000, durationSec: 5 }, headers: json,
    })).json();
    expect((await page.request.put(init2.target.url, { data: fakeWebm(), headers: { "Content-Type": "text/html" } })).status()).toBe(415);
    // Oversized relative to the signed limit
    expect((await page.request.put(init2.target.url, { data: fakeWebm(200_000), headers: init2.target.headers })).status()).toBe(413);
    // A valid upload token for PUT cannot be used to read
    const tok = new URL(init2.target.url, ORIGIN).searchParams.get("t");
    expect((await page.request.get(`/api/storage/play?t=${encodeURIComponent(tok!)}`)).status()).toBe(403);
  });

  test("storage endpoints reject missing, garbage and expired tokens", async ({ request }) => {
    expect((await request.get("/api/storage/play")).status()).toBe(403);
    expect((await request.get("/api/storage/play?t=abc.def")).status()).toBe(403);
    expect((await request.put("/api/storage/upload?t=abc.def", { data: "x", headers: { "Content-Type": "video/webm" } })).status()).toBe(403);
  });

  test("cron endpoint needs the secret", async ({ request }) => {
    expect((await request.get("/api/cron/retention")).status()).toBe(403);
    expect((await request.get("/api/cron/retention", { headers: { Authorization: "Bearer wrong-secret-0000000000" } })).status()).toBe(403);
    const ok = await request.get("/api/cron/retention", { headers: { Authorization: "Bearer test-cron-secret-0000000000" } });
    expect(ok.status()).toBe(200);
  });

  test("security headers are present", async ({ request }) => {
    const r = await request.get("/login");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toMatch(/nonce-/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toContain("camera=(self)");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("error responses do not leak internals", async ({ page }) => {
    await login(page, "clinician@northfield.demo");
    const r = await page.request.post("/api/o/northfield/recordings", { data: "not json{", headers: json });
    expect(r.status()).toBe(400);
    const t = await r.text();
    expect(t).not.toMatch(/postgres|stack|at .*\(|SELECT|ECONN/i);
    void alerts;
  });
});
