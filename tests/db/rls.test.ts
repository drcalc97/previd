/**
 * Row Level Security / tenant isolation tests. These connect as the RESTRICTED application role
 * (previd_app), exactly as the running app does, and try to break isolation.
 * Requires a local test database: `npm run db:test-reset` (see TESTING.md).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";

const admin = postgres(process.env.DATABASE_ADMIN_URL!, { max: 2, onnotice: () => {} });
const app = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false, onnotice: () => {} });

type Tx = postgres.TransactionSql;
const ids: Record<string, string> = {};

async function as<T>(email: string | null, org: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${email ? ids[email] : ""}, true), set_config('app.org_id', ${org ? ids[`org:${org}`] : ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/row-level security|permission denied|violates/i);
};

beforeAll(async () => {
  await seed(admin);
  for (const u of await admin`select id, email from users`) ids[u.email] = u.id;
  for (const o of await admin`select id, slug from organisations`) ids[`org:${o.slug}`] = o.id;
});
afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("no identity, no data", () => {
  it("sees nothing without a user/org context", async () => {
    for (const t of ["patients", "recordings", "organisations", "memberships", "users", "audit_events", "mdt_meetings", "org_settings"]) {
      const rows = await as(null, null, (tx) => tx.unsafe(`select 1 from ${t}`));
      expect(rows.length, t).toBe(0);
    }
  });
});

describe("cross-tenant reads", () => {
  it("a Northfield clinician sees only Northfield patients", async () => {
    const rows = await as("clinician@northfield.demo", "northfield", (tx) => tx`select org_id from patients`);
    const [{ n }] = await admin`select count(*)::int as n from patients where org_id = ${ids["org:northfield"]}`;
    expect(n).toBeGreaterThanOrEqual(8);
    expect(rows.length).toBe(n); // sees exactly its own organisation's patients, no more
    expect(new Set(rows.map((r) => r.org_id))).toEqual(new Set([ids["org:northfield"]]));
  });

  it("claiming another org's id in the session context yields nothing (membership is checked independently)", async () => {
    const rows = await as("clinician@northfield.demo", "riverside", (tx) => tx`select * from patients`);
    expect(rows.length).toBe(0);
    expect((await as("clinician@northfield.demo", "riverside", (tx) => tx`select * from mdt_meetings`)).length).toBe(0);
    expect((await as("clinician@northfield.demo", "riverside", (tx) => tx`select * from org_settings`)).length).toBe(0);
  });

  it("direct lookup by another org's patient id returns nothing", async () => {
    const [victim] = await admin`select id from patients where org_id = ${ids["org:riverside"]} limit 1`;
    const rows = await as("clinician@northfield.demo", "northfield", (tx) => tx`select * from patients where id = ${victim.id}`);
    expect(rows.length).toBe(0);
  });

  it("users and memberships of another organisation are invisible", async () => {
    const users = await as("clinician@northfield.demo", "northfield", (tx) => tx`select email from users`);
    const emails = users.map((u) => u.email);
    expect(emails).toContain("admin@northfield.demo");
    expect(emails).not.toContain("admin@riverside.demo");
    const m = await as("clinician@northfield.demo", "northfield", (tx) => tx`select org_id from memberships`);
    expect(new Set(m.map((r) => r.org_id))).toEqual(new Set([ids["org:northfield"]]));
  });

  it("a multi-org user sees one organisation's data at a time", async () => {
    const a = await as("multi@previd.demo", "northfield", (tx) => tx`select distinct org_id from patients`);
    const b = await as("multi@previd.demo", "riverside", (tx) => tx`select distinct org_id from patients`);
    expect(a.map((r) => r.org_id)).toEqual([ids["org:northfield"]]);
    expect(b.map((r) => r.org_id)).toEqual([ids["org:riverside"]]);
  });
});

describe("cross-tenant writes", () => {
  const newPatient = (org: string) => (tx: Tx) =>
    tx`insert into patients(org_id, synthetic_ref, given_name, family_name, date_of_birth)
       values (${ids[`org:${org}`]}, ${"X-" + Math.random().toString(36).slice(2, 8)}, 'Test', 'Writer', '1970-01-01')`;

  it("cannot insert a patient into another organisation", async () => {
    await denied(as("clinician@northfield.demo", "riverside", newPatient("riverside")));
    await denied(as("clinician@northfield.demo", "northfield", newPatient("riverside")));
  });

  it("cannot update another organisation's patient", async () => {
    const [victim] = await admin`select id from patients where org_id = ${ids["org:riverside"]} limit 1`;
    const r = await as("clinician@northfield.demo", "northfield", (tx) => tx`update patients set given_name = 'Pwned' where id = ${victim.id} returning id`);
    expect(r.length).toBe(0);
    const [after] = await admin`select given_name from patients where id = ${victim.id}`;
    expect(after.given_name).not.toBe("Pwned");
  });

  it("cannot move a patient to another organisation by updating org_id", async () => {
    const [mine] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx`update patients set org_id = ${ids["org:riverside"]} where id = ${mine.id}`));
  });

  it("database rejects a recording that points at another organisation's patient (composite FK)", async () => {
    const [victim] = await admin`select id from patients where org_id = ${ids["org:riverside"]} limit 1`;
    await expect(
      admin`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key)
            values (${ids["org:northfield"]}, ${victim.id}, ${ids["clinician@northfield.demo"]}, now(), ${["name", "dob"]}, 'k-cross', 'idem-key-cross-0001')`,
    ).rejects.toThrow(/foreign key/i);
  });
});

describe("role enforcement in the database (defence in depth)", () => {
  it("an MDT reviewer cannot create patients, recordings or meetings", async () => {
    await denied(
      as("reviewer@northfield.demo", "northfield", (tx) =>
        tx`insert into patients(org_id, synthetic_ref, given_name, family_name, date_of_birth) values (${ids["org:northfield"]}, 'RV-1', 'A', 'B', '1970-01-01')`),
    );
    await denied(
      as("reviewer@northfield.demo", "northfield", (tx) =>
        tx`insert into mdt_meetings(org_id, title, scheduled_for) values (${ids["org:northfield"]}, 'x', now())`),
    );
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    await denied(
      as("reviewer@northfield.demo", "northfield", (tx) =>
        tx`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key)
           values (${ids["org:northfield"]}, ${p.id}, ${ids["reviewer@northfield.demo"]}, now(), ${["name", "dob"]}, 'k-rv', 'idem-key-reviewer-01')`),
    );
  });

  it("a clinician cannot change roles or settings", async () => {
    const r = await as("clinician@northfield.demo", "northfield", (tx) =>
      tx`update memberships set role = 'org_admin' where user_id = ${ids["clinician@northfield.demo"]} returning user_id`);
    expect(r.length).toBe(0);
    const s = await as("clinician@northfield.demo", "northfield", (tx) => tx`update org_settings set retention_days = 1 returning org_id`);
    expect(s.length).toBe(0);
  });

  it("cannot record on behalf of someone else", async () => {
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    await denied(
      as("clinician@northfield.demo", "northfield", (tx) =>
        tx`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key)
           values (${ids["org:northfield"]}, ${p.id}, ${ids["admin@northfield.demo"]}, now(), ${["name", "dob"]}, 'k-imp', 'idem-key-impersonate1')`),
    );
  });

  it("identity checks need at least two recognised factors", async () => {
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    await denied(
      as("clinician@northfield.demo", "northfield", (tx) =>
        tx`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key)
           values (${ids["org:northfield"]}, ${p.id}, ${ids["clinician@northfield.demo"]}, now(), ${["name"]}, 'k-one', 'idem-key-onefactor01')`),
    );
  });

  it("a suspended membership loses all access", async () => {
    await admin`update memberships set status = 'suspended' where user_id = ${ids["reviewer@northfield.demo"]}`;
    try {
      const rows = await as("reviewer@northfield.demo", "northfield", (tx) => tx`select 1 from patients`);
      expect(rows.length).toBe(0);
    } finally {
      await admin`update memberships set status = 'active' where user_id = ${ids["reviewer@northfield.demo"]}`;
    }
  });
});

describe("audit log", () => {
  it("is append-only for the application role", async () => {
    await as("admin@northfield.demo", "northfield", (tx) =>
      tx`insert into audit_events(org_id, actor_user_id, action, outcome) values (${ids["org:northfield"]}, ${ids["admin@northfield.demo"]}, 'patient.view', 'success')`);
    await denied(as("admin@northfield.demo", "northfield", (tx) => tx`update audit_events set action = 'x'`));
    await denied(as("admin@northfield.demo", "northfield", (tx) => tx`delete from audit_events`));
  });

  it("is readable only by that organisation's administrators", async () => {
    expect((await as("admin@northfield.demo", "northfield", (tx) => tx`select 1 from audit_events`)).length).toBeGreaterThan(0);
    expect((await as("clinician@northfield.demo", "northfield", (tx) => tx`select 1 from audit_events`)).length).toBe(0);
    expect((await as("admin@riverside.demo", "riverside", (tx) => tx`select 1 from audit_events where org_id = ${ids["org:northfield"]}`)).length).toBe(0);
  });

  it("cannot forge an audit event for another organisation", async () => {
    await denied(
      as("clinician@northfield.demo", "northfield", (tx) =>
        tx`insert into audit_events(org_id, actor_user_id, action, outcome) values (${ids["org:riverside"]}, ${ids["clinician@northfield.demo"]}, 'patient.view', 'success')`),
    );
  });
});

describe("system functions and misc grants", () => {
  it("system_mark_object_deleted refuses rows that are not due", async () => {
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    const [rec] = await admin`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key, status, purge_after)
      values (${ids["org:northfield"]}, ${p.id}, ${ids["clinician@northfield.demo"]}, now(), ${["name", "dob"]}, 'k-live', 'idem-key-live-000001', 'available', now() + interval '30 days') returning id`;
    const [r] = await as(null, null, (tx) => tx`select system_mark_object_deleted(${rec.id}) as ok`);
    expect(r.ok).toBe(false);
    const [still] = await admin`select status from recordings where id = ${rec.id}`;
    expect(still.status).toBe("available");
    await admin`delete from recordings where id = ${rec.id}`;
  });

  it("the app role cannot modify or delete identity links", async () => {
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx`delete from identity_links`));
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx`update identity_links set user_id = user_id`));
  });

  it("the app role is not the table owner and has no BYPASSRLS", async () => {
    const [r] = await app`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`;
    expect(r.rolbypassrls).toBe(false);
    expect(r.rolsuper).toBe(false);
  });

  it("only synthetic organisations can exist in the MVP", async () => {
    await expect(admin`insert into organisations(name, slug, is_synthetic) values ('Real Trust', 'real-trust', false)`).rejects.toThrow(/mvp_synthetic_only/);
  });
});

describe("security hardening regressions (docs/security/FINDINGS_REGISTER.md)", () => {
  it("SEC-011: the app role cannot create temp tables to shadow membership checks", async () => {
    await denied(as("clinician@northfield.demo", "riverside", (tx) => tx.unsafe("create temp table memberships (org_id uuid, user_id uuid, role text, status text)")));
    const [f] = await admin`select proconfig from pg_proc where proname = 'app_is_member'`;
    expect(f.proconfig.join(",")).toMatch(/search_path=pg_catalog, public, pg_temp/);
  });

  it("SEC-011: the app role cannot create objects in the public schema", async () => {
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx.unsafe("create table public.pwn (x int)")));
  });

  it("SEC-014: audit events cannot be attributed to another user", async () => {
    await denied(as("clinician@northfield.demo", "northfield", (tx) =>
      tx`insert into audit_events(org_id, actor_user_id, action, outcome) values (${ids["org:northfield"]}, ${ids["admin@northfield.demo"]}, 'patient.view', 'success')`));
  });

  it("SEC-014: users can change their display name but not their email or status", async () => {
    const ok = await as("clinician@northfield.demo", "northfield", (tx) => tx`update users set display_name = display_name where id = ${ids["clinician@northfield.demo"]} returning id`);
    expect(ok.length).toBe(1);
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx`update users set email = 'x@y.z' where id = ${ids["clinician@northfield.demo"]}`));
    await denied(as("clinician@northfield.demo", "northfield", (tx) => tx`update users set status = 'active' where id = ${ids["clinician@northfield.demo"]}`));
  });

  it("SEC-014: immutable recording columns are frozen (even for the owner)", async () => {
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    const [rec] = await admin`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key)
      values (${ids["org:northfield"]}, ${p.id}, ${ids["clinician@northfield.demo"]}, now(), ${["name", "dob"]}, 'k-freeze', 'idem-key-freeze-0001') returning id`;
    await expect(admin`update recordings set storage_key = 'k-other' where id = ${rec.id}`).rejects.toThrow(/immutable/);
    await expect(admin`update recordings set recorded_by = ${ids["admin@northfield.demo"]} where id = ${rec.id}`).rejects.toThrow(/immutable/);
    await admin`delete from recordings where id = ${rec.id}`;
  });

  it("SEC-003/004: uploads are only allowed while a recording is pending", async () => {
    const [p] = await admin`select id from patients where org_id = ${ids["org:northfield"]} limit 1`;
    const mk = async (key: string, status: string) =>
      (await admin`insert into recordings(org_id, patient_id, recorded_by, identity_verified_at, identity_checks, storage_key, idempotency_key, status)
        values (${ids["org:northfield"]}, ${p.id}, ${ids["clinician@northfield.demo"]}, now(), ${["name", "dob"]}, ${key}, ${"idem-" + key + "-padpadpad"}, ${status}) returning id`)[0].id;
    const a = await mk("k-pend", "pending_upload"), b = await mk("k-avail", "available"), c = await mk("k-del", "deleted");
    const check = async (k: string) => (await as(null, null, (tx) => tx`select system_upload_allowed(${k}) as ok`))[0].ok;
    expect(await check("k-pend")).toBe(true);
    expect(await check("k-avail")).toBe(false);
    expect(await check("k-del")).toBe(false);
    expect(await check("k-missing")).toBe(false);
    await admin`delete from recordings where id in ${admin([a, b, c])}`;
  });

  it("SEC-001/002: only verified-email users can be found for cross-organisation add", async () => {
    await admin`insert into users(id, email, display_name) values (gen_random_uuid(), 'unverified@example.test', 'Unverified') on conflict do nothing`;
    const found = async (email: string) => (await as("admin@northfield.demo", "northfield", (tx) => tx`select app_find_user_id_by_email(${email}) as id`))[0].id;
    expect(await found("unverified@example.test")).toBeNull();
    expect(await found("clinician@riverside.demo")).not.toBeNull(); // verified seed user
    // and a non-admin gets nothing at all
    const asClin = (await as("clinician@northfield.demo", "northfield", (tx) => tx`select app_find_user_id_by_email('clinician@riverside.demo') as id`))[0].id;
    expect(asClin).toBeNull();
  });
});
