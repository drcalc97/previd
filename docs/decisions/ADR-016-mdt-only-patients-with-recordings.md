# ADR-016 MDT lists show only patients who have PreVid recordings

Status: Accepted (owner decision, 2026-11-20)

## Context
PreVid has no basis to display or hold the identity (even the name) of a patient who has not consented to being recorded. MDT screens must therefore not list patients without a PreVid video.

## Decision
- An MDT list/viewer shows a patient only while they have at least one `available` recording. Patient counts on the meeting list use the same rule.
- Only patients with an available recording can be added to a meeting (enforced server-side in `addPatientToMeeting`, not just in the UI).
- If a patient's last recording is deleted or purged, they disappear from MDT views automatically (the link row is retained but hidden).
- The seed data creates an empty MDT list.

## Consequences
The broader principle — PreVid should not store identities of people without recording consent — also bears on the Patients screen and on *when* a patient record is created (currently before recording, via "New patient", and visible to all clinicians in the organisation). **Open question for the owner / IG lead:** capture consent before creating the patient record, and/or only create the patient at the moment of the first recording; decide what happens to a patient record when its last recording is deleted (retain, anonymise, or delete). See `governance/12-questions-for-professional-review.md`.
