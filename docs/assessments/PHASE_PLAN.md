# Physical Performance Assessment module — phased plan (FOR APPROVAL)

Status: **PLAN. No module code has been written.** Companion documents: `VIDEO_TIMING.md` (design + feasibility spike), `PROTOCOLS.md` / `SCORING.md` / `REFERENCES.md` (Agent 1; compiled from web-search summaries only — **primary sources could not be fetched (network blocked), so nothing is verified against primary text**; requires clinician verification), `CLINICAL_SAFETY.md` + `SECURITY_REVIEW_PLAN.md` + `governance/13-…` (Agent 5, draft).
This is not clinical validation, not a regulatory assessment, and PreVid will not interpret results (no frailty/risk categories, no AI).

## 1. What exists today (inspected)
Next.js 16 App Router modular monolith; Postgres with RLS driven by per-transaction session settings; composite `(org_id, id)` FKs; roles `org_admin` / `clinician` / `mdt_reviewer`; ports for identity/storage (local dev adapters now, Supabase next — `docs/SUPABASE_PLAN.md`); `recordings` (consent per recording, identity checks, signed upload, 120 s signed playback, retention, audit); `audit_events` (append-only, IDs only); patients exist only with a recording (ADR-017); Recorder, Player, PatientBanner, design system; Vitest + RLS tests + Playwright (desktop/mobile, axe).
**Reused as-is:** recording/upload/playback pipeline, patient banner, permission matrix pattern, `withOrg` + RLS pattern, audit, design system, test harness. **Extended:** recorder (stopwatch overlay), Player (frame editor), patient page (assessment tab), permissions, seed.

## 2. Team and file ownership (specialist subagents; orchestrator integrates and merges)
| Agent | Owns (exclusive write) | Notes |
|---|---|---|
| 1 Clinical Assessment & Protocol | `docs/assessments/PROTOCOLS.md`, `SCORING.md`, `REFERENCES.md` | Research draft only, **UNVERIFIED against primary sources**; clinician verification outstanding; DASI licensing unresolved |
| 2 Frontend/UX | `src/app/o/[org]/patients/[id]/assessments/**`, `src/components/assessments/**` | Hub, wizards, results, timeline |
| 3 Video Processing | `src/lib/timing/**`, `src/components/timing/**`, `tests/fixtures/video/**` | Pure libs + TimingEditor |
| 4 Backend/DB | `db/migrations/0004+…`, `src/server/services/assessments/**`, `src/domain/assessments/**`, API routes | Scoring is pure code in `src/domain` |
| 5 Security & Clinical Safety | `docs/assessments/CLINICAL_SAFETY.md`, `SECURITY_REVIEW_PLAN.md`, `governance/13…`, security tests | Veto on open Critical/High |
| 6 QA | `tests/assessments/**`, e2e specs | Calculation fixtures come from `SCORING.md` worked examples |
| Orchestrator | `src/domain/permissions.ts`, ports, ADRs, integration | Avoids concurrent edits to shared files |

## 3. Design decisions (each becomes an ADR)
- **ADR-018 Assessment framework.** Protocols are *versioned, immutable records* (`assessment_protocols`: code, version, status, spec JSON incl. distance/course length/start-stop wording, source references). A patient assessment always points at one protocol version. Scoring lives in **pure, versioned TypeScript** (`src/domain/assessments/*`), stored result keeps `scoring_version` + the **inputs**, so any number can be recomputed and traced. Adding a test = new definition + protocol + scorer + wizard.
- **ADR-019 Timing.** See `VIDEO_TIMING.md`: PTS-index based frame navigation (container demux, play-through fallback, verified seek), monotonic stopwatch, integer-microsecond arithmetic, honest resolution, fallback banner, never `currentTime ± 1/fps`.
- **ADR-020 Append-only measurements.** Confirmed `timing_measurements` and results are immutable; amendments are new versions with reason code + `supersedes_id`; a **hash-chained, append-only `assessment_events`** table (DB trigger computes `sha256` chain per assessment) gives tamper-evidence for this module (also a template for SEC-017).
- **ADR-021 Encounters and consent.** See Decision D1 below.
- **ADR-022 No interpretation.** Results are displayed as measured values with units and protocol; no categories, thresholds or "risk" wording; derived quantities (SPPB total, DASI score, VO2peak estimate) are labelled "calculated" with the formula and source.

