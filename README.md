# PreVid

Independent, multi-tenant clinical video assessment platform (UK/NHS focus). Authorised clinicians record short
preoperative-assessment videos and review them in MDT meetings. **Development build — synthetic data only.**

> PreVid supplements written clinical information. It does not replace formal preoperative assessment, determine
> fitness for surgery, or provide AI interpretation, diagnosis or risk prediction.
> **It is not certified, not DCB0129/DCB0160 assured, not DTAC assessed and has no regulatory status.** See `governance/`.

## Status (end of Milestone 1)

| Area | State |
|---|---|
| Sign-in, mandatory TOTP MFA, lockout, rate limiting | Working (development identity provider) |
| Organisations, roles, tenant isolation (RLS + app checks) | Working, tested |
| Patients, identity check, mobile recorder, upload w/ progress + retry, playback, timeline | Working (local dev storage) |
| MDT meetings + viewer, admin (users/roles/settings/audit), retention + deletion | Working |
| Supabase Auth / Storage adapters | **Not written yet** (needs your Supabase project) |
| Vercel deployment | **Not done** (needs your approval) |
| Independent security review (static) | Done: 35 findings, most Medium+ addressed or mitigated, **fixes not re-reviewed**; see `docs/security/` |
| Penetration test, real-device testing, clinical safety sign-off | **Not done** |

## Quick start (local development)

Needs Node 22+ and a local PostgreSQL 16 (or Docker). Hosted Supabase replaces local Postgres in the next milestone.

```bash
npm install
cp .env.example .env.local        # then fill in the secrets (see comments) and DB URLs
npm run db:migrate                # applies db/migrations + db/local-auth as the owner role
npm run db:setup-app              # gives the restricted app role a password
npm run db:seed                   # synthetic organisations, users, patients, one MDT list
npm run dev
```

Demo users (all use password `PreVid-demo-2026!`; you are asked to enrol an authenticator app on first sign-in):

| Email | Organisation | Role |
|---|---|---|
| admin@northfield.demo | Northfield | Org admin |
| clinician@northfield.demo | Northfield | Clinician |
| reviewer@northfield.demo | Northfield | MDT reviewer (read-only) |
| admin@riverside.demo / clinician@riverside.demo | Riverside | Admin / Clinician |
| multi@previd.demo | both | Clinician in two organisations |

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` | Unit + database (RLS) tests (needs the test DB, see `TESTING.md`) |
| `npm run build && npm run e2e` | Production build + Playwright (desktop + mobile emulation, axe) |
| `npm run db:test-reset` | Rebuild the `*_test` database |

## Documentation

`PRODUCT_SPEC.md` · `ARCHITECTURE.md` · `DATABASE_SCHEMA.md` · `SECURITY_REQUIREMENTS.md` · `INFRASTRUCTURE_MIGRATION.md`
· `DEPLOYMENT.md` · `TESTING.md` · `CLAUDE.md` / `AGENTS.md` (contributor + agent rules) · `docs/decisions/` (ADRs)
· `docs/security/` (threat model, findings register) · `governance/` (draft clinical-safety / IG documents) · `docs/PHASE0_PLAN.md`.
