# Milestone 2 plan — Supabase integration and emailed invitations

Status: **PLAN — awaiting owner approval and the Supabase connector. Nothing here has been done.**
Supabase behaviours below come from my general knowledge and are tagged **[Verify]**; I will read the current Supabase docs before relying on any of them, and report what I could not confirm.

## 0. Goals and exit criteria
1. PreVid runs against a **hosted Supabase dev project** (synthetic data only) with `AUTH_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`, and the dev adapters disabled.
2. Users join only through **email-verified invitations** (closes the High finding SEC-001 and the SEC-002 consent gap; replaces admin-known temporary passwords).
3. RLS, tenant-isolation, privilege, upload-abuse and consent tests pass **against the Supabase database** and against hosted auth/storage.
4. Security agent re-reviews the new code; no open Critical/High before any "ready for pilot" statement.
Not in scope: Vercel deployment (separate approval), real patient data, AI features.

## 1. What I need from you (tomorrow)
| # | Need | Why |
|---|---|---|
| 1 | Connect the Supabase connector (claude.ai → connectors → Supabase) | I cannot connect it myself |
| 2 | Approve creating **one free dev project**, region **London (eu-west-2)**, in an account/org that holds nothing important | Connector can create/pause projects; I will show its cost check before creating anything |
| 3 | Decide email sending (see §5): use Supabase's built-in test sender for now, or approve a custom SMTP/email provider | Real invitees need a proper sender [Verify: built-in sender is limited to project team members and heavily rate-limited] |
| 4 | Decide the dev upload limit: stay at 150 MB (may need a paid plan) or drop to the free-tier cap while designing | [Verify: free-tier max object size ~50 MB; recommended single-request upload ≤ ~6 MB, resumable (TUS) above that] |
| 5 | Keys: I will use `request_credential` (secure form) for the service-role key and DB password — never in chat | Secrets must not be pasted into chat |

## 2. Sequence
**Step A — Verify and create (½ day).** Read current Supabase docs (Auth MFA, Storage signed URLs, limits, regions, SMTP). Confirm cost via the connector. Create the project. Record region and every subprocessor in `governance/07-data-flow.md` as *verified* or *unverified*.

**Step B — Project hardening settings.** Disable public sign-ups; enable email + TOTP MFA; password minimum 12; short JWT expiry; set redirect URL allow-list; create **private** bucket `videos` with **no policies**, bucket file-size limit and allowed MIME types (`video/mp4`, `video/webm`) as defence in depth; no public access. [Verify each setting exists on the free tier; inactivity/time-box session limits may be paid-only → keep our own idle check as the fallback.]

**Step C — Database.** Apply `db/migrations/0001–0003` as the owner role (do **not** apply `db/local-auth`). Run `db:setup-app` with a generated strong password. Connect the app via the **pooler in transaction mode** (`prepare: false` already set; our per-transaction `set_config` is compatible) with `DATABASE_SSL=require`. Verify: `previd_app` is not owner/superuser/BYPASSRLS; TEMP revoke from `PUBLIC` succeeded (the migration only warns if the platform refuses → SEC-011 follow-up); function `search_path` settings; run `tests/db/rls.test.ts` against the Supabase DB.

**Step D — Storage adapter** (`src/server/adapters/supabase/storage.ts`, server-only, service-role key never reaches the browser):
- `createUploadTarget` → signed upload URL for the opaque key `o/{org}/r/{id}`, **no upsert**, short TTL.
- `createPlaybackUrl` → signed URL, **120 s**.
- `head` / `readStart(16)` → server-side metadata + ranged read for the magic-byte check.
- `delete` → remove object. Keep `system_upload_allowed` semantic: because uploads go straight to Supabase, the PUT can no longer be gated by our DB (SEC-003/004 fixed locally via that gate). **Open design item:** tokens are single-path and expiring, no upsert, and we re-verify at `complete`; also snapshot size + hash at `complete` and reconcile storage against rows in the sweep. If Supabase signed upload URLs prove replayable within TTL, route uploads through a short-TTL token + post-`complete` object-immutability check or a small proxy for ≤ limit files. [Verify]
- CSP: add the exact Supabase project hostname to `connect-src` and `media-src` (SEC-031). Resumable upload (TUS) for large files is a follow-up if the single-PUT limit is a problem.