## 4. Data model (new migrations; adapted to the current schema)
All tenant tables carry `org_id`, composite FKs `(org_id, …)`, RLS via `app_is_member`, role-scoped writes, immutability triggers where stated. Global reference tables are read-only to the app role.
| Table | Purpose / key columns |
|---|---|
| `assessment_definitions` (global) | `code` (tug, sts5, gait4m, sppb, sixmwt, dasi), name, `kind` (timed / composite / counted_timed / questionnaire), category `core`/`additional` |
| `assessment_protocols` (global, immutable once active) | definition, `version`, `status`, `spec` JSON (params, instructions, start/stop event wording, equipment), reference ids, `scoring_version` |
| `assessment_encounters` | org, patient, created_by, `consent_confirmed_at/by` (see D1), started_at, status |
| `patient_assessments` | org, encounter, patient (composite FK), protocol, assessor, status (`in_progress` / `completed` / `incomplete` / `unable_to_perform` / `void`), `performed_at`, `primary_value numeric` + `unit`, `scoring_version`, `conditions` JSON (aid, assistance, footwear, chair, course…), `deviation_codes text[]`, `reason_code`, short optional note (length-capped, never in audit metadata) |
| `assessment_components` | SPPB components, DASI item responses, STS rep counts, 6MWT summary fields (typed key/value + optional link to a measurement) |
| `assessment_marks` | 6MWT laps / rests / stops with elapsed seconds; STS manual rep marks |
| `assessment_recordings` | link table `assessment_id ↔ recording_id` (+ role) — **reuses the existing recordings/storage**; no second video store |
| `timing_measurements` (append-only versions) | assessment, recording?, `segment_key`, `method`, start/end PTS (numeric, ≥6 d.p.), start/end frame index, `elapsed_seconds`, `resolution_seconds`, `frame_accuracy`, media fingerprint, `index_method`, `version`, `supersedes_id`, status draft/confirmed/superseded, `confirmed_by/at`, `amend_reason_code` |
| `assessment_events` (append-only, hash-chained) | org, assessment, actor, `action` code, `previous_value`/`new_value` JSON (numbers/codes only), `prev_hash`, `hash`, `occurred_at` |
Existing `audit_events` additionally records *views* (assessment opened, video played in editor). Retention: assessments follow the patient's recordings policy; **open question D8**.

## 5. Permissions (extends the matrix)
`assessment:read` (all roles) · `assessment:write` (clinician, org_admin) · `assessment:confirm` (clinician, org_admin) · `assessment:amend` (clinician who confirmed, org_admin — **D4**) · `assessment:void` (clinician own, org_admin) · reviewers read-only. Enforced in services (`requirePermission`), RLS, and tested for escalation/IDOR/cross-tenant.

## 6. User experience
Patient page → **Assessments**: three large **core** cards (TUG, 5×STS, 4 m gait speed) and an expandable **More assessments** (SPPB, 6MWT, DASI). Start an *encounter*, tick one or more tests; each runs a wizard: *safety prompt (never a substitute for clinical judgement/local policy) → conditions (aid, assistance, chair, footwear, course) → standard instructions → [record + live stopwatch] → timing (frame editor or stopwatch/manual) → deviations/incomplete/unable → review → confirm*. Results page shows name, date, assessor, protocol + version, primary result + units, status, conditions, deviations, video, markers, amendment history. Patient **timeline** and a simple SVG **longitudinal chart** only for *comparable* protocols (same protocol code, version family and key parameters); otherwise a visible warning. Mobile-first recording; accessible touch/keyboard controls; no AI counting or crossing detection.

