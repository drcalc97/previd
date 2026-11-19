> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 09 — Information Security Policy (draft)

Policy owner: `<owner name — TBD>`. Approved by: `<TBD>`. Review: at least annually `<TBD>`. **[External review]** This is a policy draft, not evidence that any control operates. Controls below are **[Planned]** unless stated.

## 1. Scope

PreVid application, source code, build pipeline, hosting and subprocessor accounts, staff devices used for administration, and all data processed. MVP: synthetic data only. No real patient data until approvals in 05 are complete.

## 2. Roles

| Role | Holder |
|---|---|
| Information security lead | `<TBD>` (owner, as sole developer, by default) |
| Clinical Safety Officer | `<CSO name — TBD>` |
| DPO / data protection contact | `<TBD>` |

## 3. Policy statements

| Area | Statement |
|---|---|
| Access control | Least privilege. Three application roles (org_admin, clinician, mdt_reviewer). Tenant isolation by RLS plus application checks. Access reviews `<interval TBD>`. Leavers removed promptly |
| Authentication | Mandatory MFA for all application users and for all administrative accounts (Vercel, Supabase, GitHub, domain, email). Sign-in lockout and rate limiting |
| Passwords | Long passphrases; password manager; no reuse; breach-password check `<Planned TBD>` |
| Data classification | Patient video and identifiers = highest sensitivity. Audit and metadata = confidential. Code = internal |
| Encryption | In transit (TLS) and at rest via providers **[Assumption]**; verify configuration |
| Storage and media | Private buckets; no public URLs; signed URLs 60–300 s; opaque object names (no names or NHS numbers) |
| Logging | Append-only audit (IDs only). Application logs must not contain patient data, video URLs or tokens |
| Monitoring | Logs-only. No analytics or third-party trackers |
| Secure development | Version control; code review (self-review limits acknowledged; seek second reviewer `<TBD>`); automated tests including cross-tenant tests; dependency and secret scanning in CI; pinned dependencies; no production data in dev |
| Secrets | Held in provider secret stores; never in repo; rotation on suspicion and `<interval TBD>`; service-role keys never exposed to browser |
| Environments | Separate dev/test/prod projects and keys. Visible synthetic-data marker in MVP |
| Vulnerability and patch management | Critical updates within `<TBD days>`; scheduled dependency updates; subscribe to advisories for Next.js, Supabase, Vercel |
| Security headers and web hardening | CSP, HSTS, X-Content-Type-Options, frame protections, referrer policy, secure cookies |
| Endpoint security | Owner's admin devices: full-disk encryption, auto-lock, OS patching, anti-malware, firewall, no shared accounts (aligned with Cyber Essentials themes) |
| Supplier management | Review Vercel, Supabase, GitHub terms, DPAs, security evidence, regions; maintain subprocessor register |
| Backup and recovery | Confirm provider backups; restore test `<TBD>`; document RPO/RTO `<TBD>` |
| Physical security | Provider-managed; owner's workplace `<TBD>` |
| Remote/support access | No standing production access to patient data; any access logged and justified `<TBD>`; customer notified where contract requires |
| Incident response | See 10 |
| Business continuity | Fallback: MDT proceeds without video (see H14); status communications `<TBD>` |
| Security testing | Independent penetration test before real data; retest after fixes **[External review]** |
| Training | Owner completes information governance and security training (e.g. NHS-aligned) `<TBD>` |
| Compliance | Work toward Cyber Essentials / CE+, DSPT; consider ISO 27001 later. None held now |
| Exceptions | Documented, time-limited, risk accepted by `<TBD>` |

## 4. Sole-developer risks to acknowledge

- Single point of failure for access, response and reviews: plan a trusted deputy and sealed emergency credentials `<TBD>`.
- No separation of duties: compensate with automated checks and external review.

## 5. Open questions

| # | Question | Who |
|---|---|---|
| 1 | Is the Cyber Essentials scope the owner's company IT plus cloud services? | Certification body / consultant |
| 2 | Required patch timelines and pen test scope for NHS customers | Trust security lead |
| 3 | Acceptable supplier access to production data | DPO / IG lead |
