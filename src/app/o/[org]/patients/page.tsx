import Link from "next/link";
import { Badge, LinkButton, PageHeader, Table, Td, Th, Input, Button } from "@/components/ui";
import { can } from "@/domain/permissions";
import { requireOrg } from "@/server/authz";
import { listPatients } from "@/server/services/patients";
import { formatDate, formatDob, formatNhs } from "@/lib/format";

export const metadata = { title: "Patients" };

export default async function PatientsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const { q = "" } = await searchParams;
  const ctx = await requireOrg(org);
  const patients = await listPatients(ctx, q);
  const base = `/o/${ctx.orgSlug}`;
  return (
    <>
      <PageHeader title="Patients" actions={can(ctx.role, "patient:write") && <LinkButton href={`${base}/patients/new`}>New patient</LinkButton>} />
      <form role="search" className="mb-4 flex gap-2" action="">
        <label htmlFor="q" className="sr-only">Search patients by name, reference or NHS number</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search by name, reference or NHS number" className="max-w-md" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {patients.length === 0 ? (
        <p className="text-muted">No patients found.</p>
      ) : (
        <Table caption="Patients">
          <thead><tr><Th>Name</Th><Th>Date of birth</Th><Th>NHS number (synthetic)</Th><Th>Reference</Th><Th>Recordings</Th></tr></thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <Td><Link className="font-medium underline" href={`${base}/patients/${p.id}`}>{p.familyName.toUpperCase()}, {p.givenName}</Link></Td>
                <Td>{formatDob(p.dateOfBirth)}</Td>
                <Td>{formatNhs(p.nhsNumber)}</Td>
                <Td>{p.syntheticRef}</Td>
                <Td>
                  {p.recordingCount ? <><Badge tone="ok">{p.recordingCount}</Badge> <span className="text-muted">latest {formatDate(p.latestRecordingAt!)}</span></> : <span className="text-muted">None</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
