import "server-only";
import { audit } from "../audit";
import { requirePermission, NotFoundError } from "../authz";
import { withOrg, type OrgContext } from "../db";

export type Patient = {
  id: string;
  syntheticRef: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nhsNumber: string | null;
  archivedAt: string | null;
  recordingCount?: number;
  latestRecordingAt?: string | null;
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const map = (r: Row): Patient => ({
  id: r.id,
  syntheticRef: r.synthetic_ref,
  givenName: r.given_name,
  familyName: r.family_name,
  dateOfBirth: typeof r.date_of_birth === "string" ? r.date_of_birth : new Date(r.date_of_birth).toISOString().slice(0, 10),
  nhsNumber: r.nhs_number,
  archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
  recordingCount: r.recording_count !== undefined ? Number(r.recording_count) : undefined,
  latestRecordingAt: r.latest_recording_at ? new Date(r.latest_recording_at).toISOString() : null,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listPatients(ctx: OrgContext, q = ""): Promise<Patient[]> {
  await requirePermission(ctx, "patient:read");
  const term = `%${escapeLike(q.trim().slice(0, 60))}%`;
  const rows = await withOrg(ctx, async (tx) => {
    const found = await tx`select p.*, count(r.id) filter (where r.status = 'available') as recording_count,
                      max(r.recorded_at) filter (where r.status = 'available') as latest_recording_at
               from patients p left join recordings r on r.patient_id = p.id and r.org_id = p.org_id
               where p.org_id = ${ctx.orgId}
                 and p.archived_at is null
                 and exists (select 1 from recordings rx where rx.org_id = p.org_id and rx.patient_id = p.id and rx.status = 'available')
                 and (${q.trim() === ""} or p.family_name ilike ${term} or p.given_name ilike ${term}
                      or p.synthetic_ref ilike ${term} or p.nhs_number ilike ${term})
               group by p.id order by p.family_name, p.given_name limit 100`;
    // Bulk PHI read: record that it happened (count only — never the search term) (SEC-015).
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.list", ipHash: ctx.ipHash, metadata: { count: found.length, searched: q.trim() !== "" } });
    return found;
  });
  return rows.map(map);
}

/** Viewing a patient record is an audited access to patient data. */
export async function getPatient(ctx: OrgContext, id: string, opts: { auditView?: boolean } = {}): Promise<Patient> {
  await requirePermission(ctx, "patient:read");
  return withOrg(ctx, async (tx) => {
    // A patient is only visible while they have a live PreVid recording (no recording => no identity held; ADR-017).
    const [r] = await tx`select * from patients p where p.id = ${id} and p.org_id = ${ctx.orgId} and p.archived_at is null
                         and exists (select 1 from recordings rx where rx.org_id = p.org_id and rx.patient_id = p.id and rx.status in ('available','pending_upload'))`;
    if (!r) throw new NotFoundError();
    if (opts.auditView !== false) {
      await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.view", targetType: "patient", targetId: id, ipHash: ctx.ipHash });
    }
    return map(r);
  });
}
