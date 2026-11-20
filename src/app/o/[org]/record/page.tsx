import { Recorder } from "@/components/recorder";
import { PageHeader } from "@/components/ui";
import { requireOrg, requirePagePermission } from "@/server/authz";
import { getOrgSettings } from "@/server/services/recordings";

export const metadata = { title: "Record a new patient" };

/** New patient: details are only held in the browser until upload; the patient is created with the consent confirmation. */
export default async function NewPatientRecordPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "recording:create");
  await requirePagePermission(ctx, "patient:write");
  const limits = await getOrgSettings(ctx);
  return (
    <>
      <PageHeader title="Record a new patient" subtitle="Consent is confirmed before the patient is added to PreVid." />
      <Recorder slug={ctx.orgSlug} limits={{ maxDurationSec: limits.maxDurationSec, maxFileBytes: limits.maxFileBytes }} />
    </>
  );
}
