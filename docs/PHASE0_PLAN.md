# PreVid 2.0 — Phase 0 Plan (for approval)

Status: **DRAFT — awaiting owner approval. No application code has been written.**
Repository state at start: empty (no commits, no files).

Legend used throughout: **[Planned]** = not yet built · **[Assumption]** = unverified · **[External review]** = needs qualified professional · **[NHS approval]** = needs adopting-organisation sign-off.
Pricing and service-limit figures below are from my general knowledge and **have not been verified against current vendor pages** — verify before committing spend.

---

## 1. Proposed architecture

**Style:** modular monolith, one Next.js (App Router, TypeScript) deployable. No microservices, no Edge Functions.

```
Browser (mobile/desktop)
  │  MediaRecorder capture → direct upload to storage via short-lived signed URL
  ▼
Next.js on Vercel  (Server Components, Route Handlers, Server Actions)
  ├─ src/domain/        pure types + Zod schemas (no Supabase types, no URLs)
  ├─ src/server/
  │    ├─ auth/         session → AppUser + OrgContext (provider adapter)
  │    ├─ authz/        permission matrix + `requirePermission(ctx, perm)`
  │    ├─ db/           pooled Postgres client + `withOrgContext()` transaction wrapper
  │    ├─ repositories/ SQL per aggregate; every function requires an OrgContext
  │    ├─ services/     patients, recordings, mdt, admin, retention
  │    ├─ ports/        VideoStorage, IdentityProvider, AuditSink, JobRunner
  │    └─ adapters/     supabase-storage, supabase-auth, postgres-audit, vercel-cron
  └─ src/app/           routes, UI (Tailwind + accessible primitives)
PostgreSQL (Supabase, London region)   Supabase Storage (private bucket)
```

### Key design decisions (each becomes an ADR in `docs/decisions/`)

| # | Decision | Rationale |
|---|----------|-----------|
| ADR-001 | Modular monolith, Next.js App Router | Lowest cost/complexity; single deploy unit. |
| ADR-002 | **Own `users` table with stable UUIDs**; `identity_links(provider, subject)` maps Supabase Auth (later Entra ID) to them | Provider swap without touching domain data. |
| ADR-003 | **Opaque storage keys** (`o/{orgId}/r/{recordingId}`), no URLs stored | Storage-provider portability; no URL leakage. |
| ADR-004 | **Direct-to-storage upload** via signed URL; server only issues the target and verifies completion | Vercel request body limit (~4.5 MB) rules out proxying video. |
| ADR-005 | **Tenant isolation = app-layer authz + RLS driven by session GUCs** (`SET LOCAL app.user_id/app.org_id` inside a transaction), *not* Supabase `auth.uid()` | RLS stays portable to RDS/Azure PG; defence in depth. App connects as a non-owner, non-`BYPASSRLS` role. |
| ADR-006 | Composite foreign keys `(org_id, id)` on all tenant children | DB itself prevents a recording pointing at another org's patient. |
| ADR-007 | Plain version-controlled SQL migrations (dbmate or a small runner) + `postgres.js` queries, Zod at boundaries; no heavy ORM | Portability, auditability of SQL, fewer deps. [Decision for you — see §7] |
| ADR-008 | Postgres-backed audit log, append-only (UPDATE/DELETE revoked), IDs only — no PHI/free text | No extra subprocessor; portable `AuditSink`. |
| ADR-009 | Postgres-backed rate limiting for MVP | Avoids Upstash/Redis account and extra subprocessor. |
| ADR-010 | Background work via a `JobRunner` port; MVP adapter = Vercel Cron hitting a secret-protected route | Free-tier compatible; swappable for SQS/Azure Functions. |
| ADR-011 | Capture with `getUserMedia` + `MediaRecorder`, **not** `<input capture>` | Reduces (cannot eliminate) camera-roll saving; honest limitations documented. |
| ADR-012 | Synthetic-data guardrail: `organisations.is_synthetic` flag, persistent UI banner, service refuses non-synthetic orgs until governance gate flips a config | Operationalises "synthetic only". |

