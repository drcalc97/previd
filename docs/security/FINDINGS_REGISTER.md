# PreVid — Security Findings Register

Independent static review ("Agent 5", 2026-11-20) of the working tree at commit `3222214` (Next.js 16.4.6, PostgreSQL 16), synthetic data only.
**This register does not claim the application is secure.** Method: reading all in-scope code, read-only SQL against the test DB, `npm audit` (0 vulns), `tsc` (clean),
grep of `.next/static` for secret values (none). *Nothing was exercised dynamically and no exploit was run* — "Verified" = confirmed by code/SQL reading; "Needs verification" = reasoned only.
Severity assumes real patient data in production. Several findings are specific to the **development-only local adapters**.

**Status column** is updated by the orchestrator after remediation (see "Remediation log" at the bottom). Statuses: Open · Fixed (regression test) · Mitigated · Accepted/Deferred (reason) · Superseded by Supabase adapter (re-test required).

## Summary
| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 12 |
| Low | 16 |
| Info | 6 |

| ID | Sev | Title | Location | Status |
|---|---|---|---|---|
| SEC-001 | High | Admin-known temp credentials + first-use MFA enrolment allow account pre-takeover, incl. cross-tenant "shadow account" | `services/admin.ts`, `adapters/local/identity.ts` | See log |
| SEC-002 | Medium | `app_find_user_id_by_email` is a platform-wide email-existence oracle; unconsented cross-org add | `0001_core.sql`, `admin.ts` | See log |
| SEC-003 | Medium | Upload token reusable: object overwritten after `complete` verified it (TOCTOU) | `api/storage/upload/route.ts`, `recordings.ts` | See log |
| SEC-004 | Medium | Upload token can re-create an object after delete/purge; orphan never swept | same | See log |
| SEC-005 | Medium | Rate limits trust first `x-forwarded-for`; skipped if header absent | `ratelimit.ts`, `identity.ts` | See log |
| SEC-006 | Medium | Any known email can be locked out/throttled by an unauthenticated attacker | `identity.ts` | See log |
| SEC-007 | Low | Password success resets shared failure counter, weakening TOTP lockout | `identity.ts` | See log |
| SEC-008 | Low | "Account locked" response enumerates accounts | `identity.ts`, `actions/auth.ts` | See log |
| SEC-009 | Medium | Last-admin guard racy (no row lock) | `admin.ts` | See log |
| SEC-010 | Medium | No password change/reset, MFA reset, revoke-all; temp password permanent; policy fn unused | `identity.ts`, `password.ts` | See log |
| SEC-011 | Medium | SECURITY DEFINER `search_path` lacks trailing `pg_temp`; PUBLIC has TEMP / CREATE on schema | `0001_core.sql`, `scripts/db.ts` | See log |
| SEC-012 | Medium | Trust model: GUC-driven RLS; SQL execution as app role can impersonate any user and read auth tables | `0001_core.sql`, `local-auth` | See log |
| SEC-013 | Low | `system_*` DEFINER functions callable by any app-role session, unscoped | `0001_core.sql` | See log |
| SEC-014 | Low | Role-coarse UPDATE policies; `audit_insert` doesn't bind actor; users self-update incl. email/status | `0001_core.sql` | See log |
| SEC-015 | Medium | Audit coverage gaps (bulk PHI reads, rejected uploads, audit views) | `patients.ts`, `mdt.ts`, `recordings.ts` | See log |
| SEC-016 | Low | Unbounded unauthenticated audit/rate-limit rows; probe events invisible to org admins | `actions/auth.ts`, `authz/index.ts` | See log |
| SEC-017 | Low | Audit not tamper-evident; no retention/export | `0001_core.sql` | See log |
| SEC-018 | Low | Idempotent re-init ignores patient/mime/size mismatch (wrong-patient hazard) | `recordings.ts` | See log |
| SEC-019 | Low | Duration limit and identity checks are client assertions | `recordings.ts`, `schemas.ts` | See log |
| SEC-020 | Low | Content validation is magic bytes only; no parse / AV | `recordings.ts` | See log |
| SEC-021 | Low | No per-user/org quota; concurrent PUTs; stray `.part`; unbounded JSON body | `upload/route.ts`, `recordings.ts` | See log |
| SEC-022 | Low | Signed URLs are unbound bearer tokens in query strings; replayable; play audited at mint | `storage.ts`, `play/route.ts` | See log |
| SEC-023 | Medium | Public demo password for all seed users + enrol-on-first-login; `seed` unguarded | `scripts/seed.ts`, `scripts/db.ts` | See log |
| SEC-024 | Medium | Only runnable hosted config needs `PREVID_ALLOW_DEV_ADAPTERS=true`; hardening keyed off `NODE_ENV` | `providers.ts`, `config.ts`, `proxy.ts` | See log |
| SEC-025 | Low | Retention correctness (setting change not applied to existing; metadata kept; no erasure path) | `recordings.ts`, `admin.ts` | See log |
| SEC-026 | Low | PHI in patient-search query string | `patients/page.tsx` | See log |
| SEC-027 | Low | Session/cookie hygiene (persistent cookie, no `__Host-`, sessions never purged) | `identity.ts` | See log |
| SEC-028 | Low | TOTP details (non-atomic replay, no AAD/key id) | `identity.ts`, `totp.ts` | See log |
| SEC-029 | Info | `complete` returns 403 (not 404) and is unaudited for another user's recording | `recordings.ts` | See log |
| SEC-030 | Info | Server Actions tolerate missing Origin; `status` bind arg not runtime-validated | `actions/admin.ts` | See log |
| SEC-031 | Info | CSP/header notes (Supabase hosts needed; `/login/mfa` cache header untested) | `proxy.ts`, `next.config.ts` | See log |
| SEC-032 | Info | Supply chain / CI hygiene (tag-pinned actions, no Dependabot/SAST/SBOM) | `ci.yml` | See log |
| SEC-033 | Info | Some `SECURITY_REQUIREMENTS.md` claims stronger than evidence | `SECURITY_REQUIREMENTS.md` | See log |
| SEC-034 | Low | DB TLS not enforced in code (Needs verification) | `db/index.ts` | See log |
| SEC-035 | Info | Next logs uncaught errors that may include DB `detail` values (Needs verification) | `admin.ts`, `patients.ts` | See log |

