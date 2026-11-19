import { expect, test } from "@playwright/test";
import { alerts, login } from "./helpers";

test.describe("authentication", () => {
  test("rejects a wrong password with a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("clinician@northfield.demo");
    await page.getByLabel("Password").fill("not-the-password-1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alerts(page)).toContainText("Email or password is incorrect");
  });

  test("unknown email gives the same message (no user enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("nobody@nowhere.example");
    await page.getByLabel("Password").fill("whatever-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alerts(page)).toContainText("Email or password is incorrect");
  });

  test("protected pages redirect to sign-in when signed out", async ({ page }) => {
    await page.goto("/o/northfield/patients");
    await expect(page).toHaveURL(/\/login/);
  });

  test("password alone is not enough: MFA is mandatory", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("reviewer@northfield.demo");
    await page.getByLabel("Password").fill("PreVid-demo-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login\/mfa/);
    await page.goto("/o/northfield/patients");
    await expect(page).toHaveURL(/\/login\/mfa/);
    await page.request.post("/api/o/northfield/recordings", { data: {}, headers: { origin: "http://localhost:3100" } }).then((r) => expect(r.status()).toBe(404));
  });

  test("wrong MFA code is rejected; correct code signs in; sign-out ends the session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("clinician@northfield.demo");
    await page.getByLabel("Password").fill("PreVid-demo-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("totp-secret")).toHaveCount(1); // first sign-in: enrolment
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(alerts(page)).toContainText("not accepted");
    await page.context().clearCookies();
    await login(page, "clinician@northfield.demo");
    await expect(page.getByTestId("org-name")).toContainText("Northfield");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/o/northfield");
    await expect(page).toHaveURL(/\/login/);
  });

  test("account locks after repeated failures", async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill("admin@riverside.demo");
      await page.getByLabel("Password").fill(`wrong-password-${i}-xyz`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(alerts(page)).toBeVisible();
    }
    // Even the correct password is now refused while locked.
    await page.goto("/login");
    await page.getByLabel("Email address").fill("admin@riverside.demo");
    await page.getByLabel("Password").fill("PreVid-demo-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alerts(page)).toContainText("temporarily locked");
  });
});
