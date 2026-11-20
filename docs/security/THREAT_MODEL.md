# PreVid — STRIDE Threat Model

Reviewed 2026-11-20 (independent static review). Companion: `FINDINGS_REGISTER.md`. **This model does not assert the system is secure.**
Labels: **Implemented** · **Implemented (dev only)** (exists only in local adapters) · **Planned** · **Gap** (finding cited).

## 1. Assets
Patient videos (special-category health data; highest sensitivity) · patient demographics (name, DOB, NHS no.; plaintext columns) · recording metadata and identity attestation · the tenant boundary ·
credentials / MFA secrets / sessions · audit log · signing/encryption secrets (`SIGNING_SECRET`, `AUTH_ENC_KEY`, `CRON_SECRET`) · the app DB role · availability at point of care.

## 2. Actors
A1 unauthenticated internet user · A2 credential thief/stuffer (may spoof headers) · A3 malicious in-tenant clinician/reviewer · A4 malicious org admin (provisions users, sees temp passwords, can view video) ·
A5 compromised app/dependency/SQLi (SQL as `previd_app`) · A6 insider with DB-owner or cloud console · A7 platform provider (Vercel/Supabase) · A8 phisher.

## 3. Trust boundaries
TB1 internet→app (TLS planned, CSP/headers, CSRF, cookies, rate limits) · TB2 browser→storage via signed URLs (today the same Next.js process, `/api/storage/*`, bypassing `proxy.ts`) ·
TB3 app→DB (non-owner role; RLS on per-transaction GUCs — the app is therefore trusted) · TB4 scheduler→cron route (shared secret) · TB5 owner/migration credentials (scripts only, never in runtime) · TB6 tenant↔tenant (logical).
Flows: login (password→TOTP→cookie) · org selection (slug→membership) · record (init→PUT→complete) · playback (mint URL→stream) · admin (add user, roles, settings) · audit · retention sweep.

## 4. STRIDE table
| # | Flow | Threat | Mitigation (status) | Findings |
|---|---|---|---|---|
| 1 | Login | Credential stuffing/brute force | scrypt, per-email limit, lockout, mandatory MFA (Implemented, dev only); IP limit spoofable/skippable (Gap) | SEC-005, 007 |
| 2 | Login | Account pre-takeover via admin temp password + first-use MFA enrolment; cross-tenant shadow account | Gap | SEC-001, 002, 023 |
| 3 | Login | User enumeration | Generic message + dummy hash (Implemented, dev only); "locked" leak (Gap) | SEC-008 |
| 4 | Login/MFA | Targeted lockout of clinicians | Gap | SEC-006 |
| 5 | Session | Token theft/fixation | HttpOnly/Lax, hashed 256-bit token, rotation, idle/absolute timeouts, per-request status check (Implemented, dev only); revoke-all/purge (Gap) | SEC-010, 027 |
| 6 | Identity lifecycle | No reset/MFA recovery/password change | Gap (Supabase/Entra Planned) | SEC-010 |
| 7 | TOTP | Replay/brute force | Step monotonic, rate limits, AES-GCM at rest (Implemented, dev only); atomicity/AAD (Gap) | SEC-007, 028 |
| 8 | Org resolution | Cross-tenant via slug/ID tampering | Membership join, uniform 404, audited, org_id in every query (Implemented) | — |
| 9 | RLS/DB | Cross-tenant read/write | RLS on 9 tables, non-owner role, `app_is_member`, composite FKs (Implemented) | — |
| 10 | RLS/DB | SQL as app role impersonates any user, reads auth tables, forges sessions | Parameterised queries (Implemented); design limitation (Gap) | SEC-011, 012 |
| 11 | DEFINER functions | `pg_temp` shadowing; callable over all tenants | Gap (Needs verification) | SEC-011, 013 |
| 12 | Authorisation | Role escalation / IDOR | `requirePermission` + RLS + ownership checks (Implemented); DB lacks column/ownership rules (Gap) | SEC-014 |
| 13 | Admin ops | Last admin removed via race | Gap | SEC-009 |
| 14 | Admin ops | Email-existence oracle; non-consensual cross-org add | Gap | SEC-002 |
| 15 | Upload init | Oversize, abuse, replay | Zod, org limits, rate limit, idempotency (Implemented); quotas (Gap) | SEC-018, 021 |
| 16 | Upload PUT | Overwrite after verification; resurrect after delete | Gap | SEC-003, 004 |
| 17 | Upload complete | Fake file types | Size + magic-byte check (Implemented, shallow) | SEC-020 |
| 18 | Upload/identity | Wrong-patient recording | Banner + identity attestation (Implemented, client-asserted); idempotent mismatch (Gap) | SEC-018, 019 |
| 19 | Playback | URL leak/replay; access after revoke | 120 s HMAC, nosniff, no-store, no-referrer, audited mint (Implemented, dev only); unbound/replayable (Gap) | SEC-022 |
| 20 | Retention | Data kept beyond policy; orphaned objects | Soft delete, sweep, DEFINER re-checks (Implemented); recompute/erasure/orphans (Gap) | SEC-004, 025 |
| 21 | Audit | Missing/forged evidence | Append-only for app role, IDs only (Implemented); read coverage, tamper evidence, actor binding (Gap) | SEC-014–017 |
| 22 | Web | XSS | React escaping, no HTML sinks, CSP nonce + strict-dynamic (Implemented) | — |
| 23 | Web | CSRF | SameSite=Lax, Next Origin check, JSON route Origin+type check (Implemented) | SEC-030 |
| 24 | Web | PHI cached or in URLs | no-store on `/o`, `/api` (Implemented); `?q=` PHI (Gap) | SEC-026, 031 |
| 25 | Config/deploy | Dev adapters, demo creds, weak CSP/cookies hosted | Flag guard (Implemented); hosted reality (Gap) | SEC-023, 024 |
| 26 | Secrets | Leak via bundle/logs | `server-only`, generic errors, bundle grep (Implemented); rotation/KMS (Planned) | SEC-035 |
| 27 | Transport/at-rest | Plaintext DB link/storage | Provider TLS/at-rest (Planned, unverified); DB TLS in code (Gap) | SEC-034 |
| 28 | Supply chain | Vulnerable/malicious dependency | `npm audit` 0 vulns, lockfile (Implemented); SHA pinning/SAST (Gap) | SEC-032 |
| 29 | Cron | Unauthorised sweep trigger | Shared secret, constant-time (Implemented) | — |

## 5. Top threats (ranked at review time)
1. Account takeover / cross-tenant shadow account (SEC-001/002/023) — fixing requires email-verified invitations (Supabase). 2. Stored-video integrity/retention bypass via reusable upload token (SEC-003/004).
3. Brute force/DoS on login (SEC-005/006/007). 4. SQL-as-app-role blast radius (SEC-011/012/013). 5. Insufficient audit of PHI access (SEC-015–017). 6. Hosted dev-adapter exposure (SEC-023/024).
7. Org-admin misuse / org lockout (SEC-009, ADR-014). 8. Wrong-patient recording (SEC-018/019). 9. Retention/erasure non-compliance (SEC-025). 10. Bearer-URL leakage (SEC-022/026).

## 6. Assumptions and out of scope
Synthetic data only. Supabase/Entra adapters, hosting, TLS termination, backups and data residency are not built (Planned/unverified). Dev adapters are in scope because they are what runs today. No pen test, DAST or SAST has been performed.
