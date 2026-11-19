# ADR-006 Composite (org_id, id) foreign keys

Status: Accepted

## Context
A missed filter must not allow cross-tenant references.

## Decision
Tenant children reference (org_id, id) of parents.

## Consequences
The database rejects cross-tenant links even from privileged paths.
