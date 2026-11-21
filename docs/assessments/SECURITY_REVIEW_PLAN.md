> **DRAFT security review plan. It does not claim that PreVid or this module is secure, validated, compliant or certified.** Nothing described as a control here has been built and tested for this module unless explicitly tagged **[Implemented]**; passing tests is not evidence of security.

Legend: **[Implemented]** built and verified (as recorded in the existing findings register) · **[Planned]** designed/not built · **[Assumption]** unconfirmed · **[External review]** needs an independent party · **[NHS approval]** needs adopting-organisation sign-off.

# Physical Performance Assessment module: security review plan

Scope: threat considerations and a test plan for the assessment, timing-marker, result and audit-history features, before and after they are built. Companion: `docs/assessments/CLINICAL_SAFETY.md` (PPA hazards), `governance/13-physical-performance-regulatory-considerations.md`, `docs/security/THREAT_MODEL.md`, `docs/security/FINDINGS_REGISTER.md` (SEC-xxx), `SECURITY_REQUIREMENTS.md`, ADR-014/016/017. Synthetic data only. Findings from the register are cited, not re-stated in full.

## 1. What is new and what it inherits

**Inherited, as recorded by the existing review (not independently re-reviewed after fixes):** RLS on tenant tables with the non-owner `previd_app` role; `withOrg`/`requireOrg`/`requirePermission`; composite FKs `(org_id, id)`; signed short-lived playback URLs; append-only audit for the app role (SELECT + INSERT); idempotent upload with mismatch check (SEC-018); freeze trigger on recording identity columns (SEC-014); patient scrub (ADR-017, `patient_scrub_if_unused`, **not independently reviewed**).

**New attack surface for this module:** assessment rows, timing marks, measurement versions, deviation records, protocol/scoring versions, DASI responses, a video editor that issues many signed-URL/Range requests, chart queries that read many rows, and an audit trail of timing changes that carries integrity meaning (a clinical record, not just access logging).

**New assets (add to threat model section 1):** integrity of confirmed measurements; integrity of the history of amendments; the link between a measurement and the exact video it was derived from; questionnaire responses (health data); scoring and protocol definitions.

**Additional actors:** A3 (malicious or careless in-tenant clinician) gains importance: the harm is falsified or altered measurements, not just disclosure. A4 (org admin, ADR-014) can view/delete video: decide whether they may amend or confirm results. A6 (DB owner/insider) matters for audit tamper-evidence (SEC-017).

## 2. Tenant isolation for assessments, timing and audit events

| # | Consideration | Requirement | Tag |
|---|---|---|---|
| T1 | Every new table (`assessments`, `assessment_measurements`, `assessment_timing_events`, `assessment_deviations`, `assessment_responses` or equivalents) has `org_id NOT NULL`, RLS enabled and forced for the app role, and policies using `app_is_member(org_id, roles)`; unset GUC yields no rows (as for existing tables) | Pattern exists for the 9 existing tables | **[Planned]** for the new tables; pattern **[Implemented]** |
| T2 | Composite FKs `(org_id, patient_id)`, `(org_id, recording_id)`, `(org_id, assessment_id)` on every child table so a row cannot reference another tenant's parent even for the owner role (ADR-006) | Same pattern | **[Planned]** |
| T3 | Child tables repeat `org_id` and the services always add `org_id` from the `OrgContext` in WHERE and INSERT; never accept an org id from the client | Rule 2 in `CLAUDE.md` | **[Planned]** |
| T4 | Timing events and audit events for an assessment must be readable only within the org; the unauthenticated NULL-org audit rows are not mixed with assessment events (SEC-016) | Audit rows for assessment actions always have `org_id` | **[Planned]** |
| T5 | Chart/timeline queries filter by `org_id` AND `patient_id` AND membership; no cross-patient aggregation endpoints; no "all assessments" listing without pagination and caps | Prevent bulk read (SEC-015 pattern) | **[Planned]** |
| T6 | `SECURITY DEFINER` functions added for scrub/retention of assessment data follow the SEC-011 fix (`search_path = pg_catalog, public, pg_temp`), are narrowly scoped, and re-check state themselves; the SEC-013 concern (cross-tenant callable by any app session) must not be repeated | Reuse the pattern, add regression test | **[Planned]**; SEC-013 still **Open** |
| T7 | Scrub/delete of assessment data when a patient is scrubbed (ADR-017) is part of the same transaction/sweep; test that no derived data referencing identity survives | PPA-H22 | **[Planned]** |
| T8 | A multi-org user: the assessment's org is determined by the row, not by the user's current UI org; links and ids from one org yield the uniform 404 in another (ADR-015) | Uniform 404 | **[Planned]** |

