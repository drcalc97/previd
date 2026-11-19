import { PageHeader } from "@/components/ui";
import { requireOrg, requirePagePermission } from "@/server/authz";
import { NewPatientForm } from "./form";

export const metadata = { title: "New patient" };

export default async function NewPatientPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "patient:write");
  return (
    <>
      <PageHeader title="New patient" subtitle="Synthetic patients only in this development build." />
      <NewPatientForm slug={ctx.orgSlug} />
    </>
  );
}
