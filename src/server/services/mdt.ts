import "server-only";
import { meetingInput } from "@/domain/schemas";
import { audit } from "../audit";
import { requirePermission, NotFoundError } from "../authz";
import { withOrg, type OrgContext } from "../db";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export type Meeting = { id: string; title: string; scheduledFor: string; patientCount: number };

export async function listMeetings(ctx: OrgContext): Promise<Meeting[]> {
  await requirePermission(ctx, "mdt:read");
  const rows = await withOrg(
    ctx,
    // Only patients who currently have at least one available recording count (see ADR-016).
    (tx) => tx`select m.id, m.title, m.scheduled_for,
                 (select count(*) from mdt_meeting_patients mp
                   where mp.meeting_id = m.id and mp.org_id = m.org_id
                     and exists (select 1 from recordings r where r.org_id = mp.org_id and r.patient_id = mp.patient_id and r.status = 'available'))
                 + (select count(*) from mdt_meeting_placeholders ph where ph.meeting_id = m.id and ph.org_id = m.org_id) as n
               from mdt_meetings m where m.org_id = ${ctx.orgId} order by m.scheduled_for desc limit 100`,
  );
  return rows.map((r: Row) => ({ id: r.id, title: r.title, scheduledFor: iso(r.scheduled_for)!, patientCount: Number(r.n) }));
}

export type MeetingPatient = {
  patientId: string;
  givenName: string;
  familyName: string;
  syntheticRef: string;
  dateOfBirth: string;
  nhsNumber: string | null;
  recordings: { id: string; recordedAt: string; durationSec: number | null; recordedByName: string | null }[];
};

export type MeetingItem =
  | { kind: "patient"; position: number; number: number; patient: MeetingPatient }
  | { kind: "placeholder"; position: number; number: number; id: string };

/** MDT worklist: each patient with ALL available recordings, newest first, with dates. */
export async function getMeeting(ctx: OrgContext, id: string) {
  await requirePermission(ctx, "mdt:read");
  return withOrg(ctx, async (tx) => {
    const [m] = await tx`select id, title, scheduled_for from mdt_meetings where id = ${id} and org_id = ${ctx.orgId}`;
    if (!m) throw new NotFoundError();
    const phs = await tx`select id, position from mdt_meeting_placeholders where meeting_id = ${id} and org_id = ${ctx.orgId}`;
    const pats = await tx`select p.id, p.given_name, p.family_name, p.synthetic_ref, p.date_of_birth, p.nhs_number, mp.position
                          from mdt_meeting_patients mp join patients p on p.id = mp.patient_id and p.org_id = mp.org_id
                          where mp.meeting_id = ${id} and mp.org_id = ${ctx.orgId}
                            and exists (select 1 from recordings r where r.org_id = mp.org_id and r.patient_id = mp.patient_id and r.status = 'available')
                          order by mp.position, p.family_name`;
    const ids = pats.map((p: Row) => p.id as string);
    const recs = ids.length
      ? await tx`select r.id, r.patient_id, r.recorded_at, r.duration_sec, u.display_name from recordings r
                 left join users u on u.id = r.recorded_by
                 where r.org_id = ${ctx.orgId} and r.status = 'available' and r.patient_id in ${tx(ids)}
                 order by r.recorded_at desc`
      : [];
    const patients: MeetingPatient[] = pats.map((p: Row) => ({
      patientId: p.id,
      givenName: p.given_name,
      familyName: p.family_name,
      syntheticRef: p.synthetic_ref,
      dateOfBirth: typeof p.date_of_birth === "string" ? p.date_of_birth : new Date(p.date_of_birth).toISOString().slice(0, 10),
      nhsNumber: p.nhs_number,
      recordings: recs
        .filter((r: Row) => r.patient_id === p.id)
        .map((r: Row) => ({ id: r.id, recordedAt: iso(r.recorded_at)!, durationSec: r.duration_sec, recordedByName: r.display_name })),
    }));
    // One ordered discussion list; a placeholder says only "No PreVid for patient N" (N = order discussed). No identity is stored.
    const items: MeetingItem[] = [
      ...patients.map((p, i) => ({ kind: "patient" as const, position: Number(pats[i].position), patient: p })),
      ...phs.map((x: Row) => ({ kind: "placeholder" as const, position: Number(x.position), id: x.id as string })),
    ]
      .sort((a, b) => a.position - b.position || (a.kind === "patient" ? -1 : 1))
      .map((it, idx) => ({ ...it, number: idx + 1 }));
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.view", targetType: "meeting", targetId: id, ipHash: ctx.ipHash, metadata: { patients: patients.length } });
    return { id: m.id as string, title: m.title as string, scheduledFor: iso(m.scheduled_for)!, patients, items };
  });
}

