# ADR-008 Append-only audit log in Postgres

Status: Accepted

## Context
Avoid another subprocessor; need audit of sensitive operations.

## Decision
audit_events with INSERT+SELECT only for the app role; IDs/codes only; metadata allow-list and size cap.

## Consequences
Owner role can still alter rows; hash-chaining and external immutable export are planned.
