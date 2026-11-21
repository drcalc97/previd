import "server-only";
import { initRecordingInput, type InitRecordingInput } from "@/domain/schemas";
import { audit } from "../audit";
import { requirePermission, NotFoundError } from "../authz";
import { db, withOrg, type OrgContext } from "../db";
import { storage } from "../providers";
import { makeStorageKey, type UploadTarget } from "../ports/storage";
import { rateLimit } from "../ratelimit";

export type Recording = {
  id: string;
  patientId: string;
  recordedBy: string;
  recordedByName: string | null;
  status: "pending_upload" | "available" | "failed" | "deleted";
  recordedAt: string;
  durationSec: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  purgeAfter: string | null;
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const map = (r: Row): Recording => ({
  id: r.id,
  patientId: r.patient_id,
  recordedBy: r.recorded_by,
  recordedByName: r.recorded_by_name ?? null,
  status: r.status,
  recordedAt: iso(r.recorded_at)!,
  durationSec: r.duration_sec,
  sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
  mimeType: r.mime_type,
  purgeAfter: iso(r.purge_after),
});

const UPLOAD_URL_TTL_SEC = 900;
const PLAYBACK_TTL_SEC = 120;

export type InitResult =
  | { ok: true; recordingId: string; patientId: string; alreadyUploaded: boolean; target?: UploadTarget }
  | { ok: false; error: string; status: number };

export async function getOrgSettings(ctx: OrgContext) {
  const [s] = await withOrg(ctx, (tx) => tx`select * from org_settings where org_id = ${ctx.orgId}`);
  return {
    retentionDays: s.retention_days as number,
    maxDurationSec: s.max_duration_sec as number,
    maxFileBytes: Number(s.max_file_bytes),
  };
}

/** Step 1 of upload: authorise, validate, create the pending row, and hand out a short-lived upload target. Idempotent. */
export async function initRecording(ctx: OrgContext, raw: unknown): Promise<InitResult> {
  await requirePermission(ctx, "recording:create");
  const parsed = initRecordingInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request.", status: 400 };
  const input: InitRecordingInput = parsed.data;
  if (!(await rateLimit(`rec:init:${ctx.userId}`, 600, 30))) {
    return { ok: false, error: "Too many upload attempts. Please wait a few minutes.", status: 429 };
  }
  const settings = await getOrgSettings(ctx);
  if (input.sizeBytes > settings.maxFileBytes) return { ok: false, error: "Recording is larger than this organisation allows.", status: 413 };
  if (input.durationSec > settings.maxDurationSec) return { ok: false, error: "Recording is longer than this organisation allows.", status: 413 };

  if (input.newPatient) await requirePermission(ctx, "patient:write");

  const result = await withOrg(ctx, async (tx) => {
    const [existing] = await tx`select r.id, r.status, r.recorded_by, r.storage_key, r.patient_id, r.mime_type, r.declared_size_bytes,
                                       p.synthetic_ref, p.given_name, p.family_name
                                from recordings r join patients p on p.id = r.patient_id and p.org_id = r.org_id
                                where r.org_id = ${ctx.orgId} and r.idempotency_key = ${input.idempotencyKey}`;
    if (existing) {
      if (existing.recorded_by !== ctx.userId) return { ok: false as const, error: "Conflict.", status: 409 };
      // Replaying a key with different content would silently attach the old recording to the wrong patient (SEC-018).
      const samePatient = input.patientId
        ? existing.patient_id === input.patientId
        : existing.synthetic_ref === input.newPatient!.syntheticRef && existing.given_name === input.newPatient!.givenName && existing.family_name === input.newPatient!.familyName;
      if (!samePatient || existing.mime_type !== input.mimeType || Number(existing.declared_size_bytes) !== input.sizeBytes) {
        return { ok: false as const, error: "This submission does not match the original. Please record again.", status: 409 };
      }
      const base = { ok: true as const, recordingId: existing.id as string, patientId: existing.patient_id as string };
      if (existing.status === "available") return { ...base, alreadyUploaded: true, key: null };
      if (existing.status === "pending_upload") return { ...base, alreadyUploaded: false, key: existing.storage_key as string };
      return { ok: false as const, error: "This recording can no longer be submitted. Please record again.", status: 409 };
    }

    let patientId: string;
    if (input.newPatient) {
      // A patient is added to the system ONLY here, together with the consent confirmation for this recording (ADR-017).
      const np = input.newPatient;
      patientId = (await tx`select gen_random_uuid() as id`)[0].id as string;
      try {
        await tx.savepoint(
          (sp) => sp`insert into patients(id, org_id, synthetic_ref, given_name, family_name, date_of_birth, nhs_number, created_by)
                     values (${patientId}, ${ctx.orgId}, ${np.syntheticRef}, ${np.givenName}, ${np.familyName}, ${np.dateOfBirth}, ${np.nhsNumber || null}, ${ctx.userId})`,
        );
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          return { ok: false as const, error: "A patient with that reference already exists. Find them in the patient list and record from their record.", status: 409 };
        }
        throw e;
      }
      await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "patient.create", targetType: "patient", targetId: patientId, ipHash: ctx.ipHash });
    } else {
      const [patient] = await tx`select id from patients where id = ${input.patientId!} and org_id = ${ctx.orgId} and archived_at is null`;
      if (!patient) return { ok: false as const, error: "Patient not found.", status: 404 };
      patientId = patient.id as string;
    }

    const [{ id }] = await tx`select gen_random_uuid() as id`;
    const key = makeStorageKey(ctx.orgId, id);
    await tx`insert into recordings(id, org_id, patient_id, recorded_by, identity_verified_at, identity_checks, consent_confirmed_at, consent_confirmed_by,
                                    storage_key, mime_type, declared_size_bytes, duration_sec, idempotency_key)
             values (${id}, ${ctx.orgId}, ${patientId}, ${ctx.userId}, now(), ${input.identityChecks}, now(), ${ctx.userId}, ${key},
                     ${input.mimeType}, ${input.sizeBytes}, ${input.durationSec}, ${input.idempotencyKey})`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "recording.init", targetType: "recording", targetId: id, ipHash: ctx.ipHash, metadata: { consent: true, new_patient: !!input.newPatient } });
    return { ok: true as const, recordingId: id as string, patientId, alreadyUploaded: false, key };
  });
  if (!result.ok) return result;
  if (result.alreadyUploaded || !result.key) return { ok: true, recordingId: result.recordingId, patientId: result.patientId, alreadyUploaded: true };
  const target = await storage().createUploadTarget(result.key, {
    mimeType: input.mimeType,
    maxBytes: Math.min(settings.maxFileBytes, Math.ceil(input.sizeBytes * 1.02) + 1024),
    expiresInSec: UPLOAD_URL_TTL_SEC,
  });
  return { ok: true, recordingId: result.recordingId, patientId: result.patientId, alreadyUploaded: false, target };
}

