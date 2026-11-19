import { ageFromDob, formatDob, formatNhs } from "@/lib/format";

/** Persistent identity banner shown wherever a patient's record or video is displayed (wrong-patient control). */
export function PatientBanner({ p }: { p: { givenName: string; familyName: string; dateOfBirth: string; nhsNumber: string | null; syntheticRef: string } }) {
  return (
    <section aria-label="Patient identity" className="mb-4 rounded-xl border-2 border-primary bg-surface p-3 sm:p-4" data-testid="patient-banner">
      <p className="text-xl font-semibold">{p.familyName.toUpperCase()}, {p.givenName}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div><dt className="text-muted">Date of birth</dt><dd className="font-medium">{formatDob(p.dateOfBirth)} ({ageFromDob(p.dateOfBirth)} y)</dd></div>
        <div><dt className="text-muted">NHS number (synthetic)</dt><dd className="font-medium">{formatNhs(p.nhsNumber)}</dd></div>
        <div><dt className="text-muted">Reference</dt><dd className="font-medium">{p.syntheticRef}</dd></div>
      </dl>
    </section>
  );
}
