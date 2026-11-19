# ADR-015 404 for unauthorised page access

Status: Accepted

## Context
Avoid revealing which organisations/pages exist.

## Decision
Non-members and permission failures on pages render the same 404; denials are audited. API returns 403 for authenticated-but-forbidden actions within one's own org, 404 for other orgs.

## Consequences
Slightly harder debugging; fewer enumeration signals.