## 3. Authorisation per role

Proposed matrix (a **[Planned]** starting point for the owner/CSO to decide; not implemented). Roles from `governance/01`: org_admin, clinician, mdt_reviewer.

| Action | clinician | mdt_reviewer | org_admin | Notes |
|---|---|---|---|---|
| Create assessment (inside recording flow) | Yes | No | Decision needed | Admin is a governed clinical-data role (ADR-014); safer default: no |
| Run live stopwatch / enter outcome | Yes (own recording) | No | No | |
| Mark / edit timing (draft) | Yes (own assessment) | No | No | "Own" = the recording's `recorded_by`; decide whether other clinicians in the org may mark |
| Confirm measurement | Yes (marker) | No | No | Optional second-person confirmation policy **[External review]** |
| Amend a confirmed measurement | Yes with reason code (decision: only author, or any clinician?) | No | No | Creates a new version; never in-place |
| Void an assessment | Yes with reason | No | Decision needed | Void is a state, not a delete |
| View results, history, chart | Yes | Yes (read-only) | Yes | Reviewer sees amendments and history |
| View video in editor | Yes | Yes (view only, no marker tools) | Yes | Playback audited at mint |
| Delete video | Existing rule | No | Yes (ADR-014) | Consequence for results: PPA-H26 |
| Export | Decision needed (recommend none in first release) | No | No | PPA-H23 |
| View audit | No | No | Yes (existing) | |

Rules for implementation:

- Each service function calls `requirePermission` with a **new, separately named permission** per action (`assessment.create`, `assessment.mark`, `assessment.confirm`, `assessment.amend`, `assessment.void`, `assessment.view`); adding to `src/domain` permission matrix with unit tests (extend `tests/unit/permissions.test.ts`). **[Planned]**
- Pages use `requirePagePermission` (404 on denial, ADR-015). UI hiding is not authorisation.
- **Reviewer versus clinician edit rights:** an `mdt_reviewer` can read the marked frames and history but must have no write path: no marker endpoints, no confirm, no amend. The marker UI is not rendered for the reviewer, and the API returns the uniform 404 or 403 (decide, keep consistent with SEC-029 fix, which uses 404). RLS INSERT/UPDATE policies on assessment tables must exclude reviewer roles, so a bug in the app layer does not grant write access. **[Planned]** (SEC-014 notes that existing UPDATE policies are role-coarse; do not copy that pattern. Use ownership and state predicates in the policy.)
- Admin and clinician sharing a person: a user with two roles in one org is out of scope (one membership per org assumed **[Assumption]**).

## 4. Immutable, append-only timing history

### 4.1 Data model principles **[Planned]**

1. **Marker events are append-only.** Each marker placement or move is an INSERT into `assessment_timing_events` (assessment id, version, marker type start/end, media time as an integer in microseconds or a rational with timebase, frame index, detection method code, created_by, server-side `created_at`). No UPDATE, no DELETE for the app role (GRANT only SELECT, INSERT).
2. **Measurement versions are append-only.** `assessment_measurements` has `(assessment_id, version_no)` unique; `version_no` monotonic; `supersedes_id` composite-FK to the prior version; `status` fixed at insert (`draft`, `confirmed`); a confirmed row can never be updated. An amendment inserts a new row with `reason_code` (enumerated). "Current" = highest version not voided; computed by a view, not a mutable flag, so there is no flag to flip.
3. **No free text in audit metadata.** Reasons are enumerated codes. Any clinician notes are in the domain table (health data, RLS-protected), not in audit (rule 5).
4. **Protocol, scoring and instrument versions are immutable rows** referenced by id; a released version cannot be edited (PPA-H27).
5. **Stored inputs are retained alongside derived outputs** so any result can be recomputed and compared; the application never silently recalculates a confirmed result when scoring code changes.

### 4.2 Defence in depth in PostgreSQL

- Revoke UPDATE/DELETE/TRUNCATE on these tables from `previd_app` (and PUBLIC). Add `BEFORE UPDATE OR DELETE` triggers that raise an exception, so even a mis-granted role or a later migration error fails closed. The migration owner can still bypass: see tamper evidence below and SEC-012/SEC-017.
- A `BEFORE INSERT` trigger validates the state transition (see section 6) and checks the supersession chain (the prior version belongs to the same assessment, same org, and is the current version).
- Column-level freeze for `recording_id`, `patient_id`, `org_id` and `created_by` on the assessment row (the SEC-014 freeze trigger pattern, which exists for recordings **[Implemented]**; must be re-created for assessments **[Planned]**).
- Migrations are append-only (`0004_…sql` or next number; never edit applied files, per `CLAUDE.md`).