function sniffMime(head: Buffer): "video/mp4" | "video/webm" | null {
  if (head.length >= 12 && head.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  return null;
}

/** Step 2: verify the stored object (exists, size, container signature) before the recording becomes available. */
export async function completeRecording(ctx: OrgContext, recordingId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requirePermission(ctx, "recording:create");
  const settings = await getOrgSettings(ctx);
  const [rec] = await withOrg(ctx, (tx) => tx`select * from recordings where id = ${recordingId} and org_id = ${ctx.orgId}`);
  if (!rec) return { ok: false, error: "Recording not found.", status: 404 };
  if (rec.recorded_by !== ctx.userId) return { ok: false, error: "Recording not found.", status: 404 }; // no existence signal (SEC-029)
  if (rec.status === "available") return { ok: true };
  if (rec.status !== "pending_upload") return { ok: false, error: "Recording cannot be completed.", status: 409 };

  const st = storage();
  const fail = async (error: string, status = 422) => {
    await st.delete(rec.storage_key);
    await withOrg(ctx, async (tx) => {
      await tx`update recordings set status = 'failed', storage_deleted_at = now() where id = ${recordingId} and org_id = ${ctx.orgId}`;
      await tx`select patient_scrub_if_unused(${ctx.orgId}, ${rec.patient_id})`; // a patient left with no recording keeps no identity
      await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "recording.upload_rejected", targetType: "recording", targetId: recordingId, outcome: "denied", ipHash: ctx.ipHash });
    });
    return { ok: false as const, error, status };
  };
  const head = await st.head(rec.storage_key);
  if (!head) return { ok: false, error: "The upload has not arrived yet. Please retry.", status: 409 };
  if (head.sizeBytes <= 0 || head.sizeBytes > settings.maxFileBytes) return fail("Uploaded file exceeds the size limit.");
  if (rec.declared_size_bytes && head.sizeBytes > Number(rec.declared_size_bytes) * 1.02 + 1024) return fail("Uploaded file does not match the declared size.");
  const sniffed = sniffMime(await st.readStart(rec.storage_key, 16));
  if (!sniffed || sniffed !== rec.mime_type) return fail("Uploaded file is not a supported video format.");

  await withOrg(ctx, async (tx) => {
    await tx`update recordings set status = 'available', size_bytes = ${head.sizeBytes}, uploaded_at = now(),
               purge_after = now() + ${settings.retentionDays} * interval '1 day'
             where id = ${recordingId} and org_id = ${ctx.orgId} and status = 'pending_upload'`;
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "recording.complete", targetType: "recording", targetId: recordingId, ipHash: ctx.ipHash });
  });
  return { ok: true };
}

export async function listRecordingsForPatient(ctx: OrgContext, patientId: string): Promise<Recording[]> {
  await requirePermission(ctx, "recording:read");
  const rows = await withOrg(
    ctx,
    (tx) => tx`select r.*, u.display_name as recorded_by_name from recordings r
               left join users u on u.id = r.recorded_by
               where r.patient_id = ${patientId} and r.org_id = ${ctx.orgId} and r.status in ('available','pending_upload')
               order by r.recorded_at desc`,
  );
  return rows.map(map);
}

