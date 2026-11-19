# CLAUDE.md — working rules for PreVid

Read `ARCHITECTURE.md`, `SECURITY_REQUIREMENTS.md`, `AGENTS.md` first. **This Next.js version has breaking changes** (e.g. `proxy.ts` replaces `middleware.ts`):
read the relevant guide in `node_modules/next/dist/docs/` before using a Next API.

## Non-negotiables
1. Synthetic data only. Never add real patient data, real Trust names, or real identifiers anywhere.
2. Every tenant-scoped DB access goes through `withOrg(ctx, …)` with an `OrgContext` obtained from `requireOrg(slug)`/`getOrgContextOrNull`. Never trust a client org id.
3. Every service function calls `requirePermission`. UI hiding is not authorisation. Pages use `requirePagePermission` (404 on denial).
4. RLS stays enabled; the app connects as `previd_app` only. Never use `DATABASE_ADMIN_URL` in app code.
5. Audit metadata: IDs/enumerated codes only — no names, DOBs, NHS numbers, free text, URLs, tokens.
6. No Supabase types or storage URLs in `src/domain`; use ports. Opaque storage keys; no durable video URLs.
7. No secrets in client code; `server-only` for server modules. Never log request bodies or signed URLs.
8. Never describe PreVid as secure, compliant or certified. Report tests you could not run. Never invent results.
9. Do not provision paid services, connect accounts, deploy publicly or change security-critical settings without owner approval.
10. Do not add AI interpretation, scoring, risk prediction or diagnostic features.

## Commands
`npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` (see `TESTING.md`). Migrations are append-only: add `0002_…sql`, never edit applied files.

## Gotchas learned
- RLS hides `users` from unauthenticated lookups: provider-internal tables (`local_auth`) must not join `public.users`.
- React resets uncontrolled forms after Server Actions: re-populate `defaultValue` from returned state.
- Next.js adds a hidden `role="alert"` route announcer: select app alerts explicitly in tests.
- Pages that call the session must be dynamic (`await connection()`), or the build prerenders them.
