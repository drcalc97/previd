import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

function env(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const testEnv = env(".env.test");
const PORT = 3100;

// Chromium with a synthetic camera/microphone; no real device or permission prompt needed.
const launchOptions = {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-sandbox"],
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", permissions: ["camera", "microphone"], launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, grep: /@mobile/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    // PREVID_ALLOW_DEV_ADAPTERS=true is for THIS local test server only (local auth + local storage).
    env: { ...testEnv, PREVID_ALLOW_DEV_ADAPTERS: "true", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