## Details

**SEC-001 (High) — pre-takeover.** An org admin who creates a user sees that user's password (no forced change). Until the real user logs in, the account has no TOTP secret and
`mfaBeginEnrolment` serves the secret to whoever presents the password, so the first enroller owns MFA. (a) Same org: the admin signs in as the user and enrols MFA; actions are audited as the victim.
(b) Cross-tenant: because `app_find_user_id_by_email` searches all users, a malicious org-A admin pre-creates `dr.x@trust-b.example` and enrols their own TOTP; when org-B's admin later adds that email,
the existing (attacker-controlled) user is given the role B chose, with access to B's patients and video. *Fix:* email-verified invitation/activation (user sets own credentials via single-use expiring link; MFA enrolment only from an activated session); admins never see credentials; existing users accept cross-org invites; audited step-up MFA reset.

**SEC-002 (Medium).** The definer lookup is gated only by "caller is admin of the current org"; response differs for existing emails and the foreign user's name/email then becomes visible. *Fix:* invitations that activate on acceptance, uniform responses, audit + rate-limit lookups.

**SEC-003 (Medium).** The PUT is authorised only by the HMAC token, never the DB row; replayable until expiry (15 min). `complete` does head → readStart(16) → update with no re-check, so after `complete` a re-PUT can replace verified bytes. *Fix:* single-use token bound to a `pending_upload` row checked at PUT start; hash at complete; immutable object.

