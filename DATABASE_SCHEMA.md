# Database schema (PostgreSQL 16, plain SQL migrations)

Source of truth: `db/migrations/0001_core.sql` (+ `db/local-auth/0001_local_auth.sql`, dev only). Applied by
`scripts/db.ts migrate` with SHA-256 checksums recorded in `schema_migrations` (edits to applied files are refused).
**Migrations run as the owner role; the app connects as `previd_app` (NOLOGIN until `setup-app`), which is not the owner, not superuser, no BYPASSRLS.**

| Table | Purpose | Notes |
|---|---|---|
| organisations | Tenants | `is_synthetic` + CHECK `mvp_synthetic_only` blocks non-synthetic orgs |
| org_settings | Per-org retention + limits | retention 1–3650 d, max length 10–900 s, max size 1–500 MB |
| users | App users (stable UUIDs) | no provider fields |
| identity_links | (provider, subject) → user | maps Supabase/Entra/local ids |
| memberships | user ↔ org with role + status | roles: org_admin, clinician, mdt_reviewer |
| patients | Synthetic patients | unique (org_id, synthetic_ref) |
| recordings | Video metadata | composite FK (org_id, patient_id); identity_checks ≥ 2; unique (org_id, idempotency_key); opaque unique storage_key |
| mdt_meetings, mdt_meeting_patients | MDT lists | composite FKs; only patients with a live recording are shown |
| mdt_meeting_placeholders | "No PreVid for patient N" slots | no patient columns by design; shares `position` ordering |
| audit_events | Append-only log | IDs/codes only; metadata < 1 KB; app role has SELECT+INSERT only |
| rate_limits | Fixed-window counters | no tenant data |

## Row Level Security
Enabled on all tenant tables. Context helpers `app_user_id()`, `app_org_id()` read transaction-local settings.
`app_is_member(org, roles[])` (SECURITY DEFINER, `search_path` pinned) checks an **active** membership of an **active** user
in an **active** org. Policies: reads need membership; writes need `org_admin`/`clinician` (settings/memberships: `org_admin`);
`recordings.recorded_by` must equal the caller; audit reads are `org_admin` only; audit inserts must match the caller's org.

## System functions (cron, no user session)
`system_due_recordings(limit)`, `system_mark_object_deleted(id)` (re-checks the row is genuinely due, writes the audit event),
`system_cleanup()`. These are the only privileged paths for the app role.

## Consent and identity minimisation (migration 0003, ADR-017)
`recordings.consent_confirmed_at/by` are NOT NULL and immutable. `patient_scrub_if_unused(org, patient)` (SECURITY DEFINER; requires an org admin/clinician of the caller's org) and the internal `patient_scrub_internal` (not callable by the app role; used by `system_mark_object_deleted`) remove identifying details from a patient with no `available`/`pending_upload` recording.

## Lifecycle of a recording
`pending_upload → available → deleted` (or `failed`). `purge_after = uploaded_at + retention_days`. Deleted/failed rows keep
metadata (tombstone); the stored object is removed and `storage_deleted_at` set; the retention sweep retries failures.

## Known gaps
No hash-chained/WORM audit (the owner role could alter audit rows); no per-org dedicated DB yet; patient PII columns are not
column-encrypted (planned before any real data); backups/PITR policy to be defined (`DEPLOYMENT.md`).
