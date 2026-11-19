# Security requirements and control status

Status legend: **Implemented** (built and covered by an automated test or reviewed in code) · **Partial** · **Planned** · **Gap**.
Passing tests is **not** evidence that PreVid is secure. See `docs/security/` for the independent review and findings register.

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 1 | Secure authentication | Partial | Dev provider: scrypt, lockout, rate limits, opaque server sessions (idle 30 min / absolute 12 h), rotation on MFA. Supabase/Entra adapter planned. |
| 2 | Mandatory MFA | Implemented (dev provider) | TOTP enforced before any org access; `auth.spec.ts`. Supabase MFA (AAL2) to be enforced in its adapter. |
| 3 | Server-side authorisation + RBAC | Implemented | `requirePermission`; `tests/unit/permissions.test.ts`; `security.spec.ts` privilege tests. |
| 4 | Tenant isolation | Implemented, needs independent verification | RLS tested as the real app role (`tests/db/rls.test.ts`, mutation-checked); URL/API/ID tampering e2e. |
| 5 | Input validation | Implemented | Zod at every boundary (`src/domain/schemas.ts`). |
| 6 | Secure uploads | Implemented | Direct signed upload, type/size/duration limits, magic-byte check, opaque keys, orphan sweep. |
| 7 | Private storage, short-lived access | Implemented (dev) / Planned (Supabase) | 120 s signed playback URLs; no durable URLs; no public bucket. |
| 8 | Encryption in transit/at rest | Planned | Provided by hosting (TLS; Supabase at-rest encryption) – to be verified, not assumed. TOTP secrets AES-GCM in dev provider. |
| 9 | Session management | Partial | httpOnly, SameSite=Lax, Secure in production; sessions revocable server-side. |
| 10 | Rate limiting | Implemented (Postgres) | Login (IP+email), MFA, upload-init, playback. IP trust relies on platform-set `x-forwarded-for` (verify on Vercel). |
| 11 | CSRF | Implemented | Server Actions: Next.js Origin check; JSON APIs: Origin must equal Host + JSON content type. |
| 12 | OWASP basics / safe errors | Partial | Generic error bodies, no stack/DB detail; broader review pending. |
| 13 | No secrets in client bundle | Implemented | `server-only` modules; CI bundle scan; service-role key never imported client-side. |
| 14 | No sensitive data in logs/analytics | Partial | No analytics; API errors log name+code only; audit holds IDs only. Needs log review once deployed. |
| 15 | Audit logging | Implemented | Sign-in, denials, patient view/create/archive, recording init/complete/play/delete/purge, MDT, admin changes. Append-only for the app role. |
| 16 | Security headers | Implemented | CSP (nonce, strict-dynamic), HSTS, nosniff, DENY framing, no-referrer, Permissions-Policy, no-store on authenticated routes. |
| 17 | Dependency scanning | Implemented | `npm audit` in CI (0 production vulns at last run). |
| 18 | Hash-chained / tamper-evident audit | Gap | Owner role can alter audit rows. |
| 19 | Pen test, DAST, SAST | Gap | Not performed. |

## Rules
No service-role keys in browsers. Never trust a client-supplied organisation id. Dev adapters refuse to start in production
unless `PREVID_ALLOW_DEV_ADAPTERS=true` (which must never be set in a real deployment). Synthetic data only.