**SEC-004 (Medium).** After delete/purge, an unexpired PUT token can re-create the object; `storage_deleted_at` is already set so the sweep never revisits it. *Fix:* as SEC-003; periodic storage-vs-rows reconciliation.

**SEC-005 (Medium).** `requestMeta` trusts the first `x-forwarded-for` entry (client-controlled behind appending proxies); a missing header yields a null hash that *skips* the IP limit. Each attempt costs a 32 MiB scrypt. Safe on Vercel (header overwritten) but only "verify" is documented. *Fix:* trusted client-IP source; missing IP ⇒ shared bucket; cap concurrent password verifications.

**SEC-006 (Medium).** `login:email` allows 10/15 min and 5 failures lock 15 min, both keyed on the victim's email: ~5 requests/15 min keeps a known clinician out of point-of-care access. *Fix:* per (email, device/IP) throttling with progressive delay; admin unlock/recovery; alert on repeated locks.

**SEC-007 (Low).** `failed_attempts` is shared by password and TOTP and zeroed by a correct password, so a password holder can alternate to extend TOTP guesses (~2,900/day vs ~480/day). *Fix:* separate counters.

**SEC-008 (Low).** Only existing accounts return `locked`, enumerating accounts after 5 bad passwords. *Fix:* generic message; notify user.

**SEC-009 (Medium).** `count(*)` then update in READ COMMITTED with no row lock lets two admins demote/suspend each other concurrently, leaving zero admins. *Fix:* `for update` on admin rows.

**SEC-010 (Medium).** No password change/reset, MFA reset/lost-device, sign-out-everywhere, breached-password screening; temp password never expires; `validatePasswordStrength` is unused. *Fix:* in the hosted identity providers; enforce policy wherever a password is set.

**SEC-011 (Medium, Needs verification).** Definer functions use `search_path = public` without `pg_temp` last; `PUBLIC` has TEMP on the DB and (after our `reset`) CREATE on schema `public`. A session as `previd_app` could create `pg_temp.memberships` and make `app_is_member()` true. *Fix:* `search_path = pg_catalog, public, pg_temp`; revoke TEMP/CREATE from PUBLIC; regression test as `previd_app`.

**SEC-012 (Medium, design limitation).** RLS trusts GUCs the role can set; any SQL execution as `previd_app` (SQLi, compromised dependency) can impersonate any user, read hashes/encrypted TOTP secrets and insert a pre-authenticated `local_auth.sessions` row. No SQL injection was found (all queries parameterised). *Mitigation direction:* hosted identity keeps credentials out of the app role; consider JWT-claim-based RLS or per-request roles; never host `local_auth`.

**SEC-013 (Low).** `system_due_recordings` / `system_mark_object_deleted` are callable by any app-role session and span tenants. *Fix:* separate cron role; separate delete-requested vs storage-confirmed states.

**SEC-014 (Low).** DB policies don't enforce own-vs-any delete, `recorded_by` immutability, or immutability of `storage_key/status/purge_after`; `audit_insert` accepts any `actor_user_id`; users may self-update `email`/`status`. *Fix:* column grants, freeze triggers, bind actor.

**SEC-015 (Medium).** Only `patient.view`, `recording.play` (at mint) and writes are audited; patient list/search (names, DOB, NHS number for up to 100 patients), MDT view, dashboard, audit-log reads, rejected uploads and lockouts leave no trace.

**SEC-016 (Low).** Every failed login writes an unauthenticated NULL-org audit row; `audit_select` requires non-null org so admins never see probes; rate-limit rows are cleaned only every 2 days.

**SEC-017 (Low).** Owner/superuser can alter audit rows; no hash chain, external sink or retention.

**SEC-018 (Low).** An idempotency-key hit returns the existing row without comparing patient/mime/size/checks; a client bug/tamper reusing a key yields "saved" against the *original* patient (wrong-patient hazard). *Fix:* require identical fields else 409.

