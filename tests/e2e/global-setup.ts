import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

export default async function globalSetup() {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const l of readFileSync(".env.test", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m) env[m[1]] = m[2];
  }
  rmSync(env.LOCAL_STORAGE_DIR!, { recursive: true, force: true });
  execSync("bash scripts/test-db.sh", { env, stdio: "inherit" });
  execSync("npx tsx scripts/db.ts seed", { env, stdio: "inherit" });
}
