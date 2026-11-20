import Link from "next/link";
import { notFound } from "next/navigation";
import { addPatientAction, addPlaceholderAction, removePatientAction, removePlaceholderAction } from "@/app/actions/mdt";
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
}: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ p?: string; r?: string; x?: string }> }) {
  const { org, id } = await params;
  const sp = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireOrg(org);
  let m;
  try { m = await getMeeting(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const base = `/o/${ctx.orgSlug}/mdt/${id}`;

  // One ordered discussion list. Patients appear only with a PreVid recording; a placeholder says only "No PreVid for patient N".
  const current =
    m.items.find((i) => (sp.x ? i.kind === "placeholder" && i.id === sp.x : i.kind === "patient" && i.patient.patientId === sp.p)) ?? m.items[0];
  const selected = current?.kind === "patient" ? current.patient : undefined;
  const rec = selected?.recordings.find((r) => r.id === sp.r) ?? selected?.recordings[0];
  const canEdit = can(ctx.role, "mdt:write");
  // Only patients who have at least one PreVid recording can be added (ADR-016/017).
  const addable = canEdit ? (await listPatients(ctx)).filter((p) => !m.patients.some((x) => x.patientId === p.id)) : [];

  return (
    <>
      <PageHeader title={m.title} subtitle={formatDateTime(m.scheduledFor)} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Patients in this meeting" className="flex flex-col gap-3">
          <Card className="p-2 sm:p-2">
            {m.items.length === 0 ? <p className="p-2 text-muted">Nothing added yet.</p> : (
              <ol className="flex flex-col">
                {m.items.map((it) => {
                  const active = it === current;
                  const href = it.kind === "patient" ? `${base}?p=${it.patient.patientId}` : `${base}?x=${it.id}`;
                  const latest = it.kind === "patient" ? it.patient.recordings[0] : undefined;
                  return (
                    <li key={it.kind === "patient" ? it.patient.patientId : it.id}>
                      <Link href={href} aria-current={active ? "true" : undefined}
                        className={`block rounded-lg px-3 py-2 ${active ? "bg-primary text-primary-fg" : "hover:bg-slate-100"}`}>
                        {it.kind === "patient" ? (
                          <>
                            <span className="block font-medium"><span className="sr-only">Patient {it.number}: </span>{it.number}. {it.patient.familyName.toUpperCase()}, {it.patient.givenName}</span>
                            <span className={`block text-sm ${active ? "text-white/90" : "text-muted"}`}>
                              Latest video {formatDate(latest!.recordedAt)} · {it.patient.recordings.length} total
                            </span>
                          </>
                        ) : (
                          <span className="block font-medium">{it.number}. No PreVid for patient {it.number}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          {canEdit && (
            <Card className="flex flex-col gap-3 p-3 sm:p-3">
              <form action={addPlaceholderAction.bind(null, ctx.orgSlug, id)}>
                <Button type="submit" variant="secondary" className="w-full">Add &ldquo;No PreVid&rdquo; slot</Button>
                <p className="mt-1 text-xs text-muted">For a patient being discussed who has no PreVid recording. No identity is stored.</p>
              </form>
              {addable.length > 0 && (
                <form action={addPatientAction.bind(null, ctx.orgSlug, id)} className="flex flex-col gap-2">
                  <label htmlFor="patientId" className="text-sm font-medium">Add patient with a recording</label>
                  <Select id="patientId" name="patientId" required defaultValue="">
                    <option value="" disabled>Select…</option>
                    {addable.map((p) => <option key={p.id} value={p.id}>{p.familyName.toUpperCase()}, {p.givenName} ({p.syntheticRef})</option>)}
                  </Select>
                  <Button type="submit" variant="secondary">Add</Button>
                </form>
              )}
            </Card>
          )}
        </nav>

        <section aria-label="Recording review" className="min-w-0">
          {!current ? <Alert>Add patients who have a PreVid recording, or a &ldquo;No PreVid&rdquo; slot, to build the discussion list.</Alert> : current.kind === "placeholder" ? (
            <Card>
              <h2 className="text-xl font-semibold" data-testid="mdt-placeholder">No PreVid for patient {current.number}</h2>
              <p className="mt-2 text-muted">This patient has no PreVid recording, so nothing is stored about them here.</p>
              {canEdit && (
                <form action={removePlaceholderAction.bind(null, ctx.orgSlug, id, current.id)} className="mt-4">
                  <Button variant="ghost" type="submit">Remove this slot</Button>
                </form>
              )}
            </Card>
          ) : selected && (
            <>
              <PatientBanner p={{ givenName: selected.givenName, familyName: selected.familyName, dateOfBirth: selected.dateOfBirth, nhsNumber: selected.nhsNumber, syntheticRef: selected.syntheticRef }} />
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
