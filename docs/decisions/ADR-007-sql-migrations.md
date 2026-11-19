# ADR-007 Plain SQL migrations with postgres.js

Status: Accepted

## Context
Owner chose SQL migrations. Portability and auditability of SQL matter.

## Decision
Version-controlled .sql files applied by a small checksum-verifying runner; queries via postgres.js; Zod at boundaries; no ORM.

## Consequences
Fewer dependencies; type safety for rows is manual.
