import Link from "next/link";
import { Card, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { can } from "@/domain/permissions";
import { requireOrg } from "@/server/authz";
import { listRecentRecordings } from "@/server/services/recordings";
import { formatDateTime, formatDuration } from "@/lib/format";

export const metadata = { title: "Home" };

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  const recent = await listRecentRecordings(ctx, 10);
  const base = `/o/${ctx.orgSlug}`;
  return (
    <>
      <PageHeader
        title="Home"
        actions={
          <>
            {can(ctx.role, "recording:create") && <LinkButton href={`${base}/record`}>Record a new patient</LinkButton>}
            <LinkButton href={`${base}/patients`} variant={can(ctx.role, "recording:create") ? "secondary" : "primary"}>{can(ctx.role, "recording:create") ? "Patients (record again)" : "Find a patient"}</LinkButton>
            <LinkButton href={`${base}/mdt`} variant="secondary">MDT meetings</LinkButton>
          </>
        }
      />
      <Card aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-lg font-semibold">Recent recordings</h2>
        {recent.length === 0 ? (
          <p className="text-muted">No recordings yet.</p>
        ) : (
          <Table caption="Most recent recordings">
            <thead><tr><Th>Recorded</Th><Th>Patient</Th><Th>Length</Th><Th>Recorded by</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDateTime(r.recordedAt)}</Td>
                  <Td><Link className="underline" href={`${base}/patients/${r.patientId}`}>{r.patientName}</Link> <span className="text-muted">({r.patientRef})</span></Td>
                  <Td>{formatDuration(r.durationSec)}</Td>
                  <Td>{r.recordedByName ?? "—"}</Td>
                  <Td><Link className="font-medium underline" href={`${base}/recordings/${r.id}`}>Watch<span className="sr-only"> recording of {r.patientName}</span></Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