**SEC-019 (Low).** Duration is never measured server-side; `identity_verified_at` is a client attestation. *Fix:* measure server-side; describe the control honestly in the safety case.

**SEC-020 (Low).** MP4 passes if bytes 4–8 are `ftyp`; WebM on EBML magic alone. Arbitrary data can be stored in-tenant; malformed streams reach viewers' decoders. *Fix:* sandboxed probe/transcode, optional AV, min size.

**SEC-021 (Low).** 30 pending recordings per 10 min × up to 500 MB each, reaped after 24 h; no org quota/concurrency limit; `.part` files not cleaned after a crash; `req.json()` unbounded.

**SEC-022 (Low).** Playback tokens (120 s) sit in the query string, aren't bound to a user/session, aren't single-use, and survive delete/suspension until expiry; `nodownload` is cosmetic; play audited at mint not stream. `Referrer-Policy: no-referrer` limits leakage.

**SEC-023 (Medium).** Seed gives every user the public password `PreVid-demo-2026!`; with enrol-on-first-login any environment that loaded the seed lets anyone take over un-enrolled demo accounts (including a demo `org_admin`). `seed` has no environment guard (unlike `reset`).

**SEC-024 (Medium).** The only runnable hosted configuration needs `PREVID_ALLOW_DEV_ADAPTERS=true` or `NODE_ENV != production` (weaker CSP, non-Secure cookie). *Fix:* don't host until Supabase adapters exist; key hardening off an explicit variable.

**SEC-025 (Low).** `purge_after` is fixed at completion so retention changes don't apply to existing recordings; deleted rows keep metadata forever; no patient erasure / legal-hold path.

**SEC-026 (Low).** GET `?q=` search can contain names/NHS numbers → browser history and platform logs.

**SEC-027 (Low).** Persistent cookie, no `__Host-` prefix, old sessions not revoked on new login, sessions never purged, no per-user cap.

**SEC-028 (Low).** TOTP replay check is read-then-update (not atomic); accepting step+1 rejects the user's own next code for 30–60 s; AES-GCM secret has no AAD/key id/rotation; password-only sessions of un-enrolled accounts receive the secret.

**SEC-029 (Info).** `complete` on another user's recording returns 403 and isn't audited.

**SEC-030 (Info).** Next.js Server Actions tolerate a missing Origin (CSRF then relies on SameSite=Lax); `setStatusAction`'s `status` is typed but not runtime-validated (DB check rejects bad values).

**SEC-031 (Info).** CSP verified effective for the current app (nonce, strict-dynamic, object-src none, base-uri self, frame-ancestors none, form-action self). Supabase hostnames will need adding to `connect-src`/`media-src`; `/api/storage` bypasses the proxy (no CSP; `nosniff` set); `no-store` set for `/o/*` and `/api/*` only — `/login/mfa` (renders the TOTP secret) relies on Next's dynamic default; add a header test.

**SEC-032 (Info).** CI gates `npm audit` at high only; actions pinned by tag not SHA; no Dependabot, secret scanning, SAST, SBOM.

**SEC-033 (Info).** `SECURITY_REQUIREMENTS.md` rows #6, #9, #10 claimed more than the evidence supports; no tests covered SEC-003/004/018.

**SEC-034 (Low, Needs verification).** No `ssl` option on the DB client; transport security depends on the connection string.

**SEC-035 (Info, Needs verification).** Next logs uncaught page/action errors with the driver message; Postgres unique-violation `detail` includes key values (email, synthetic ref).

