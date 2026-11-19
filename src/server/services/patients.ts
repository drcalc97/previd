import "server-only";
import { patientInput, type PatientInput } from "@/domain/schemas";
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

export async function listPatients(ctx: OrgContext, q = "", includeArchived = false): Promise<Patient[]> {
  await requirePermission(ctx, "patient:read");
  const term = `%${escapeLike(q.trim().slice(0, 60))}%`;
  const rows = await withOrg(
    ctx,
    (tx) => tx`select p.*, count(r.id) filter (where r.status = 'available') as recording_count,
                      max(r.recorded_at) filter (where r.status = 'available') as latest_recording_at
               from patients p left join recordings r on r.patient_id = p.id and r.org_id = p.org_id
               where p.org_id = ${ctx.orgId}
                 and (${includeArchived} or p.archived_at is null)
                 and (${q.trim() === ""} or p.family_name ilike ${term} or p.given_name ilike ${term}
                      or p.synthetic_ref ilike ${term} or p.nhs_number ilike ${term})
               group by p.id order by p.family_name, p.given_name limit 100`,
  );
  return rows.map(map);
}

/** Viewing a patient record is an audited access to patient data. */
export async function getPatient(ctx: OrgContext, id: string, opts: { auditView?: boolean } = {}): Promise<Patient> {
  await requirePermission(ctx, "patient:read");
  return withOrg(ctx, async (tx) => {
    const [r] = await tx`select * from patients where id = ${id} and org_id = ${ctx.orgId}`;
    if (!r) throw new NotFoundError();
    if (opts.auditView !== false) {
      await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.view", targetType: "patient", targetId: id, ipHash: ctx.ipHash });
    }
    return map(r);
  });
}

export async function createPatient(ctx: OrgContext, input: PatientInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission(ctx, "patient:write");
  const v = patientInput.parse(input);
  return withOrg(ctx, async (tx) => {
    const dup = await tx`select 1 from patients where org_id = ${ctx.orgId} and synthetic_ref = ${v.syntheticRef}`;
    if (dup.length) return { ok: false as const, error: "A patient with that reference already exists." };
    const [r] = await tx`insert into patients(org_id, synthetic_ref, given_name, family_name, date_of_birth, nhs_number, created_by)
      values (${ctx.orgId}, ${v.syntheticRef}, ${v.givenName}, ${v.familyName}, ${v.dateOfBirth}, ${v.nhsNumber || null}, ${ctx.userId})
      returning id`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.create", targetType: "patient", targetId: r.id, ipHash: ctx.ipHash });
    return { ok: true as const, id: r.id as string };
  });
}

export async function archivePatient(ctx: OrgContext, id: string): Promise<void> {
  await requirePermission(ctx, "patient:write");
  await withOrg(ctx, async (tx) => {
    const r = await tx`update patients set archived_at = now() where id = ${id} and org_id = ${ctx.orgId} and archived_at is null returning id`;
    if (!r.length) throw new NotFoundError();
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.archive", targetType: "patient", targetId: id, ipHash: ctx.ipHash });
  });
}
