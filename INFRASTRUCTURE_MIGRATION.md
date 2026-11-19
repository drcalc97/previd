# Infrastructure migration (Supabase → AWS or Azure)

MVP: Vercel + Supabase (London region preferred, **unverified**). The design avoids provider lock-in at these seams.

| Concern | MVP | AWS target | Azure target | What changes |
|---|---|---|---|---|
| Database | Supabase Postgres | RDS/Aurora PostgreSQL | Azure Database for PostgreSQL | Connection string only. Run `db/migrations` as owner, `db:setup-app` for the restricted role. No Supabase extensions are used. |
| Auth | Supabase Auth | Cognito / any OIDC | **Microsoft Entra ID** (OIDC) | Write a new `IdentityProvider` adapter; map `sub` → `identity_links(provider, subject)`; enforce MFA via IdP policy. Domain users keep their UUIDs. |
| Video storage | Supabase Storage | S3 (pre-signed URLs, SSE-KMS) | Blob Storage (SAS tokens, CMK) | New `VideoStorage` adapter; object keys are already opaque (`o/{org}/r/{id}`), so objects copy 1:1. |
| Background jobs | Vercel Cron → `/api/cron/retention` | EventBridge Scheduler → same route (or Lambda) | Timer-triggered Function → same route | Keep SQL system functions; change only the trigger. |
| Hosting | Vercel | Amplify / ECS / App Runner | Container Apps / App Service | Standard Next.js `next start` container. |
| Audit sink | Postgres table | Same + CloudWatch/S3 object-lock export (planned) | Same + Log Analytics/immutable blob (planned) | Add exporter. |

## Procedure (outline)
1. Provision target DB; `pg_dump --no-owner` from Supabase → restore; run `db:setup-app`; verify `schema_migrations` checksums.
2. Create target bucket/container privately; copy objects preserving keys; verify counts + checksums (sample hash compare).
3. Deploy the new adapters behind `AUTH_PROVIDER` / `STORAGE_PROVIDER`; run the full test suite against staging.
4. Bridge identities: import users, create `identity_links` for the new provider; force MFA re-enrolment.
5. Cut over DNS, freeze writes for the final delta copy, monitor, keep Supabase read-only for rollback window.

## Per-customer dedicated deployments
The same code runs with a dedicated DB + bucket per Trust: set `DATABASE_URL`/storage config per deployment. Tenancy columns remain
(single org per deployment) so nothing forks.

## Not yet done
Adapters for S3/Azure/Entra are **not written**. Row counts, egress costs, downtime estimates and data-residency evidence are unknown.
