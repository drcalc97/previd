# ADR-005 Tenant isolation via app checks plus RLS driven by session settings

Status: Accepted

## Context
Isolation is the most critical property; RLS must remain portable to RDS/Azure PG.

## Decision
Every request runs in a transaction that sets app.user_id/app.org_id; policies call app_is_member() which independently verifies an active membership. App uses a non-owner role without BYPASSRLS.

## Consequences
RLS survives the move off Supabase. Cost: every query must go through withOrg/withUser/withAnon; tests must run as the app role.