## 5. Making the audit trail tamper-evident in PostgreSQL

Current state: audit is append-only **for the app role only**; the owner/superuser can alter rows; no hash chain, no external sink, no retention policy (SEC-017, `SECURITY_REQUIREMENTS` row 18 = **Gap**). Timing-change history is evidence about clinical measurements, so the integrity bar is higher than for access logs. **"Tamper-evident" means alterations are detectable, not prevented, and is only as strong as the place the chain head is anchored.**

### 5.1 Proposed design **[Planned]**

1. **Hash chain per scope.** Add to the audit (or a dedicated `assessment_audit`) table: `seq bigint`, `prev_hash bytea`, `row_hash bytea`. `row_hash = SHA-256(prev_hash || canonical_serialisation(org_id, seq, actor_user_id, action_code, subject ids, metadata, server timestamp))`. Canonical serialisation must be defined once (stable key order, fixed timestamp format, explicit NULL encoding) and implemented in a single DB function so the app cannot diverge. Use `pgcrypto`/built-in `sha256()` (verify availability on the target platform; **[Assumption]**).
2. **Chain scope trade-off.** A chain per organisation gives strong ordering but serialises all audit writes in that org (use `pg_advisory_xact_lock(hash(org_id))` or `SELECT … FOR UPDATE` on a chain-head row; measure contention). A chain per assessment avoids hot-spotting and still protects timing history; an org-level periodic "checkpoint" row can hash the heads of the assessment chains. Decision for the owner. **[Planned]**
3. **Compute in the database, in the insert transaction.** A `BEFORE INSERT` trigger sets `seq`, `prev_hash`, `row_hash` under the lock; the app never supplies the hashes. The audit write remains fail-closed for assessment events (a failed audit insert aborts the measurement insert, same transaction).
4. **Reject writes that break the chain.** Unique `(chain_id, seq)`; the trigger rejects a `seq` that is not previous + 1.
5. **Verification function.** A read-only function (and a scheduled job via the existing cron route pattern) recomputes the chain and reports the first break by id (IDs only in output). Run on a schedule and before any export. Report failures as a security incident (`governance/10`).
6. **External anchoring.** Periodically (e.g. daily) write the latest chain head hashes to a store outside the DB owner's reach (an append-only/WORM bucket, a separate cloud account, or a signed email/ticket record). Without this, an attacker with owner access can rewrite the chain and recompute every hash. Choice and provider are a decision for the owner and need approval for any paid service (project rule 9). **[Planned] [External review]**
7. **Optional HMAC/keyed hash.** A keyed hash held outside the DB raises the cost of rewriting but adds key management; weigh against anchoring. **[Assumption]** that anchoring alone is adequate.
8. **Separate privileges.** The migration/owner role must not be used by the running app (`DATABASE_ADMIN_URL` never in app code). Restrict who holds owner credentials; log their use at platform level; consider a separate audit-writer function (`SECURITY DEFINER`, narrowly scoped, with the SEC-011 `search_path`) so the app role has no direct INSERT on the audit table.
9. **Retention and export.** Define audit retention and how chain integrity survives archival/partitioning; chains must not be truncated silently (SEC-017).

### 5.2 Limits to state honestly

- Hash chains do not stop a privileged actor from deleting the whole tail and the anchored heads; they detect inconsistency against an anchored value.
- The chain proves ordering and non-alteration of what was recorded, not the truth of the measurement.
- Clock: timestamps are server-side; the chain does not fix wall-clock accuracy.

## 6. Invalid-state transitions

Define an explicit finite state machine and enforce it in the service **and** in the DB (a trigger on INSERT into versions/status tables), because the service alone cannot stop a bug or a compromised app role (SEC-012).

Proposed states **[Planned]** (final set is a clinical/product decision): `draft` → `marked` → `confirmed` → (`amended` creates a new `confirmed` version; the prior becomes `superseded`) · `draft|marked|confirmed` → `voided` (terminal, with reason code).