export async function createMeeting(ctx: OrgContext, raw: unknown) {
  await requirePermission(ctx, "mdt:write");
  const v = meetingInput.parse(raw);
  return withOrg(ctx, async (tx) => {
    const [r] = await tx`insert into mdt_meetings(org_id, title, scheduled_for, created_by)
                         values (${ctx.orgId}, ${v.title}, ${new Date(v.scheduledFor)}, ${ctx.userId}) returning id`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.create", targetType: "meeting", targetId: r.id, ipHash: ctx.ipHash });
    return r.id as string;
  });
}

export async function addPatientToMeeting(ctx: OrgContext, meetingId: string, patientId: string) {
  await requirePermission(ctx, "mdt:write");
  await withOrg(ctx, async (tx) => {
    const [m] = await tx`select 1 as x from mdt_meetings where id = ${meetingId} and org_id = ${ctx.orgId}`;
    // Only patients with a PreVid recording may appear in an MDT list: we hold no basis to show others (ADR-016).
    const [p] = await tx`select 1 as x from patients p where p.id = ${patientId} and p.org_id = ${ctx.orgId} and p.archived_at is null
                         and exists (select 1 from recordings r where r.org_id = p.org_id and r.patient_id = p.id and r.status = 'available')`;
    if (!m || !p) throw new NotFoundError();
    await tx`insert into mdt_meeting_patients(org_id, meeting_id, patient_id, position)
             select ${ctx.orgId}, ${meetingId}, ${patientId}, greatest(coalesce(max(position), -1), coalesce((select max(position) from mdt_meeting_placeholders where meeting_id = ${meetingId}), -1)) + 1 from mdt_meeting_patients where meeting_id = ${meetingId}
             on conflict do nothing`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.patient_add", targetType: "meeting", targetId: meetingId, ipHash: ctx.ipHash });
  });
}

export async function removePatientFromMeeting(ctx: OrgContext, meetingId: string, patientId: string) {
  await requirePermission(ctx, "mdt:write");
  await withOrg(ctx, async (tx) => {
    await tx`delete from mdt_meeting_patients where meeting_id = ${meetingId} and patient_id = ${patientId} and org_id = ${ctx.orgId}`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.patient_remove", targetType: "meeting", targetId: meetingId, ipHash: ctx.ipHash });
  });
}

/** Adds an identity-free slot ("No PreVid for patient N") at the end of the discussion order. */
export async function addPlaceholder(ctx: OrgContext, meetingId: string) {
  await requirePermission(ctx, "mdt:write");
  await withOrg(ctx, async (tx) => {
    const [m] = await tx`select 1 as x from mdt_meetings where id = ${meetingId} and org_id = ${ctx.orgId}`;
    if (!m) throw new NotFoundError();
    await tx`insert into mdt_meeting_placeholders(org_id, meeting_id, position)
             select ${ctx.orgId}, ${meetingId}, greatest(
               coalesce((select max(position) from mdt_meeting_patients where meeting_id = ${meetingId}), -1),
               coalesce((select max(position) from mdt_meeting_placeholders where meeting_id = ${meetingId}), -1)) + 1`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.placeholder_add", targetType: "meeting", targetId: meetingId, ipHash: ctx.ipHash });
  });
}

export async function removePlaceholder(ctx: OrgContext, meetingId: string, placeholderId: string) {
  await requirePermission(ctx, "mdt:write");
  await withOrg(ctx, async (tx) => {
    await tx`delete from mdt_meeting_placeholders where id = ${placeholderId} and meeting_id = ${meetingId} and org_id = ${ctx.orgId}`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "mdt.placeholder_remove", targetType: "meeting", targetId: meetingId, ipHash: ctx.ipHash });
  });
}
