import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { Recorder } from "@/components/recorder";
import { uuid } from "@/domain/schemas";
import { NotFoundError, requireOrg, requirePagePermission } from "@/server/authz";
import { getPatient } from "@/server/services/patients";
import { getOrgSettings } from "@/server/services/recordings";

export const metadata = { title: "Record video" };

export default async function RecordPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "recording:create");
  let patient;
  try {
    patient = await getPatient(ctx, id, { auditView: false });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  if (patient.archivedAt) return <Alert tone="warn">This patient is archived and cannot be recorded.</Alert>;
  const limits = await getOrgSettings(ctx);
  return (
    <Recorder
      slug={ctx.orgSlug}
      patient={{ id: patient.id, givenName: patient.givenName, familyName: patient.familyName, dateOfBirth: patient.dateOfBirth, nhsNumber: patient.nhsNumber, syntheticRef: patient.syntheticRef }}
      limits={{ maxDurationSec: limits.maxDurationSec, maxFileBytes: limits.maxFileBytes }}
    />
  );
}