## 7. Phases, exit criteria and tests
| Phase | Scope | Exit criteria |
|---|---|---|
| **0 (now)** | Plan, protocol research draft, hazard/regulatory draft, timing spike | Your approval + decisions D1–D8 |
| **1** | `src/lib/timing` (demuxers, index, markers, stopwatch, stepper) + `<TimingEditor>` on a standalone demo page with synthetic videos (no DB) | Unit tests for demux/markers/elapsed/stopwatch; Chromium frame-landing tests on every frame; reopen/amend UI logic; fallback banner; a11y; **documented limits**; real-device test plan |
| **2** | Migrations + services + APIs for encounter/assessment/measurement/events; TUG, 5×STS, 4 m gait speed end-to-end (stopwatch + frame timing, conditions, deviations, incomplete/unable, results page) | Calculation unit tests from `SCORING.md`; RLS + cross-tenant + privilege tests; amendment immutability and hash-chain tests; e2e desktop+mobile |
| **3** | SPPB (official scoring), 6MWT (countdown, laps, rests, early stop), DASI (**gated by licensing, see D3**) | Scoring fixtures incl. edge cases; incomplete-component handling; no cross-use of standalone and SPPB components unless protocols match |
| **4** | Patient assessment timeline + longitudinal chart + comparability warnings | Chart/comparability tests; accessibility |
| **5** | Security re-review (Agent 5), full test run, docs (`OVERVIEW`, `PROTOCOLS`, `SCORING`, `VIDEO_TIMING`, `VALIDATION`, `REFERENCES`, `CLINICAL_SAFETY`), updated hazard log | No open Critical/High; honest report of untested items |
Each milestone ends with: features, tests run/not run, security findings, clinical-safety concerns, outstanding work, costs (none expected: all processing is in the browser; no paid AI, no external vision APIs, no GPU), decisions. Own PR per milestone once a base branch exists.

## 8. Decisions I need from you
- **D1 — Consent and patient existence for assessments without video (important).** Today a patient exists only because of a consented recording (ADR-017). DASI, manual-entry or stopwatch-only assessments would have no recording. **Proposal:** consent is confirmed once at the start of an *assessment encounter* (with or without video); a patient is created only at that point; a patient's identity is kept while they have ≥1 live recording **or** live assessment, and scrubbed when neither remains. This amends ADR-017 and needs IG review.
- **D2 — Protocol variants** (TUG start/stop event, gait-speed start type, walking-aid rules, number of trials, which trial counts). Agent 1's table lists the choices; a clinician (you) must pick, and a second clinician should review.
- **D3 — DASI wording/licence.** If the item wording cannot be legally reproduced I will stop and flag it (not invent wording); the DASI scoring/estimate code can still be built and tested.
- **D4 — Who may amend a confirmed measurement** (proposal: the confirming clinician and org admins; reviewers never; every amendment needs a reason code).
- **D5 — Free-text notes** on assessments: allow short capped notes (PHI risk, never audited) or codes only?
- **D6 — Chart implementation:** custom SVG (no dependency) vs small charting library (proposal: custom SVG).
- **D7 — Browser/device support policy** and who will test on real iPhone/Android (needs a hosted preview — depends on the Supabase milestone).
- **D8 — Retention** of assessments vs recordings, and **per-protocol recording length** (6MWT needs > 6 min; today's org default is 3 min; the schema allows up to 15 min).
- **D9 — Order with the Supabase milestone.** Phase 1 does not depend on Supabase and can start straight away; Phases 2+ can run on the local adapters, but real-device video testing needs the hosted preview.

## 9. Risks
Frame-accurate timing across browsers/containers (spike: promising in Chromium, unknown on Safari); VFR and dropped frames; protocol ambiguity (start/stop events); scope (six tests) — core three first; regulatory qualification once calculated clinical scores/estimates/trends are shown (flagged in `governance/13`); DASI licence; human-judged markers limit accuracy; the module increases the amount of derived clinical data that must be kept traceable.
