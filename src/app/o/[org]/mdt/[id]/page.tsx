import Link from "next/link";
import { notFound } from "next/navigation";
import { addPatientAction, removePatientAction } from "@/app/actions/mdt";
import { PatientBanner } from "@/components/patient-banner";
import { Player } from "@/components/player";
import { Alert, Button, Card, PageHeader, Select } from "@/components/ui";
import { can } from "@/domain/permissions";
import { uuid } from "@/domain/schemas";
import { NotFoundError, requireOrg } from "@/server/authz";
import { getMeeting } from "@/server/services/mdt";
import { listPatients } from "@/server/services/patients";
import { daysAgo, formatDate, formatDateTime, formatDuration } from "@/lib/format";

export const metadata = { title: "MDT review" };

export default async function MeetingPage({
  params, searchParams,
}: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ p?: string; r?: string }> }) {
  const { org, id } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireOrg(org);
  let m;
  try { m = await getMeeting(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const base = `/o/${ctx.orgSlug}/mdt/${id}`;

  const selected = m.patients.find((p) => p.patientId === sp.p) ?? m.patients[0];
  const rec = selected?.recordings.find((r) => r.id === sp.r) ?? selected?.recordings[0];
  const canEdit = can(ctx.role, "mdt:write");
  const addable = canEdit ? (await listPatients(ctx)).filter((p) => !m.patients.some((x) => x.patientId === p.id)) : [];

  return (
    <>
      <PageHeader title={m.title} subtitle={formatDateTime(m.scheduledFor)} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Patients in this meeting" className="flex flex-col gap-3">
          <Card className="p-2 sm:p-2">
            {m.patients.length === 0 ? <p className="p-2 text-muted">No patients added yet.</p> : (
              <ul className="flex flex-col">
                {m.patients.map((p) => {
                  const active = p.patientId === selected?.patientId;
                  const latest = p.recordings[0];
                  return (
                    <li key={p.patientId}>
                      <Link href={`${base}?p=${p.patientId}`} aria-current={active ? "true" : undefined}
                        className={`block rounded-lg px-3 py-2 ${active ? "bg-primary text-primary-fg" : "hover:bg-slate-100"}`}>
                        <span className="block font-medium">{p.familyName.toUpperCase()}, {p.givenName}</span>
                        <span className={`block text-sm ${active ? "text-white/90" : "text-muted"}`}>
                          {latest ? `Latest video ${formatDate(latest.recordedAt)} · ${p.recordings.length} total` : "No recordings"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {canEdit && addable.length > 0 && (
            <Card className="p-3 sm:p-3">
              <form action={addPatientAction.bind(null, ctx.orgSlug, id)} className="flex flex-col gap-2">
                <label htmlFor="patientId" className="text-sm font-medium">Add patient</label>
                <Select id="patientId" name="patientId" required defaultValue="">
                  <option value="" disabled>Select…</option>
                  {addable.map((p) => <option key={p.id} value={p.id}>{p.familyName.toUpperCase()}, {p.givenName} ({p.syntheticRef})</option>)}
                </Select>
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </Card>
          )}
        </nav>

        <section aria-label="Recording review" className="min-w-0">
          {!selected ? <Alert>Add patients to this meeting to review their recordings.</Alert> : (
            <>
              <PatientBanner p={{ givenName: selected.givenName, familyName: selected.familyName, dateOfBirth: selected.dateOfBirth, nhsNumber: selected.nhsNumber, syntheticRef: selected.syntheticRef }} />
              {selected.recordings.length === 0 ? <Alert tone="info">No recordings for this patient.</Alert> : (
                <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
                  <Card className="min-w-0">
                    {rec && (
                      <>
                        <h2 className="text-xl font-semibold" data-testid="mdt-rec-date">Recorded {formatDateTime(rec.recordedAt)}</h2>
                        <p className="mb-3 text-muted">{daysAgo(rec.recordedAt)} days ago · {formatDuration(rec.durationSec)} · by {rec.recordedByName ?? "unknown"}</p>
                        {daysAgo(rec.recordedAt) > 30 && <div className="mb-3"><Alert tone="warn" title="Older recording">Check that this still reflects the patient&apos;s current condition.</Alert></div>}
                        <Player key={rec.id} slug={ctx.orgSlug} recordingId={rec.id} label={`Recording of ${selected.givenName} ${selected.familyName}, ${formatDateTime(rec.recordedAt)}`} autoLoad />
                      </>
                    )}
                  </Card>
                  <Card className="p-3 sm:p-3" aria-labelledby="all-h">
                    <h3 id="all-h" className="mb-2 font-semibold">All recordings</h3>
                    <ol className="flex flex-col gap-1">
                      {selected.recordings.map((r) => (
                        <li key={r.id}>
                          <Link href={`${base}?p=${selected.patientId}&r=${r.id}`} aria-current={r.id === rec?.id ? "true" : undefined}
                            className={`block rounded-lg px-2 py-1.5 text-sm ${r.id === rec?.id ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}`}>
                            {formatDateTime(r.recordedAt)}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </Card>
                </div>
              )}
              {canEdit && (
                <form action={removePatientAction.bind(null, ctx.orgSlug, id, selected.patientId)} className="mt-4">
                  <Button variant="ghost" type="submit">Remove {selected.givenName} {selected.familyName} from this meeting</Button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
