# ADR-017 Consent is confirmed at every recording; a patient is created only at that moment

Status: Accepted (owner decision, 2026-11-20). Supersedes the "New patient" screen. Builds on ADR-016.

## Context
PreVid must not hold the identity of anyone who has not consented to being recorded. Earlier builds let clinicians create patient records before any recording.

## Decision
- There is no standalone "create patient". A new patient's details are entered in the recorder and held **only in the browser** until upload. Cancelling stores nothing.
- Every recording requires an explicit consent confirmation (`consentConfirmed: true` is a literal in the API schema). The server stores `consent_confirmed_at/by` on the recording (NOT NULL, immutable). Consent is confirmed for each recording, including further recordings of an existing patient.
- A new patient is inserted in the same transaction as the pending recording (audited `patient.create`, with `recording.init` carrying `consent: true`). A duplicate reference is refused.
- Patient lists and pages only show patients with a live recording. When a patient has no `available` or `pending_upload` recording left (deleted, purged, failed or abandoned upload) the database scrubs their identity: name and reference replaced, DOB set to 1900-01-01, NHS number removed, row archived (`patient_scrub_if_unused` / system sweep). The row remains only because tombstoned recording metadata references it.
- MDT lists may contain identity-free placeholders ("No PreVid for patient N", N = position in the discussion order). The placeholder table has no patient columns.

## Consequences
- The consent wording in the UI is a **draft awaiting IG review**; consent withdrawal, who may record on a patient's behalf, and a printable/consent-evidence record are open questions (governance/12).
- Seeded demo patients each have a recording.
- Scrubbing is irreversible and is a new SECURITY DEFINER code path that has not been independently reviewed.
