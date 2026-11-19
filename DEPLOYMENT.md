# Deployment (preparation only — nothing has been deployed or provisioned)

**Do not deploy publicly or create paid resources without the owner's explicit approval.** Synthetic data only.

## Environments
| Env | Purpose | Data |
|---|---|---|
| local | developer machine, local Postgres | synthetic seed |
| dev (Supabase free project) | hosted design/testing | synthetic |
| staging | pre-release copy (decision pending: second project vs. local) | synthetic |
| production | pilot (only after governance gates) | **not before approvals** |

## Planned steps (Supabase + Vercel)
1. **Supabase project** (owner connects the connector; I will propose the region — London `eu-west-2` — and check cost via the connector's cost step before creating anything).
2. Run `db/migrations/*.sql` as the owner (`postgres`) role; run `db:setup-app` to give `previd_app` a login (use a strong generated password).
   Do **not** apply `db/local-auth` (dev only).
3. Storage: create a **private** bucket `videos`; no public policies; server uses the service-role key only on the server.
4. Auth: enable email + TOTP MFA; disable public sign-ups (admins add users); configure SMTP later.
5. Write/enable the Supabase adapters (`AUTH_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`) — **not written yet**.
6. Vercel project: set env vars (below); set function region to `lhr1` (London); add Cron for `/api/cron/retention` with `Authorization: Bearer $CRON_SECRET`.
7. Verify: security headers, cookies `Secure`, rate-limit IP header behaviour on Vercel, cache headers on `/o/*`.

## Environment variables
See `.env.example`. Server-only: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SIGNING_SECRET`, `AUTH_ENC_KEY`, `CRON_SECRET`.
`PREVID_ALLOW_DEV_ADAPTERS` must be unset/false everywhere except the local e2e test server.

## Cost and usage monitoring (indicative, unverified)
Free tiers for development. Pilot: Supabase Pro (~$25/mo) + Vercel Pro (~$20/seat/mo) ≈ £37–£50/mo before staging; costs continue while idle.
Set spend caps/alerts in both dashboards; watch Supabase storage + egress (video), DB size, Vercel function duration; retention purge keeps storage bounded.
Vercel Hobby is non-commercial only.

## Backup and disaster recovery (requirements, not yet implemented)
Define RPO/RTO with the first customer. Minimum: daily DB backups with PITR (Supabase paid tier), storage bucket replication/export plan,
quarterly restore drill, documented in the incident plan (`governance/10-incident-response-plan-draft.md`). Backups hold patient data once real
data is used: region + retention must be covered by the DPIA.

## Data residency (unverified)
Record the region of: app execution, database, storage, backups, logs, auth, analytics (none), support/subprocessors. Do not claim UK residency
until each is verified in service configuration and contracts (`governance/07-data-flow.md`).
