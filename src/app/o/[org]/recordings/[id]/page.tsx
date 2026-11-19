import { notFound } from "next/navigation";
import { deleteRecordingAction } from "@/app/actions/recordings";
import { PatientBanner } from "@/components/patient-banner";
import { Player } from "@/components/player";
import { Alert, Button, Card, LinkButton, Select } from "@/components/ui";
import { can, } from "@/domain/permissions";
import { DELETE_REASONS, uuid } from "@/domain/schemas";
import { NotFoundError, requireOrg } from "@/server/authz";
import { getPatient } from "@/server/services/patients";
import { getRecording } from "@/server/services/recordings";
import { daysAgo, formatDateTime, formatDuration } from "@/lib/format";

export const metadata = { title: "Recording" };
const REASON_LABELS: Record<string, string> = {
  wrong_patient: "Recorded against the wrong patient",
  poor_quality: "Poor quality",
  recorded_in_error: "Recorded in error",
  admin_request: "Administrative request",
};

export default async function RecordingPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireOrg(org);
  let rec, patient;
  try {
    rec = await getRecording(ctx, id);
    patient = await getPatient(ctx, rec.patientId, { auditView: false });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const age = daysAgo(rec.recordedAt);
  const canDelete = can(ctx.role, "recording:delete_any") || (can(ctx.role, "recording:delete_own") && rec.recordedBy === ctx.userId);
  const reasons = DELETE_REASONS.filter((r) => r !== "admin_request" || can(ctx.role, "recording:delete_any"));
  return (
    <>
      <PatientBanner p={patient} />
      <Card>
        <h1 className="text-2xl font-semibold" data-testid="recording-date">Recorded {formatDateTime(rec.recordedAt)}</h1>
        <p className="mb-3 text-muted">{age === 0 ? "Today" : `${age} day${age === 1 ? "" : "s"} ago`} · {formatDuration(rec.durationSec)} · by {rec.recordedByName ?? "unknown"}</p>
        {age > 30 && (
          <div className="mb-3"><Alert tone="warn" title={`This recording is ${age} days old`}>The patient&apos;s condition may have changed since. Do not rely on it alone — check current clinical information.</Alert></div>
        )}
        <Player key={rec.id} slug={ctx.orgSlug} recordingId={rec.id} label={`Recording of ${patient.givenName} ${patient.familyName}, ${formatDateTime(rec.recordedAt)}`} autoLoad />
        <p className="mt-3 text-sm text-muted">Supplements written clinical information only. It does not replace formal preoperative assessment or determine fitness for surgery.</p>
      </Card>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <LinkButton href={`/o/${ctx.orgSlug}/patients/${patient.id}`} variant="secondary">Back to patient</LinkButton>
        {canDelete && (
          <form action={deleteRecordingAction.bind(null, ctx.orgSlug, rec.id, patient.id)} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-sm font-medium">Delete this recording
              <Select name="reason" required defaultValue="" className="mt-1 min-w-64">
                <option value="" disabled>Select a reason…</option>
                {reasons.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
              </Select>
            </label>
            <Button type="submit" variant="danger">Delete</Button>
          </form>
        )}
      </div>
    </>
  );
}