### Upload / playback flow
1. Clinician selects patient → **identity verification step** (confirms name + DOB/NHS number displayed from the record) → server records `identity_verified_by/at` on a recording-intent row.
2. Client records, previews, confirms. Client generates an **idempotency key** per intent.
3. `POST /recordings` (init): authz → validates limits (declared size/duration/mime) → inserts `recordings` row `pending_upload` (unique on idempotency key) → returns signed upload target (resumable/TUS where supported).
4. Client uploads with progress, retry and resume; local blob retained only until confirmed, then released.
5. `POST /recordings/:id/complete`: server `head`s the object (size, content-type), sniffs container magic bytes, checks limits, flips to `available`, writes audit event. Orphaned `pending_upload` rows are purged by cron.
6. Playback: server authorises (membership, permission, org match, not deleted), writes audit event, returns **60–300 s signed URL**; patient banner always shown alongside the player to counter wrong-patient review.

### Browser limitations to document [Planned]
iOS Safari records MP4 (H.264/AAC), Chromium/Firefox record WebM; MediaRecorder behaviour differs by version; in-app webviews and some older iOS versions unsupported; blobs live in browser memory/possibly disk-backed temp storage, so "zero local persistence" cannot be guaranteed.

---

## 2. Agent allocation and work plan

Mechanism: Claude Code subagents defined as `.claude/agents/*.md` (committed in Milestone 1). Agents run via the Agent tool, in isolated git worktrees where I need parallelism; otherwise sequentially. I will not claim parallel execution I haven't observed. **I (orchestrator) own interfaces, integration and merge; agents don't merge themselves.**

| Agent | Owns (exclusive write) | Reads / reviews |
|---|---|---|
| 1 Product/UX | `PRODUCT_SPEC.md`, `docs/ux/**` | everything (acceptance criteria) |
| 2 Frontend | `src/app/**`, `src/components/**`, `src/client/**` | `src/domain/**` |
| 3 Backend/DB | `db/migrations/**`, `db/seed/**`, `src/server/**` (except adapters/infra), `DATABASE_SCHEMA.md` | |
| 4 DevOps | `.github/**`, `vercel.json`, `.env.example`, `src/server/adapters/**`, `DEPLOYMENT.md`, `INFRASTRUCTURE_MIGRATION.md` | |
| 5 Security | `SECURITY_REQUIREMENTS.md`, `docs/security/**` (threat model, findings register), `tests/security/**` | **vetoes** merges with open critical/high findings |
| 6 Clinical safety | `governance/**` | |
| 7 QA | `tests/**` (except security), `playwright.config.ts`, `TESTING.md` | |
| Orchestrator | `src/domain/**`, `src/server/ports/**`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `docs/decisions/**` | all |

**Interfaces first (Milestone 1, before parallel work):** `src/domain` types/Zod schemas, `ports/*`, permission matrix, OpenAPI-style route contract list, DB schema v1.

---

## 3. Database schema (v1 outline)

All tenant tables carry `org_id NOT NULL`; PK `id uuid`; unique `(org_id,id)` to support composite FKs.

- `organisations(id, name, slug, is_synthetic, status, created_at)`
- `org_settings(org_id PK, retention_days, max_duration_sec, max_file_bytes, allowed_mime[], …)`
- `users(id, email, display_name, status, created_at)` — global; **no auth-provider fields**
- `identity_links(provider, subject, user_id)` — unique `(provider,subject)`
- `memberships(org_id, user_id, role, status)` — PK `(org_id,user_id)`; roles below
- `invitations(id, org_id, email, role, token_hash, expires_at, accepted_at)`
- `patients(id, org_id, synthetic_ref, given_name, family_name, date_of_birth, nhs_number_synthetic, created_by, archived_at)` — unique `(org_id, synthetic_ref)`
- `recordings(id, org_id, patient_id, recorded_by, identity_verified_at, status[pending_upload|available|failed|deleted], storage_key, mime_type, size_bytes, duration_sec, idempotency_key, recorded_at, uploaded_at, purge_after, deleted_at, deleted_by)` — composite FK `(org_id,patient_id)`; unique `(org_id,idempotency_key)`
- `mdt_meetings(id, org_id, title, scheduled_for, created_by)`; `mdt_meeting_patients(org_id, meeting_id, patient_id, position)`
- `audit_events(id, org_id, actor_user_id, action, target_type, target_id, outcome, ip_hash, user_agent_class, occurred_at, prev_hash, hash)` — append-only, no PHI
- `rate_limits(key, window_start, count)`
- `deletion_requests(id, org_id, recording_id, requested_by, reason_code, status, decided_by)` (dual-control optional)