Illegal transitions to test and reject: confirm without both markers; confirm with start ≥ end; confirm with outcome ≠ completed but a numeric value; confirm by a non-clinician; confirm with a recording that is not `available`; amend a draft (edit it instead); amend a voided assessment; amend a superseded version (must amend current); confirm twice; marker edit after confirmation except through an amendment; a version whose `supersedes_id` belongs to another assessment or org; setting a status via the client request body (status is set by the server from the action, never accepted from input); SPPB total saved while a component is missing; scoring version not matching the protocol version; amending after the recording was purged.

## 7. IDOR on assessment, video and measurement ids

- All ids are UUIDs validated by Zod at the boundary (**[Implemented]** pattern). Never rely on unguessability for authorisation.
- Every handler loads a child object through its parent **and** `org_id`: e.g. `measurement` by `(org_id, assessment_id, id)`; `timing_event` by `(org_id, assessment_id, id)`; never by `id` alone. A request that supplies `assessmentId` and `recordingId` must verify that they belong together and to the caller's org (the SEC-018 lesson: do not trust a client pairing).
- Not-found, wrong-org, wrong-patient and not-permitted all return the same uniform 404 with an audited denial (ADR-015); watch for different timing or different error bodies.
- Editor video access must call the same permission path as playback (`recording.play`), additionally require `assessment.view`, and bind the signed URL to the specific recording id.
- Test with cross-org and cross-patient substitution for every route and Server Action (path ids, body ids, query ids, multi-id requests such as "recording A with assessment B").
- Chart/timeline endpoints: patient id is validated against the org and against patients with at least one live recording (ADR-016); no endpoint accepts a list of patient ids.
- Do not use sequential ids or version numbers as the only authorisation context. Version numbers are guessable and are not secrets; authorisation is by row ownership and role.

## 8. Race conditions: two people amending

Risks: lost update (two amendments both based on version N); both create N+1; a confirm racing a marker edit; an amendment racing a video deletion; the last-writer silently wins; double submission (SEC-009 is the same class: racy last-admin check, fixed with `FOR UPDATE`).

Controls **[Planned]**:

1. **Optimistic concurrency.** Every mutation carries `expectedVersion`. The insert uses `UNIQUE (assessment_id, version_no)`; a unique violation or a mismatch returns a conflict (409) that shows the current version and does not apply the change. The user must re-review and re-submit.
2. **Pessimistic lock where the state check matters.** `SELECT … FROM assessments WHERE org_id=$1 AND id=$2 FOR UPDATE` at the start of confirm/amend/void so the state check and insert are atomic (READ COMMITTED does not give this alone).
3. **Idempotency keys** for confirm/amend to make double submission harmless; keys unique per `(org_id, key)` and verified against the payload (SEC-018: a key replay with different content returns 409, not the old row).
4. **Lock ordering** (assessment row, then recording row) to avoid deadlocks; handle deadlock and serialisation errors with a safe retry or a clear conflict message, never a partial write.
5. **Video deletion vs amendment.** Amend checks recording status inside the locked transaction; purge/scrub sweeps take the same lock or detect dependent assessments.
6. **UI:** on conflict, show both versions and who changed what by id/time (display names only from the user table via the existing permitted path; audit metadata still holds IDs only).
7. **Test with real concurrency** (parallel transactions against the test DB), noting that the register records SEC-009's fix as having **no concurrency test yet**.

## 9. Signed URLs for the video editor

The editor needs repeated, seekable access to the video for a long session (frame-stepping uses many Range requests), while the existing policy is a 120 s signed URL minted per request and audited (**[Implemented]** in the dev adapter; Supabase behaviour **[Planned]**, unreviewed).

