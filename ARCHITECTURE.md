# Architecture

Modular monolith: one Next.js 16 (App Router, TypeScript) application, PostgreSQL, private object storage.

```
src/
  domain/        Pure types, permission matrix, Zod schemas. No framework or provider imports.
  server/
    config.ts    Env validation (names only in errors); refuses dev adapters in production.
    db/          Pooled Postgres client; withOrg / withUser / withAnon transaction wrappers (sets RLS context).
    authz/       requireUser, requireOrg(slug), requirePermission – the single permission choke point.
    services/    patients, recordings, mdt, admin. Every function takes an OrgContext and checks a permission.
    ports/       IdentityProvider, VideoStorage (provider-independent interfaces).
    adapters/local/   Dev/test identity (scrypt + TOTP + DB sessions) and filesystem storage (HMAC-signed URLs).
    audit.ts     Append-only audit writes; metadata allow-list, IDs/codes only.
    ratelimit.ts Postgres fixed-window limiter; keyed-hash IPs.
  app/           Routes: /login, /o/[org]/…, /api/o/[org]/recordings…, /api/storage/* (dev), /api/cron/retention.
  components/    UI primitives, Recorder, Player, PatientBanner.
db/migrations/   Version-controlled SQL (owner role). db/local-auth/ = dev-only identity tables.
scripts/         db.ts (migrate/setup-app/reset/seed), seed.ts.
```

## Request flow (tenant isolation)
1. `proxy.ts` sets a per-request CSP nonce (no authorisation here).
2. Page/route calls `requireOrg(slug)`: validates session **and MFA**, then looks up the user's *active membership*
   for that slug. The slug is only a lookup key; non-members get the same 404 as a non-existent organisation.
3. Services run inside `withOrg(ctx, tx => …)`, which `set_config('app.user_id'/'app.org_id', …, true)` for the transaction.
4. Row Level Security evaluates `app_is_member(org_id, roles)` **independently** of what the app claims, as the
   non-owner `previd_app` role. Composite FKs `(org_id, id)` stop cross-tenant references at the schema level.

## Upload / playback
Init (authz, limits, idempotent pending row) → direct upload to a short-lived signed target → complete (server verifies
size + container magic bytes, sets retention date) → playback via a 120 s signed URL minted per request (audited).
Keys are opaque (`o/{org}/r/{recording}`); no URL is ever stored.

## Portability seams
`IdentityProvider` (supabase | entra | local), `VideoStorage` (supabase | s3 | azure-blob | local). Domain types never
contain Supabase objects; users have their own UUIDs linked via `identity_links`. RLS uses session settings, not
`auth.uid()`. Background work is a cron-called route (`/api/cron/retention`) over narrowly scoped `SECURITY DEFINER`
SQL functions. See `INFRASTRUCTURE_MIGRATION.md`.

## Known limitations
Local adapters are development-only. Local storage upload is a single PUT (no resumable upload yet; an interrupted
upload restarts from the local copy). No background transcoding. Single region assumptions are unverified.
