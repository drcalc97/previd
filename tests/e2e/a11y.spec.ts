import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ids, login } from "./helpers";

async function scan(page: Page, name: string) {
  const r = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`), name).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 A/AA — automated checks only, not a full audit) @mobile", () => {
  test("sign-in and MFA pages", async ({ page }) => {
    await page.goto("/login");
    await scan(page, "login");
    await page.getByLabel("Email address").fill("reviewer@northfield.demo");
    await page.getByLabel("Password").fill("PreVid-demo-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/mfa/);
    await scan(page, "mfa");
  });

  test("signed-in pages", async ({ page }) => {
    const { pats } = await ids();
    const p = pats.find((x) => x.slug === "northfield")!;
    await login(page, "admin@northfield.demo");
    for (const path of ["/o/northfield", "/o/northfield/patients", "/o/northfield/patients/new", `/o/northfield/patients/${p.id}`,
      `/o/northfield/patients/${p.id}/record`, "/o/northfield/mdt", "/o/northfield/admin/users", "/o/northfield/admin/settings", "/o/northfield/admin/audit"]) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      await scan(page, path.replace(p.id, ":id"));
    }
  });
});
