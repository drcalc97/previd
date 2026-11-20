/** Synthetic seed data. All people, numbers and organisations here are fictitious. */
import type { Sql } from "postgres";
import { hashPassword } from "../src/server/adapters/local/password";

export const DEMO_PASSWORD = "PreVid-demo-2026!";

const ORGS = [
  { slug: "northfield", name: "Northfield Demo Trust (synthetic)" },
  { slug: "riverside", name: "Riverside Demo Trust (synthetic)" },
];
const USERS = [
  { email: "admin@northfield.demo", name: "Alex Admin (Northfield)", orgs: { northfield: "org_admin" } },
  { email: "clinician@northfield.demo", name: "Dr Casey Clinician (Northfield)", orgs: { northfield: "clinician" } },
  { email: "reviewer@northfield.demo", name: "Dr Riley Reviewer (Northfield)", orgs: { northfield: "mdt_reviewer" } },
  { email: "admin@riverside.demo", name: "Morgan Admin (Riverside)", orgs: { riverside: "org_admin" } },
  { email: "clinician@riverside.demo", name: "Dr Jordan Clinician (Riverside)", orgs: { riverside: "clinician" } },
  { email: "multi@previd.demo", name: "Dr Sam Multi-Site", orgs: { northfield: "clinician", riverside: "clinician" } },
] as const;
const GIVEN = ["Ada", "Bram", "Cleo", "Dev", "Esme", "Finn", "Gwen", "Hugo", "Isla", "Jude"];
const FAMILY = ["Testwell", "Syntheton", "Mockley", "Faxby", "Dummerton", "Placebo", "Samplesmith", "Fakenham"];

export async function seed(sql: Sql) {
  const pwHash = await hashPassword(DEMO_PASSWORD);
  const hasLocal = (await sql`select to_regclass('local_auth.credentials') as t`)[0].t !== null;
  await sql.begin(async (tx) => {
    const orgIds: Record<string, string> = {};
    for (const o of ORGS) {
      const [row] = await tx`insert into organisations(name, slug) values (${o.name}, ${o.slug})
        on conflict (slug) do update set name = excluded.name returning id`;
      orgIds[o.slug] = row.id;
      await tx`insert into org_settings(org_id) values (${row.id}) on conflict do nothing`;
    }
    const userIds: Record<string, string> = {};
    for (const u of USERS) {
      const [row] = await tx`insert into users(email, display_name, email_verified_at) values (${u.email}, ${u.name}, now())
        on conflict (email) do update set display_name = excluded.display_name returning id`;
      userIds[u.email] = row.id;
      for (const [slug, role] of Object.entries(u.orgs)) {
        await tx`insert into memberships(org_id, user_id, role) values (${orgIds[slug]}, ${row.id}, ${role})
          on conflict (org_id, user_id) do update set role = excluded.role, status = 'active'`;
      }
      if (hasLocal) {
        await tx`insert into local_auth.credentials(user_id, email, password_hash) values (${row.id}, ${u.email}, ${pwHash})
          on conflict (user_id) do nothing`;
        await tx`insert into identity_links(provider, subject, user_id) values ('local', ${row.id}, ${row.id})
          on conflict do nothing`;
      }
    }
    let n = 0;
    for (const o of ORGS) {
      const creator = userIds[o.slug === "northfield" ? "clinician@northfield.demo" : "clinician@riverside.demo"];
      const patientIds: string[] = [];
      for (let i = 0; i < 8; i++) {
        n++;
        const dob = new Date(Date.UTC(1940 + ((i * 7 + n) % 45), (i * 5) % 12, 1 + ((i * 3) % 27)));
        const [p] = await tx`insert into patients(org_id, synthetic_ref, given_name, family_name, date_of_birth, nhs_number, created_by)
          values (${orgIds[o.slug]}, ${`SYN-${o.slug.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`},
                  ${GIVEN[(i + n) % GIVEN.length]}, ${FAMILY[(i * 3 + n) % FAMILY.length]},
                  ${dob.toISOString().slice(0, 10)}, ${String(9990000000 + n * 7919).slice(0, 10)}, ${creator})
          on conflict (org_id, synthetic_ref) do update set given_name = excluded.given_name returning id`;
        patientIds.push(p.id);
      }
      const existing = await tx`select 1 from mdt_meetings where org_id = ${orgIds[o.slug]} limit 1`;
      if (!existing.length) {
        const [m] = await tx`insert into mdt_meetings(org_id, title, scheduled_for, created_by)
          values (${orgIds[o.slug]}, 'Pre-op MDT (synthetic)', now() + interval '2 days', ${creator}) returning id`;
        // Patients are only added to an MDT list once they have a recording (ADR-016); the list starts empty.
        void patientIds;
      }
    }
  });
  console.log(`Seeded synthetic data. Demo password for every demo user: ${DEMO_PASSWORD}`);
}
