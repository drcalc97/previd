# AGENTS.md — team roles, ownership and rules

Orchestrator (lead architect) owns interfaces, integration and merges; specialists own the paths below and do not edit others' files.

| Agent | Owns (exclusive write) | Definition |
|---|---|---|
| 1 Product/Clinical UX | `PRODUCT_SPEC.md`, `docs/ux/**` | `.claude/agents/product-ux.md` |
| 2 Frontend | `src/app/**` (pages), `src/components/**` | `.claude/agents/frontend.md` |
| 3 Backend/DB | `db/**`, `src/server/**` except adapters | `.claude/agents/backend.md` |
| 4 DevOps | `.github/**`, `vercel.json`, `.env.example`, `src/server/adapters/**`, `DEPLOYMENT.md`, `INFRASTRUCTURE_MIGRATION.md` | `.claude/agents/devops.md` |
| 5 Security | `docs/security/**`, `SECURITY_REQUIREMENTS.md`, `tests/e2e/security.spec.ts` | `.claude/agents/security.md` |
| 6 Clinical safety & governance | `governance/**` | `.claude/agents/clinical-safety.md` |
| 7 QA | `tests/**` (except security spec), `playwright.config.ts`, `TESTING.md` | `.claude/agents/qa.md` |
| Orchestrator | `src/domain/**`, `src/server/ports/**`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `docs/decisions/**` | — |

Rules: the Security agent can block a milestone with an open Critical/High finding. Governance output is draft gap analysis — never a compliance claim.
No agent bypasses a security control to make a feature work. Agents do not commit/merge; the orchestrator does after tests pass.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
