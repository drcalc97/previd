# Testing

| Layer | Tool | Where | What it proves |
|---|---|---|---|
| Static | TypeScript, ESLint | `npm run typecheck`, `npm run lint` | Types, React hooks rules |
| Unit | Vitest | `tests/unit` | Permission matrix, TOTP (RFC 6238 vectors), password hashing, token signing/path traversal, Zod schemas, formatting |
| Database / RLS | Vitest against real PostgreSQL as `previd_app` | `tests/db` | Cross-tenant read/write denial, role enforcement, append-only audit, composite FKs, system function guards |
| End-to-end | Playwright (Chromium, fake camera) desktop + Pixel 7 emulation | `tests/e2e` | Auth/MFA/lockout, full record→upload→playback, interrupted upload + retry, duplicate submit, cross-tenant URL/API attacks, privilege escalation, CSRF, upload abuse, headers, MDT, admin, retention/purge, axe accessibility |

## Running
```bash
npm run db:test-reset        # rebuilds previd_test (needs local Postgres; env in .env.test)
npm test                     # unit + RLS
npm run build && npm run e2e # global setup re-seeds the test DB and starts `next start` on :3100
```
`.env.test` is git-ignored; CI writes it from workflow variables.

| Integration (real Supabase Auth) | Vitest, gated by env | `tests/integration` | Supabase identity adapter against the dev project over HTTPS (needs `NODE_USE_ENV_PROXY=1` in the sandbox; skipped when the env vars are absent) |

## What is NOT covered
Real iOS/Android devices and Safari (emulation only; MediaRecorder behaviour differs); resumable-upload recovery after browser
close; load/performance; screen-reader testing (axe only finds a subset of WCAG issues); penetration testing; Supabase adapters
(not written); email flows; backup/restore drills. A test passing here does not demonstrate clinical safety or security.

## Notes
- Two e2e tests intentionally exercise the login limiter; the helper clears `rate_limits` so the suite can sign in repeatedly.
- The mutation check for RLS (disable RLS on `patients` → tests fail) was performed manually once; repeat it when policies change.
