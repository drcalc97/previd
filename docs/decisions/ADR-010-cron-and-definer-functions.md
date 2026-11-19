# ADR-010 Cron route over SECURITY DEFINER system functions

Status: Accepted

## Context
Retention runs with no user session but RLS hides all rows.

## Decision
Narrow SECURITY DEFINER functions re-check dueness and write the audit event; route protected by CRON_SECRET; JobRunner seam is the route itself.

## Consequences
Only privileged DB path for the app role; must be reviewed on every change.