export async function getRecording(ctx: OrgContext, id: string): Promise<Recording> {
  await requirePermission(ctx, "recording:read");
  const [r] = await withOrg(
    ctx,
    (tx) => tx`select r.*, u.display_name as recorded_by_name from recordings r left join users u on u.id = r.recorded_by
               where r.id = ${id} and r.org_id = ${ctx.orgId} and r.status = 'available'`,
  );
  if (!r) throw new NotFoundError();
  return map(r);
}

/** Authorise, audit, and mint a short-lived playback URL. Never returns a durable URL. */
export async function createPlayback(ctx: OrgContext, id: string): Promise<{ url: string; expiresInSec: number }> {
  await requirePermission(ctx, "recording:read");
  if (!(await rateLimit(`rec:play:${ctx.userId}`, 60, 60))) throw new Error("rate_limited");
  const key = await withOrg(ctx, async (tx) => {
    const [r] = await tx`select storage_key from recordings where id = ${id} and org_id = ${ctx.orgId} and status = 'available'`;
    if (!r) throw new NotFoundError();
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "recording.play", targetType: "recording", targetId: id, ipHash: ctx.ipHash });
    return r.storage_key as string;
  });
  return { url: await storage().createPlaybackUrl(key, PLAYBACK_TTL_SEC), expiresInSec: PLAYBACK_TTL_SEC };
}

export async function deleteRecording(ctx: OrgContext, id: string, reason: "wrong_patient" | "poor_quality" | "recorded_in_error" | "admin_request") {
  const [r] = await withOrg(ctx, (tx) => tx`select recorded_by, storage_key, status from recordings where id = ${id} and org_id = ${ctx.orgId}`);
  if (!r || r.status === "deleted") throw new NotFoundError();
  await requirePermission(ctx, r.recorded_by === ctx.userId ? "recording:delete_own" : "recording:delete_any");
  await withOrg(ctx, async (tx) => {
    await tx`update recordings set status = 'deleted', deleted_at = now(), deleted_by = ${ctx.userId}, delete_reason = ${reason}
             where id = ${id} and org_id = ${ctx.orgId}`;
    const [pr] = await tx`select patient_id from recordings where id = ${id} and org_id = ${ctx.orgId}`;
    await tx`select patient_scrub_if_unused(${ctx.orgId}, ${pr.patient_id})`; // no recording left => identity is removed
    await audit(tx, { orgId: ctx.orgId, actorUserId: ctx.userId, action: "recording.delete", targetType: "recording", targetId: id, ipHash: ctx.ipHash, metadata: { reason } });
  });
  // Best effort now; the retention sweep retries any object not yet removed (storage_deleted_at is null).
  try {
    await storage().delete(r.storage_key);
    await withOrg(ctx, (tx) => tx`update recordings set storage_deleted_at = now() where id = ${id} and org_id = ${ctx.orgId}`);
  } catch {
    /* swept later */
  }
}

/** Cron: remove expired/abandoned/deleted objects. No user context: uses narrowly-scoped SECURITY DEFINER functions. */
export async function runRetentionSweep(limit = 200): Promise<{ purged: number; errors: number }> {
  const due = await db()`select * from system_due_recordings(${limit})`;
  let purged = 0, errors = 0;
  for (const r of due) {
    try {
      await storage().delete(r.storage_key);
      const [ok] = await db()`select system_mark_object_deleted(${r.id}) as ok`;
      if (ok.ok) purged++;
    } catch {
      errors++;
    }
  }
  // Re-delete objects of very recently deleted recordings: a still-valid signed upload URL could otherwise re-create them (SEC-004).
  for (const t of await db()`select * from system_recent_tombstones(${limit})`) {
    try {
      await storage().delete(t.storage_key);
    } catch {
      errors++;
    }
  }
  await db()`select system_cleanup()`;
  return { purged, errors };
}

export type RecentRecording = Recording & { patientName: string; patientRef: string };

/** Latest available recordings across the organisation (dashboard / browse by date). */
export async function listRecentRecordings(ctx: OrgContext, limit = 10): Promise<RecentRecording[]> {
  await requirePermission(ctx, "recording:read");
  const rows = await withOrg(
    ctx,
    (tx) => tx`select r.*, u.display_name as recorded_by_name, p.given_name, p.family_name, p.synthetic_ref
               from recordings r join patients p on p.id = r.patient_id and p.org_id = r.org_id
               left join users u on u.id = r.recorded_by
               where r.org_id = ${ctx.orgId} and r.status = 'available' order by r.recorded_at desc limit ${limit}`,
  );
  return rows.map((r: Row) => ({ ...map(r), patientName: `${r.given_name} ${r.family_name}`, patientRef: r.synthetic_ref }));
}
