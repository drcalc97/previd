/**
 * Database administration CLI (owner role). Usage:
 *   tsx scripts/db.ts migrate      apply pending SQL migrations (+ local-auth ones if AUTH_PROVIDER=local)
 *   tsx scripts/db.ts setup-app    give the previd_app role a login + password (DATABASE_APP_PASSWORD)
 *   tsx scripts/db.ts reset        DROP and re-create everything (refuses non-local / non dev|test DBs)
 *   tsx scripts/db.ts seed         load synthetic data
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL is required");
  process.exit(1);
}
const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
const root = join(process.cwd(), "db");

async function migrate() {
  await sql`create table if not exists schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
  const dirs = ["migrations", ...(process.env.AUTH_PROVIDER === "local" ? ["local-auth"] : [])];
  for (const dir of dirs) {
    const files = readdirSync(join(root, dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const name = `${dir}/${f}`;
      const body = readFileSync(join(root, dir, f), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const [done] = await sql`select checksum from schema_migrations where name = ${name}`;
      if (done) {
        if (done.checksum !== checksum) throw new Error(`Migration ${name} was modified after being applied`);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations(name, checksum) values (${name}, ${checksum})`;
      });
      console.log(`applied ${name}`);
    }
  }
}

async function setupApp() {
  const pw = process.env.DATABASE_APP_PASSWORD;
  if (!pw || pw.length < 12) throw new Error("DATABASE_APP_PASSWORD (>=12 chars) is required");
  // role names/passwords cannot be bound parameters; escape the literal.
  await sql.unsafe(`alter role previd_app login password '${pw.replace(/'/g, "''")}'`);
  console.log("previd_app role configured");
}

async function reset() {
  const u = new URL(adminUrl!);
  const db = u.pathname.slice(1);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (!local || !/_(dev|test)$/.test(db)) {
    throw new Error(`Refusing to reset "${db}" on "${u.hostname}": only local *_dev / *_test databases`);
  }
  await sql.unsafe("drop schema if exists local_auth cascade; drop schema public cascade; create schema public;");
  console.log("database reset");
}

async function main() {
const cmd = process.argv[2];
try {
  if (cmd === "migrate") await migrate();
  else if (cmd === "setup-app") await setupApp();
  else if (cmd === "reset") await reset();
  else if (cmd === "seed") {
    // Demo users share a public password: only ever seed local development/test databases.
    const u = new URL(adminUrl!);
    if (!["localhost", "127.0.0.1"].includes(u.hostname) || !/_(dev|test)$/.test(u.pathname.slice(1))) {
      throw new Error("Refusing to seed: demo credentials are only allowed in local *_dev / *_test databases");
    }
    const { seed } = await import("./seed");
    await seed(sql);
  } else throw new Error(`Unknown command: ${cmd}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
}
void main();