## Reviewed and found adequate (reviewer's list)
RLS enabled on 9 tenant tables, app role non-owner/non-super/no BYPASSRLS, unset GUC yields no rows · `app_is_member` re-reads active membership/user/org each time (forged `app.org_id` yields nothing; suspension immediate) ·
composite FKs block cross-tenant links even for the owner · slug resolution joins to the caller's active membership with uniform, audited 404 · every service enforces the matching permission and repeats `org_id` · URL ids uuid-validated ·
no SQL injection found (parameterised; `ilike` escaped; only `unsafe` use is the owner-only script) · session tokens 256-bit, hash-only storage, rotation on MFA, server-side revoke, idle/absolute timeouts, per-request user/membership status check ·
scrypt N=2^15 with salt + constant-time compare, dummy-hash path for unknown emails · MFA mandatory before any org access, TOTP secret AES-256-GCM, sequential replay rejected · HMAC storage tokens with timing-safe compare, op/key binding, expiry, key regex + resolved-path check ·
upload checks content-type vs signed mime, content-length ≤ signed max, streaming byte limit, temp-file rename · playback `no-store`/`nosniff`, strict Range parsing, only `available` recordings in caller's org, minting rate-limited and audited fail-closed ·
JSON API CSRF (Origin = Host + JSON) · cron secret constant-time, definer functions re-check dueness · no `dangerouslySetInnerHTML`/`eval`, internal-only redirects, security headers, no `X-Powered-By` · no secrets in client bundle · generic JSON errors (name + SQLSTATE logged only) ·
audit metadata allow-list, keyed-HMAC IPs, app role SELECT+INSERT only · idempotency unique per (org,key), other users get 409 · `npm audit` 0 vulns, `tsc` clean · synthetic-only constraint + banner; `reset` refuses non-local/non `*_dev|*_test` DBs.

## Not reviewed / limitations
Supabase Auth/Storage adapters do not exist (hosted identity AAL2/invites/reset/email verification, Storage policies and signed-URL semantics, service-role handling and residency unreviewed; SEC-001/002/003/010/022 **must be re-tested** when they land) ·
no dynamic testing by the reviewer; no pen test, fuzzing, DAST/SAST, malware or media-parser testing, or real-device testing · hosting, TLS termination, backups/DR, secret rotation, logging, alerting, IR and data residency not assessed ·
git history not scanned for secrets · governance documents not reviewed for correctness · Next.js default cache headers and bound-argument encryption assumed, not verified · working tree only, as of 2026-11-20. Passing tests are not evidence of security.

---

## Remediation log (orchestrator, 2026-11-20, after commit `3222214`)

Re-run after fixes: 78 unit/RLS tests and 47 Playwright tests (desktop + mobile emulation) passed; `tsc`, ESLint clean; `npm audit` 0 vulnerabilities. **This is not independent re-verification** — the reviewer has not re-reviewed the fixes.
Migration `0002_security_hardening.sql`, `local-auth/0002_separate_totp_counter.sql`.

