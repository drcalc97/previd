# ADR-012 Synthetic-data guardrail

Status: Accepted

## Context
MVP must not process real patient data.

## Decision
organisations.is_synthetic with CHECK constraint, persistent UI banner, dev-adapter production lock.

## Consequences
Releasing to real data requires a deliberate migration plus governance sign-off.
