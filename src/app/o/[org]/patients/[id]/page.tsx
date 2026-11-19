import Link from "next/link";
import { notFound } from "next/navigation";
import { archivePatientAction } from "@/app/actions/patients";
import { PatientBanner } from "@/components/patient-banner";
import { Alert, Badge, Button, Card, LinkButton } from "@/components/ui";
import { can } from "@/domain/permissions";
import { uuid } from "@/domain/schemas";
import { NotFoundError, requireOrg } from "@/server/authz";
import { getPatient } from "@/server/services/patients";
import { listRecordingsForPatient } from "@/server/services/recordings";
import { daysAgo, formatDateTime, formatDuration } from "@/lib/format";

export const metadata = { title: "Patient" };

export default async function PatientPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireOrg(org);
  let patient;
  try {
    patient = await getPatient(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const recordings = can(ctx.role, "recording:read") ? await listRecordingsForPatient(ctx, id) : [];
  const base = `/o/${ctx.orgSlug}`;
  return (
    <>
      <PatientBanner p={patient} />
      {patient.archivedAt && <Alert tone="warn">This patient is archived.</Alert>}
      <div className="my-4 flex flex-wrap gap-2">
        {can(ctx.role, "recording:create") && !patient.archivedAt && (
          <LinkButton href={`${base}/patients/${id}/record`}>Record new video</LinkButton>
        )}
        <LinkButton href={`${base}/patients`} variant="secondary">Back to patients</LinkButton>
        {can(ctx.role, "patient:write") && !patient.archivedAt && (
          <form action={archivePatientAction.bind(null, ctx.orgSlug, id)}><Button variant="secondary" type="submit">Archive patient</Button></form>
        )}
      </div>
      <Card aria-labelledby="timeline-h">
        <h2 id="timeline-h" className="mb-3 text-lg font-semibold">Recording timeline</h2>
        {recordings.length === 0 ? (
          <p className="text-muted">No recordings for this patient yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {recordings.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="font-semibold">{formatDateTime(r.recordedAt)} <span className="font-normal text-muted">· {daysAgo(r.recordedAt)} days ago</span></p>
                  <p className="text-sm text-muted">{formatDuration(r.durationSec)} · recorded by {r.recordedByName ?? "unknown"}</p>
                </div>
                {r.status === "available" ? (
                  <Link href={`${base}/recordings/${r.id}`} className="font-medium underline">Watch<span className="sr-only"> recording from {formatDateTime(r.recordedAt)}</span></Link>
                ) : (
                  <Badge tone="warn">Upload incomplete</Badge>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
