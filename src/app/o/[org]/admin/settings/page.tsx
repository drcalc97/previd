import { PageHeader } from "@/components/ui";
import { requireOrg, requirePagePermission } from "@/server/authz";
import { getOrgSettings } from "@/server/services/recordings";
import { SettingsForm } from "./form";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "admin:settings");
  const s = await getOrgSettings(ctx);
  return (
    <>
      <PageHeader title="Organisation settings" subtitle="Retention and recording limits for this organisation." />
      <SettingsForm slug={ctx.orgSlug} initial={{ retentionDays: s.retentionDays, maxDurationSec: s.maxDurationSec, maxFileMb: Math.round(s.maxFileBytes / 1024 / 1024) }} />
    </>
  );
}