**Step E — Identity adapter** (`src/server/adapters/supabase/identity.ts`, using `@supabase/ssr`):
- Sign-in with email + password; **always** use the server-verified user (`getUser()`), never trust an unverified session object.
- Mandatory MFA: TOTP enrol/challenge/verify; a request is "MFA-verified" only at **AAL2**. No org access at AAL1.
- Map `auth.users.id` → `identity_links(provider='supabase', subject)` → our `users.id`. No Supabase objects leave the adapter (ADR-002).
- Keep **our** Postgres rate limiting and lockout around sign-in (SEC-005/006/007 still apply); add our own idle timeout cookie if the platform's is unavailable.
- Sign-out revokes the server session; add "sign out everywhere" and admin session revocation (SEC-010).
- Password change/reset and **MFA reset** flows (admin-initiated, audited, step-up protected) (SEC-010).

**Step F — Emailed invitations** (see §3).

**Step G — Tests and review (see §4).**

**Step H — Config hardening.** Production requires `AUTH_PROVIDER=supabase` and `STORAGE_PROVIDER=supabase`; key hardening (CSP, Secure cookies) off an explicit `PREVID_ENV` instead of `NODE_ENV` (SEC-024); remove/disable the local adapters' ability to start when `PREVID_ENV=production`.

## 3. Invitation flow (design)
1. **Admin invites**: enters email + role. Server creates `invitations` row (`id`, `org_id`, `email`, `role`, `status` pending/accepted/revoked/expired, `expires_at` = 72 h, `created_by`) — RLS: org admins only. Audited `invitation.create`. **Response to the admin is always the same** ("If this address can be invited, an email has been sent") so existence of accounts is not revealed (SEC-002). Rate-limited per admin and per address.
2. **Email**: sent via Supabase Auth's admin invite (`inviteUserByEmail`, service-role, server-only) for new people, or a plain notification for existing PreVid users. The link is single-use and expiring; the admin never sees it or any credential.
3. **Acceptance** (`/invite/accept`): the invitee proves control of the inbox by completing the emailed link (OTP verification server-side) → **we set `users.email_verified_at`** (the only way it is ever set) → they choose their **own** password → enrol their **own** TOTP (only from this activated, verified session) → membership is created `active` with the role in the invitation → invitation marked accepted. Audited `invitation.accept`.
4. **Existing users from another organisation** (verified email): they receive the notification, sign in, and see a pending invitation they must **explicitly accept**; no automatic cross-organisation membership (closes the non-consensual add in SEC-002).
5. **Admin controls**: list pending, revoke, resend (rate-limited). A revoked/expired/used link is refused. Adding an address that has an unverified legacy account is refused (already implemented, SEC-001 mitigation).
6. **Migration `0004`**: `invitations` table + RLS, a narrowly scoped `SECURITY DEFINER` function to accept an invitation for the *caller's own verified email* (checks pending, unexpired, email match), `email_verified_at` setter restricted to that path, new audit actions. Local (dev) provider keeps its current behaviour for offline tests; the Supabase adapter is the production path.
7. **Tests**: single-use, expiry, wrong-email, revoked, replay, cross-tenant invitation tampering, admin cannot obtain credentials, uniform responses, MFA enrolment impossible before acceptance, existing-user explicit-accept.

## 4. Testing and independent review
- **Contract tests**: one shared suite for `IdentityProvider` and `VideoStorage` run against the local and Supabase adapters.
- **DB**: `tests/db/*` against the Supabase Postgres (dev project only; the suite resets data it creates — never run against anything holding real data).
- **E2E**: Playwright against the hosted dev project (or `next start` pointed at it). TOTP codes generated from the enrolment secret; invitation links obtained with the admin "generate link" API in test mode so tests need no inbox [Verify].
- **Security**: re-run all regression tests; ask the Security agent to re-review the adapters and migration `0004`; specifically re-test SEC-001, 002, 003, 004, 010, 011 (TEMP), 012, 022, 031, 034.
- **Report honestly** what could not be run (real phones, email deliverability, load, backups/PITR, Vercel).