**Roles (MVP):** `org_admin` (users, settings, retention, audit view; no video playback by default), `clinician` (patients, record, view own org recordings), `mdt_reviewer` (read-only patients/recordings/MDT), `platform_admin` (out-of-band script only; not a web role in MVP).

**RLS:** enabled + forced on every tenant table; policies use `current_setting('app.org_id')` and membership check; app role is not table owner; separate test suite connects as app role and attempts cross-tenant reads/writes.

Full DDL will be delivered in `DATABASE_SCHEMA.md` + `db/migrations/0001_*.sql` in Milestone 1.

---

## 4. Security model

- **AuthN:** Supabase Auth (email + MFA/TOTP enforced for all roles; password policy); server validates session on every request; adapter maps to `AppUser`. Short session lifetime, httpOnly secure SameSite cookies.
- **AuthZ:** single `requirePermission(ctx, permission)` choke point; org context derived from membership lookup, **never** from client-supplied org id alone. IDOR defence: every repository query takes `OrgContext` and filters by `org_id`; RLS backstops.
- **Storage:** private bucket, no public policies; browser never holds service-role key; signed URLs short-lived, scoped to one object; service-role key server-only, never in client bundle (CI check greps bundle).
- **Upload hardening:** size/duration/MIME allow-list, magic-byte sniff, server-generated keys, idempotency, orphan cleanup; no user-supplied filenames used in paths.
- **Web:** CSP (nonce), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera/microphone self only), frame-ancestors none; CSRF via SameSite + Origin check on mutating routes; Zod on every input; safe error shapes; rate limits on auth, init-upload, playback-URL issuance.
- **Logging:** structured logs, IDs only; redaction tests; no video URLs/names/DOBs in logs or analytics (no analytics in MVP).
- **Audit:** sign-in, failed access, patient create/view/archive, recording create/play/delete, role changes, settings changes, exports.
- **Tests (Agent 5/7):** privilege escalation, cross-tenant read/write via URL/API/ID tampering, unauthorised/expired signed URL, RLS-as-app-role tests, upload abuse, bundle secret scan, `npm audit`/dependency scanning in CI.
- **Process:** threat model (STRIDE) before Milestone 2; findings register with severity; critical/high block deployment recommendation. Passing tests will not be described as "secure".

---

## 5. MVP feature backlog (priority order)

**P0 Foundation:** repo scaffold, lint/type/test CI, design tokens + primitives, migrations + seed (2 synthetic orgs, 3 roles, ~20 patients), auth + MFA, org context, permission matrix, audit sink, security headers.
**P1 Clinical core:** patient list/search/create/archive; identity verification step; recorder (permissions UX, timer, limits, preview, retake); resumable upload w/ progress/retry/resume/duplicate guard; patient timeline; secure playback; MDT meeting lists + MDT viewer (date-sorted, patient banner, keyboard-accessible).
**P2 Admin & governance:** invite/manage users & roles; org settings (retention, limits); retention scheduler + deletion workflow with audit; audit log viewer/export; error monitoring (privacy-scrubbed).
**P3 Validation & docs:** cross-tenant/regression suites, Playwright mobile+desktop (incl. interrupted upload), axe accessibility, dependency scan, `governance/*` set, deployment/migration docs, cost-monitoring guide.
**Out of scope (explicit):** AI interpretation, frailty scoring, risk prediction, diagnostics, real patient data, EPR/PAS integration, native apps.

---

## 6. Initial cost estimate

**Development (no spend):** GitHub (existing), Vercel Hobby £0, Supabase Free £0, GitHub Actions free minutes, Playwright/Vitest £0. *Caveats [Assumption]:* Supabase free projects auto-pause after inactivity and have small storage/upload-size limits (≈1 GB, ≈50 MB/file); Vercel Hobby is licensed for **non-commercial** use only — fine for synthetic development, not for commercial pilots.

**Indicative pilot/staging (needs your approval before any purchase) [unverified prices]:**

