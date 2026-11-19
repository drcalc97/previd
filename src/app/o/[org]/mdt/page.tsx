import Link from "next/link";
import { createMeetingAction } from "@/app/actions/mdt";
import { Button, Card, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can } from "@/domain/permissions";
import { requireOrg } from "@/server/authz";
import { listMeetings } from "@/server/services/mdt";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "MDT meetings" };

export default async function MdtPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  const meetings = await listMeetings(ctx);
  const base = `/o/${ctx.orgSlug}`;
  return (
    <>
      <PageHeader title="MDT meetings" subtitle="Select a meeting to review each patient's recordings." />
      {meetings.length === 0 ? <p className="mb-6 text-muted">No meetings yet.</p> : (
        <div className="mb-6">
          <Table caption="MDT meetings">
            <thead><tr><Th>Meeting</Th><Th>Date</Th><Th>Patients</Th></tr></thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <Td><Link className="font-medium underline" href={`${base}/mdt/${m.id}`}>{m.title}</Link></Td>
                  <Td>{formatDateTime(m.scheduledFor)}</Td>
                  <Td>{m.patientCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {can(ctx.role, "mdt:write") && (
        <Card className="max-w-xl" aria-labelledby="new-mdt-h">
          <h2 id="new-mdt-h" className="mb-3 text-lg font-semibold">New meeting</h2>
          <form action={createMeetingAction.bind(null, ctx.orgSlug)} className="flex flex-col gap-3">
            <Field label="Title" htmlFor="title"><Input id="title" name="title" required maxLength={120} /></Field>
            <Field label="Date and time" htmlFor="scheduledFor"><Input id="scheduledFor" name="scheduledFor" type="datetime-local" required /></Field>
            <Button type="submit" className="self-start">Create meeting</Button>
          </form>
        </Card>
      )}
    </>
  );
}
