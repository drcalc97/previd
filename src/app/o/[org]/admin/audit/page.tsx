import { PageHeader, Table, Td, Th, Badge } from "@/components/ui";
import { requireOrg, requirePagePermission } from "@/server/authz";
import { listAudit } from "@/server/services/admin";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "admin:audit");
  const rows = await listAudit(ctx, { limit: 200 });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Most recent 200 events. Records contain identifiers only — never patient names or free text." />
      <Table caption="Audit events">
        <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Outcome</Th><Th>Target</Th><Th>Details</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDateTime(r.occurredAt)}</Td>
              <Td>{r.actor ?? "—"}</Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td><Badge tone={r.outcome === "success" ? "ok" : "warn"}>{r.outcome}</Badge></Td>
              <Td className="font-mono text-xs">{r.targetType ? `${r.targetType} ${r.targetId?.slice(0, 8) ?? ""}` : "—"}</Td>
              <Td className="font-mono text-xs">{Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