## 5. Email sending (decision needed)
Default Supabase email is for testing only [Verify]. A real pilot needs a custom SMTP provider with SPF/DKIM/DMARC on a domain you own.
| Option | Cost (indicative, unverified) | Notes |
|---|---|---|
| Supabase built-in sender | £0 | Test only; limited recipients/rate |
| Transactional email provider free tier (e.g. Resend/Brevo/SES) | £0–£few/month | New subprocessor to record in DPIA; check region/data-processing terms; **needs your approval** |
| Domain | ~£10–£15/yr | Required for deliverability; also needed for production URLs |
Idle cost continues for domain; email provider free tiers usually have no idle cost.

## 6. Cost and limits to expect on the free tier [Verify all]
Projects pause after a period of inactivity; small DB and storage quotas; no point-in-time recovery or managed backups guarantees; limited auth email; session-limit features may be paid-only. Move to Pro (~$25/month, **needs your approval and cost check via the connector**) before: real-size video testing, backups/PITR, or any pilot. Vercel Hobby is non-commercial only.

## 7. Risks and unknowns
- Supabase upload semantics (signed URL replay, max object size, resumable) may force a design change in Step D.
- Transaction-mode pooler + `set_config(..., true)` assumed compatible; confirmed by running the RLS suite early (Step C).
- TEMP/CREATE revocation may be refused by the managed platform (SEC-011).
- Data residency: London region does not prove residency for Auth email, logs, backups, support access or Vercel edge — each must be verified or recorded as unknown; **no residency claim** until then.
- Hosted dev adapters must stay locked (`PREVID_ALLOW_DEV_ADAPTERS` false) once the Supabase adapters exist.
- Time: roughly 2–3 working sessions for Steps A–G; Vercel deployment and a staging project are separate.

## 8. Order I will work in
A (verify/create) → C (DB + RLS suite on Supabase) → B (settings) → E (identity) → F (invitations) → D (storage) → H (config) → G (tests, security re-review) → report with test results, findings, costs and decisions.

---

## Progress log

**2026-11-21 — Step A/C partly done (owner approved applying migrations and the network change).**
- Connector live. Organisation "PreVid" (free plan). Existing empty project **"drcalc97's Project"** (`eemlpjwqzyneaoavrnou`, `eu-west-2` London, Postgres 17) is used as the dev project. No second project created.
- Migrations **0001–0005 applied** through the connector (`apply_migration`; applied text omits SQL comments but is otherwise identical to `db/migrations/`). `0004_supabase_platform_hardening.sql` revokes the Data API roles (`anon`, `authenticated`) from every table/sequence/function in `public` and puts RLS on `identity_links` and `rate_limits`; `0005` pins function search paths.
- **Verified in the database** (a rolled-back test run via the connector, as the real roles): app role sees only its own organisation's rows, nothing with no/other org context; app role cannot create temp tables or objects in `public` (so the TEMP/CREATE revokes worked on Supabase, closing the SEC-011 "verify manually" item for this project); `anon` and `authenticated` cannot read any PreVid table or execute any PreVid function; app role is not superuser/BYPASSRLS. This ran SQL on the project but is **not** the full `tests/db` suite.
- Advisor still lists `public.rls_auto_enable()` (platform-provided event-trigger helper owned by a platform role) as executable by `anon`/`authenticated`; our migrations cannot revoke it. Left unchanged; consider disabling the Data API (project settings) or reporting to Supabase. Re-run advisors after every schema change.
- `grant previd_app to postgres with set true` was run so the connector's role can run the checks above; remove it (`revoke previd_app from postgres`) before any real use.
- `previd_app` is still `NOLOGIN` (no password set). The password will be set when a place to run the app exists.
- **Network:** a personal environment `previd` was created for this repo allowing the project API host, direct DB host and EU-west-2 pooler hosts. **Finding:** the sandbox's proxy only carries HTTPS; **raw-TCP Postgres connections are not supported**, so the app and the `tests/db` / Playwright suites **cannot connect to the Supabase database from this sandbox.** HTTPS APIs (Auth, Storage, REST) and the connector's SQL tool do work. Consequences: (1) Auth/Storage adapters can be contract-tested here over HTTPS once a key is provided (via the secure credential form, injected by the proxy — I never see it); (2) the full app against Supabase must run somewhere with Postgres network access: a Vercel preview (needs your approval), or your own machine; (3) DB-level checks can continue via the connector.
- Still to do: free-plan upload size limit (owner to read from the dashboard), email provider decision, Auth settings (disable sign-ups, TOTP, password length), private `videos` bucket, adapters (Steps D–F), `previd_app` password, CSP hosts.
