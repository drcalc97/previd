> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 01 — Intended Purpose

## 1. Statement (draft)

PreVid is a secure web application that allows authorised healthcare professionals to record short video clips (maximum 3 minutes, 150 MB) of a patient during preoperative assessment, and allows authorised colleagues to view those clips in multidisciplinary team (MDT) meetings. The video gives a **visual impression of appearance, mobility and functional status** to **supplement** written clinical information.

PreVid does **not** replace formal preoperative assessment and does **not** determine or indicate surgical fitness. **[External review]** Wording must be agreed with the CSO and checked against the medical device questions in 11.

## 2. What PreVid does not do

- No AI or algorithmic interpretation of video, audio or metadata.
- No frailty scoring, diagnosis, triage, risk prediction or recommendation.
- No automatic clinical alerts or decision support.
- No integration with EPR/PAS in the MVP (patient records are entered in PreVid) **[Assumption]**.
- No patient-facing access in the MVP **[Assumption]**.

## 3. Users and roles

| Role | Permitted actions (designed) | Notes |
|---|---|---|
| org_admin | Manage users, settings, retention; view audit; view video | Can view video, so is a clinical-data user. Should be a governed role. **[Planned]** |
| clinician | Manage patients, record, view | Responsible for identity check and consent before recording **[Planned]** |
| mdt_reviewer | Read-only view | Cannot record or delete **[Planned]** |

Each NHS Trust is one organisation (tenant) with its own users, patients, videos, settings, retention and audit records. **[Planned]** Shared database with row-level security (RLS) plus application-level authorisation.

## 4. Intended setting and workflow

1. Clinician selects patient in their organisation.
2. Identity-verification step: clinician confirms name and DOB/NHS number against the patient record. **[Planned]**
3. Consent/appropriateness confirmation (mechanism TBD). **[External review]**
4. Record in browser (getUserMedia/MediaRecorder); upload to private storage. **[Planned]**
5. MDT reviewer or clinician plays video via short-lived signed URL (60–300 s) with persistent patient banner. **[Planned]**
6. Video retained per organisation retention setting, then purged. **[Planned]**

## 5. Known limitations (to be stated in user-facing information)

- Video is a snapshot at one time and context; it can become out of date after clinical change.
- Video quality depends on lighting, framing, audio and device; it can mislead.
- Browser recording cannot guarantee zero local persistence on the device. iOS Safari records MP4; Chromium records WebM; some in-app browsers are unsupported. **[Planned]** support matrix.
- Not suitable as sole basis for any clinical decision.
- Availability is not guaranteed; MDT must not depend solely on PreVid.

## 6. Out of scope until separately approved

Real patient data; emergency or time-critical use; paediatric or vulnerable-adult use without specific governance; use outside England; patient-held recordings; any AI feature. **[NHS approval]**

## 7. Open points

| # | Point | Owner |
|---|---|---|
| 1 | Final intended-purpose wording and medical device conclusion | CSO / regulatory consultant **[External review]** |
| 2 | Is the video part of the clinical record? Who is the record owner? | Trust IG / records manager **[NHS approval]** |
| 3 | Consent model (explicit consent vs other basis) and how recorded | DPO / CSO **[External review]** |
| 4 | Which patient groups are excluded (e.g. lacking capacity, children) | CSO / Trust **[External review]** |
