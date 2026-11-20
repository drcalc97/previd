# Product specification (MVP)

**Intended purpose (draft):** let authorised healthcare professionals record short videos of patients during preoperative assessment and
review them in MDT discussions, to supplement written information with a visual impression of appearance, mobility and function.
Out of scope: AI interpretation, frailty scoring, diagnosis, risk prediction, EPR integration, real patient data.

## Personas
- **Pre-op clinician (nurse/doctor):** records on a phone/tablet in a busy clinic; needs speed and certainty the right patient is recorded.
- **MDT reviewer (consultant anaesthetist/surgeon):** reviews at a desk/meeting-room screen; needs the right patient, clear dates, quick access.
- **Organisation admin (Trust IT/governance):** manages users, retention, audits access.

## Core workflow
Sign in (+MFA) → **new patient**: enter details (held only in the browser) → **confirm consent** and identity (name, DOB, NHS no. each ticked) → camera → record (≤ 3 min) → review → confirm & upload (progress, retry) → "Recording saved" → patient record with timeline. A patient is created on the server only at that moment. Further recordings of an existing patient also require a fresh consent confirmation. Patients exist only while they have a recording (their identity is scrubbed when the last one is deleted/purged).

**MDT:** the discussion list shows only patients with a PreVid recording, plus identity-free "No PreVid for patient N" slots numbered by discussion order.

## User stories & acceptance criteria (abridged)
| Story | Acceptance |
|---|---|
| Record a patient | Cannot reach the camera until consent AND every displayed identifier are ticked; a new patient exists on the server only after upload;  recording auto-stops at the org limit; no save to photo library; confirmation only after the server verifies the file. |
| Recover from poor connectivity | Failed upload keeps the local copy, shows a plain message and Retry; retries never create duplicates. |
| Review at MDT | Patient list shows latest video date; viewer shows patient banner, recording date/age, older-than-30-days warning, all recordings newest first. |
| Least privilege | Reviewers cannot create/record/edit; clinicians cannot administer; admins can view video (owner decision); every denial is audited and shows a 404. |
| Retention | Recordings are removed after the org's retention period; deletions require a reason; all audited. |
| Accessibility | Keyboard operable, labelled controls, 44 px targets, axe clean on all screens (automated only). |

## Foreseeable workflow errors (see `governance/02-clinical-hazard-log.md`)
Wrong patient recorded or reviewed; stale video relied on; video used as sole basis for fitness; poor lighting/audio; unnoticed failed upload; consent not
confirmed; device retains local copy; real data entered into a synthetic build.

## Open product questions
Final consent wording and evidence/withdrawal model (draft only; IG review needed); whether to show patient-level "latest recording older than X" warnings in worklists; MDT list creation workflow with the real service;
who may delete other people's recordings; export/download policy (currently no download control).