| ID | Status | What changed / what remains |
|---|---|---|
| SEC-001 | **Mitigated — NOT closed** | Cross-tenant pivot blocked: a user can only be added to a second organisation if `users.email_verified_at` is set (test: "shadow-account takeover"). Only the hosted adapter's emailed-invitation acceptance may set it. **Still open:** an org admin can take over an account they create in their *own* org (they know the temp password and can enrol MFA first). Needs the Supabase/Entra email-verified invite flow; re-test then. |
| SEC-002 | **Mitigated** | Existing-user lookup now only returns verified users; unverified addresses give a refusal. Existence of verified accounts is still inferable by org admins, and verified users are still added without their consent (invitation acceptance planned). |
| SEC-003 | **Fixed (regression test)**, residual | Upload PUT requires the recording row to still be `pending_upload` (`system_upload_allowed`), so tokens cannot be replayed after `complete`. Residual: a replay between `head`/magic-byte check and the status update is still possible within the user's own pending upload (narrow). |
| SEC-004 | **Fixed (regression tests)** | PUT refused once deleted/failed/available/purged. Storage-vs-rows reconciliation still planned. |
| SEC-005 | **Partially mitigated** | A missing IP now shares one rate-limit bucket instead of skipping the limit. First-`x-forwarded-for` trust and concurrent-scrypt cost remain: verify on Vercel; configure trusted-proxy handling. |
| SEC-006 | Open (design) | Needs per-device throttling + admin unlock/recovery. |
| SEC-007 | **Fixed (no automated test yet)** | Separate `totp_failed_attempts`; a correct password no longer resets it. |
| SEC-008 | **Fixed (regression test)** | Locked and invalid logins return the same message; lock recorded in the audit log (`reason: locked`). |
| SEC-009 | **Fixed (no concurrency test yet)** | Admin rows locked `FOR UPDATE` before the last-admin check. |
| SEC-010 | Open | Password change/reset, MFA reset, sign-out-everywhere: to be delivered by the hosted identity adapter. |
| SEC-011 | **Fixed (regression tests)** | `search_path = pg_catalog, public, pg_temp`; CREATE on `public` and TEMP revoked (TEMP revoke is attempted in the migration and warns if the platform refuses: **verify on Supabase**). `reset()` no longer re-grants CREATE. |
| SEC-012 | Open (design limitation) | Compromised app role can still impersonate users. Hosted identity removes credential tables from the app role's reach; never host `local_auth`. |
| SEC-013 | Open | Separate cron role planned. |
| SEC-014 | **Fixed (regression tests)**, partial | Audit actor bound to caller; users may update only `display_name`; recording identity/key columns frozen by trigger. DB-level own-vs-any delete rule not added. |
| SEC-015 | **Partially fixed** | Added `patient.list` (count only), `mdt.view`, `audit.view`, `recording.upload_rejected`. Dashboard listing, lockout events and stream-time play events not yet audited. |
| SEC-016, 017 | Open | Aggregation of unauthenticated audit rows; hash-chained/WORM audit still planned. |
| SEC-018 | **Fixed (regression test)** | Key replay must match patient, mime and size, else 409. |
| SEC-019, 020, 021 | Open | Server-side duration measurement, deeper media validation/AV, quotas. |
| SEC-022 | Open | Query-string bearer URLs remain (120 s). |
| SEC-023 | **Mitigated** | `db.ts seed` refuses anything but local `*_dev`/`*_test` databases. Demo credentials must never be loaded elsewhere. |
| SEC-024 | Open | Do not host before the Supabase adapters exist; keying hardening off an explicit variable instead of `NODE_ENV` still to do. |
| SEC-025, 026, 027, 028 | Open | Retention recompute/erasure; PHI in search URL; session cookie hygiene; TOTP atomicity/AAD. |
| SEC-029 | **Fixed (regression test)** | Completing another user's recording returns 404. |
| SEC-030 | **Fixed** | `status` validated with zod. Missing-Origin tolerance of Server Actions is framework behaviour (SameSite=Lax relied on). |
| SEC-031, 032 | Open | Header test for `/login/mfa`; SHA-pin actions, Dependabot, SBOM, SAST. |
| SEC-033 | **Fixed** | `SECURITY_REQUIREMENTS.md` rewritten with finding references. |
| SEC-034 | **Fixed (untested against real TLS)** | `DATABASE_SSL` defaults to `require` in production. |
| SEC-035 | Open | Review production logs for DB `detail` values. |

**Open Critical/High:** none Critical; SEC-001 (High) is mitigated but its same-organisation variant remains until the hosted invitation flow exists. **Do not recommend deployment with real data** until it is closed and independently re-tested.

## Changes since the independent review (not reviewed)
After the remediation above, the following security-relevant code was added and has **not** been independently reviewed: migration `0003_consent_and_placeholders.sql` (`patient_scrub_if_unused`, `patient_scrub_internal`, updated `system_mark_object_deleted`, `mdt_meeting_placeholders` + RLS), patient creation inside `initRecording` (new-patient path, savepoint on unique violation), consent columns and freeze trigger, removal of the standalone patient create/archive endpoints. Regression tests exist for consent being mandatory, scrub authorisation, placeholder RLS and reviewer denial. Re-review recommended before any hosted deployment.