| Item | Approx. monthly | Idle cost? | Cheaper option |
|---|---|---|---|
| Supabase Pro (prod: DB + storage + auth) | ~£20 (≈$25) | Yes | Free tier (pauses, small limits) |
| Vercel Pro (1 seat, commercial use) | ~£16 (≈$20) | Yes | Hobby (non-commercial only) |
| Second Supabase project for staging | ~£0–10 | Yes | Free project, or local Supabase/Docker for staging-like tests |
| Domain | ~£1 | Yes | — |
| Error monitoring | £0 (free tier) if approved | — | Logs only |
| **Total** | **~£37–£50** | | within £40–£70 target |

Cost controls: spend caps/alerts on both vendors, video size/duration limits, retention purge, no egress-heavy features. Detailed guidance delivered in `DEPLOYMENT.md`.

---

## 7. Key risks and unresolved decisions

**Risks**
1. **Browser recording variability (iOS Safari, in-app browsers)** — mitigate with capability detection, format validation, real-device test matrix [Assumption: I can't test real devices from this environment].
2. **Wrong-patient recording/review** (top clinical hazard) — identity check step, persistent patient banner, audit; hazard log entry.
3. **Tenant leakage via a missed `org_id` filter** — mitigated by single wrapper + RLS + composite FKs + adversarial tests.
4. **Supabase free-tier limits/pause** blocking realistic video testing.
5. **UK data residency** — Supabase London region exists [Assumption]; Vercel function region configurable (lhr1) but edge/CDN, logs, support and subprocessors need contractual verification. No residency claim until verified.
6. **Regulatory scope drift** — recordings that influence fitness decisions may raise medical-device questions; handled via classification questions in `governance/` for [External review].
7. **Local persistence of video in browsers** cannot be guaranteed away.
8. **Agent coordination in this environment** — I'll verify actual subagent/worktree support in Milestone 1 and fall back to sequential specialists.
9. Single-developer bus factor / self-funded scope — keep dependencies minimal.

**Decisions needed from you**
1. Approve DB access approach (**ADR-007**): SQL migrations + `postgres.js` (my recommendation) vs Drizzle/Prisma.
2. Approve role set (`org_admin` / `clinician` / `mdt_reviewer`) and that org admins can't play video by default.
3. MFA mandatory for all users in MVP? (recommended yes)
4. Error monitoring: logs-only, or Sentry free tier (adds a subprocessor; needs approval and PII scrubbing)?
5. Rate limiting in Postgres (recommended) vs external Redis.
6. Staging environment: second Supabase project vs local Docker-based Supabase.
7. Permission to create (a) GitHub Actions workflows and (b) a Supabase **free** dev project — I will not connect any external account until you say so.
8. Max recording length / size defaults (proposal: 3 min, 150 MB).
9. Name for the Git default branch/work branching: I am developing on `claude/fervent-sagan-2d8vib`; confirm if you want feature branches/PRs per milestone.

---

## 8. Proposed milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0** (this doc) | Plan, ADRs outline, risks | Your approval |
| **M1 Foundation** | Scaffold, CI, design system, migrations v1 + RLS, seed, auth adapter, permission matrix, ports, subagent definitions, threat model v0, `CLAUDE.md`/`AGENTS.md`, governance skeleton | build/lint/typecheck/unit + RLS tests pass (reported honestly, incl. anything not runnable here) |
| **M2 Patients & recording** | Patient mgmt, identity verification, recorder, resumable upload, completion verification | integration + Playwright (emulated mobile) tests; upload-failure tests |
| **M3 Playback & MDT** | Signed playback, timeline, MDT lists/viewer | unauthorised-access tests; a11y checks |
| **M4 Admin & security** | Users/roles, org settings, audit viewer, retention/deletion, monitoring | privilege-escalation + cross-tenant suites; security findings review |
| **M5 Validation** | Full test run, axe, dependency scan, fix critical/high | no open critical/high; honest test report |
| **M6 Deployment prep** | `DEPLOYMENT.md`, `INFRASTRUCTURE_MIGRATION.md`, cost/backup/DR guides, governance docs completed | docs reviewed; **no deploy without your approval** |

Each milestone report will list: features done, tests run (and not run), security findings, clinical safety concerns, outstanding work, cost estimate, decisions needed.

---

## Approvals / guardrails I will observe
No paid services, external-account connections, public deploys, or security-critical setting changes without explicit approval. Synthetic data only. Governance documents are draft gap analyses and will not claim DCB0129/DCB0160/DTAC compliance, certification, or medical-device exemption.
