# ADR-014 Organisation admins may view video

Status: Accepted

## Context
Owner decision.

## Decision
org_admin holds recording:read and delete_any; all plays/deletes are audited.

## Consequences
Larger blast radius for admin accounts; enforce MFA and consider an access-review report. Clinical-safety review should confirm this is acceptable.