| # | Consideration | Requirement | Tag |
|---|---|---|---|
| U1 | A 120 s token expires mid-edit. Do not extend the TTL to hours. Re-mint on demand (when the player errors or before expiry) through the normal authorised, rate-limited route | Each mint audited fail-closed; rate limit accommodates editing (many mints per session) without removing the limit (SEC-005/006 interplay) | **[Planned]** |
| U2 | Audit noise: one audit event per mint produces many rows for an editing session and makes "who viewed" noisy. Options: a "editor session opened" event with a session id plus a mint counter, avoiding a row per Range request; the aggregation must still record the actor, recording id and times | Do not drop audit of access; decide granularity | **[Planned]** |
| U3 | Tokens are unbound bearer URLs in the query string (SEC-022, **Open**); in the editor they are minted more often, so exposure windows multiply. Prefer binding to user/session and recording id; keep `no-referrer`, `no-store`, `nosniff`; never log the URL (rule 7); no durable URL stored | **Open** (SEC-022) | **[Planned]** |
| U4 | Reviewers and admins get a view-only token; there is no difference in the token, so the write path must check the role on the marker endpoints, not rely on the token | Separate authorisation from media access | **[Planned]** |
| U5 | Revocation: tokens survive deletion/suspension until expiry (SEC-022). With a 120 s TTL this is bounded; state the bound honestly | Keep TTL short | **[Implemented]** (dev) |
| U6 | The editor must not copy the video into persistent browser storage or expose a download control; `nodownload` is cosmetic (SEC-022). Core H15 (device persistence) applies | State limits plainly | **[Planned]** |
| U7 | Frame-accurate display needs the actual frame time; do not send media timestamps to the server in URLs; markers go in POST bodies (no PHI/timing in query strings, SEC-026) | | **[Planned]** |
| U8 | Server-side validation of marker values: media time within `[0, recording duration]` where the duration is the server-known value (SEC-019: duration is client-declared today, **Open**, so the server cannot yet bound times reliably); until SEC-019 is fixed, the server's "duration" is an assertion | Fix SEC-019 before relying on server bound checks | **[Planned]** |
| U9 | Supabase Storage/signed-URL semantics, Range support, CSP `media-src` (SEC-031) must be re-tested when the adapter lands | | **[External review]** |

## 10. Data minimisation

- Store only what the clinical purpose needs: times (as marked), outcomes, enumerated deviation codes, protocol/scoring versions, instrument responses. No device identifiers, no precise geolocation, no clinician free text in audit. Clinician notes are optional, bounded in length, stored in the domain table only.
- Audit metadata for this module: IDs and enumerated codes only (assessment id, version no, action code, reason code, outcome code). Never names, DOBs, NHS numbers, free text, URLs or tokens (rule 5). Add the new action codes to the metadata allow-list in `src/server/audit.ts`, with a test that unknown keys are rejected.
- Logs: never log request bodies, marker payloads or signed URLs (rule 7); error logs name + SQLSTATE only (SEC-035 concern: DB `detail` values may appear in framework logs; check unique-violation details for version/idempotency keys).
- Derived data and ADR-017: no assessment row may survive the scrub of its patient in a form that keeps identity; test the sweep (PPA-H22). Decide whether results of a deleted video are deleted or retained anonymised (open policy decision).
- Charts and timeline pull the minimum fields; no export in the first release (recommendation, PPA-H23).
- Derived VO2peak estimate: derived values are recomputable from inputs; consider not storing the derived estimate at all (compute at read time with versioned formula) to avoid stored stale values. **[Assumption]** the design choice is open.
- The client holds draft markers and (for new patients) identity in the browser only until saved (ADR-017); do not persist drafts to localStorage/IndexedDB.

## 11. What must be tested

Tests are **[Planned]**. Report any that cannot be run; never invent results (rule 8). Passing tests would not be evidence that the module is secure.

### 11.1 Automated (unit, DB, e2e)

| # | Area | Test |
|---|---|---|
| 1 | RLS (as `previd_app`, in `tests/db/`) | Cross-tenant SELECT/INSERT/UPDATE denied on every new table; unset GUC returns nothing; forged `app.org_id` returns nothing; reviewer role cannot INSERT; suspended user loses access immediately |
| 2 | Composite FKs | Insert with an assessment/recording/patient of another org fails even as owner; assessment patient ≠ recording patient rejected |
| 3 | Immutability | UPDATE and DELETE on timing-event, measurement and audit tables fail as `previd_app` (grant and trigger separately verified); confirmed row cannot change; amendment creates a new version; `supersedes_id` must be current |
| 4 | Authorisation | Permission matrix unit tests for each new permission; e2e: clinician, reviewer, admin, other-org user, unauthenticated for each route; uniform 404 on denial; denial audited |
| 5 | IDOR | Substitution of assessment, recording, measurement, timing-event and patient ids across org/patient/role; mismatched pair (recording A, assessment B); search by id of a deleted/scrubbed patient |
| 6 | State machine | Every illegal transition in section 6 is rejected by the service and by the DB trigger; status cannot be sent from the client |
| 7 | Concurrency | Parallel amend/amend, confirm/edit, amend/delete-recording, double submit with the same idempotency key (same payload and different payload); exactly one wins; no partial rows; no deadlock without a clean error |
| 8 | Audit chain | Chain verifies after normal operations; tampering with a row (as owner in a test DB) is detected at the right row; a gap in `seq` is detected; failed audit insert aborts the measurement; metadata allow-list rejects forbidden keys (names, free text, URL-like strings) |
| 9 | Scoring | Golden vectors (clinician-verified) for each score; boundary and rounding; incomplete SPPB gives no total; unit tests that scoring is pure and versioned; no recalculation of a confirmed result |
| 10 | Input validation | Zod schemas reject: negative times, end before start, times beyond recording duration (once the server knows it), unknown deviation codes, oversize notes, wrong units, NaN/Infinity, numerics for non-completed outcomes |
| 11 | Signed URL | Editor mint requires `assessment.view` + `recording.play`; token bound to recording id; expired token rejected; re-mint rate limit; URL never present in logs or audit (grep test); no PHI in any query string |
| 12 | Scrub/retention | Patient scrub removes/detaches assessments, timing events, responses; no identity left; purge of video marks results unverifiable; sweeps do not cross tenants |
| 13 | Headers/caching | `no-store` on all assessment pages/APIs; CSP applies to the editor; no PHI in URLs |
| 14 | UI string check | CI check for banned interpretation terms (normal/abnormal, risk, frail, fit for surgery, pass/fail, etc.) in UI strings and export templates (PPA-H11) |
| 15 | E2E mobile | The Stop control and live clock on supported mobile browsers; hidden-tab behaviour (PPA-H13, H20) |

### 11.2 Review and manual

- Independent code review of: new migrations, DEFINER functions, state-machine triggers, hash-chain trigger and verification function, scrub additions, editor mint route. **[External review]** (the register already records ADR-017 scrub code as unreviewed.)
- Threat model update (STRIDE rows for assessment writes, amendment races, editor mint, audit chain).
- Penetration test scope to include cross-tenant testing of assessment endpoints and the editor (`governance/12` Q19). **[External review]**
- Re-test SEC-001/002/003/010/022 when the Supabase adapters land (the register says they must be re-tested).
- Review of production logs for marker payloads, URLs and DB `detail` leakage (SEC-035).

## 12. Existing findings that bear directly on this module

| Finding | Why it matters here | Current status per register |
|---|---|---|
| SEC-003 / SEC-004 | A recording that can be replaced after verification invalidates the marked frames (PPA-H17) | Fixed (regression tests), residual narrow race |
| SEC-009 | Same race class as concurrent amendment | Fixed, no concurrency test yet |
| SEC-011 | New DEFINER functions must use the fixed `search_path` | Fixed (regression tests); verify on Supabase |
| SEC-012 | A compromised app role can impersonate users and forge actors, so immutability triggers and audit actor binding matter | Open (design limitation) |
| SEC-013 | New system functions must not be cross-tenant callable | Open |
| SEC-014 | Role-coarse UPDATE policies; freeze pattern | Fixed, partial; do not copy role-coarse policies |
| SEC-015 | Read audit coverage; chart and timeline reads are bulk reads | Partially fixed |
| SEC-017 | Audit not tamper-evident; gap that this module makes more important | Open |
| SEC-018 | Idempotency must compare payloads; applies to confirm/amend | Fixed for recordings (regression test) |
| SEC-019 | Duration is client-asserted; limits server-side marker bound checks | Open |
| SEC-022 | Bearer URLs; the editor multiplies mints | Open |
| SEC-026 | PHI in query strings; keep marker data out of URLs | Open |
| SEC-035 | Framework error logs may include DB `detail` | Open |
| SEC-001 / SEC-023 / SEC-024 | Account takeover enables forged confirmations by another identity; do not host before closure | Mitigated / Open; do not deploy real data |

## 13. Open decisions for the owner

1. Which roles may mark, confirm, amend and void (section 3); is a second-person confirmation required?
2. Chain scope for audit (per org versus per assessment) and where chain heads are anchored (needs owner approval for any paid or external service).
3. Granularity of editor-access audit events.
4. Retention of results when the video is deleted; scrub behaviour for derived data.
5. Whether to store derived estimates or compute them on read.
6. Whether any export is built in the first release (recommendation: no).
7. When SEC-019 (server-side duration) will be fixed relative to marker bounds checking.

## 14. Honest limits of this plan

This plan was written from the repository documents without running code, tests or a server; the current schema, services and permission matrix were not inspected line by line for this module (they do not exist yet). Section 3's matrix and section 5's design are proposals. No claim is made that implementing them makes the module secure; an independent review and penetration test remain **[External review]**. No real patient data may be used until the approvals and security closure in the findings register are complete.
