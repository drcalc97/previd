> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 05 — DTAC Evidence Checklist

**Caveat.** My knowledge of the current Digital Technology Assessment Criteria (DTAC) version, its section names, question wording and any required answer format **must be verified against the current published NHS England DTAC** (the template, question set and guidance change between versions). The section headings used here follow the A–F structure supplied by the owner. DTAC is a self-declaration with evidence; it is not a certification. **[External review]**

Status key: Not started · Draft · Planned (design only) · Done (evidenced). Nothing below is Done.

## A. Company information

| Evidence | Status | Gap |
|---|---|---|
| Legal entity name, registered address, company number | Not started. Trading structure unknown. `<TBD>` | Decide sole trader vs limited company (affects contracts, insurance, liability) **[External review]** |
| Product name, description, intended purpose | Draft 01 | CSO/regulatory review |
| Named contacts (clinical safety, data protection, security) | `<TBD>` | Appoint |
| Professional indemnity / public liability insurance | Unknown | Obtain; check clinical software cover **[External review]** |
| Customer references, sector experience | None | Pilot with synthetic data only |
| Company ownership and related parties | `<TBD>` | |

## B. Clinical safety

| Evidence | Status | Gap |
|---|---|---|
| Named CSO with CSO training and registration | **None** | See 03 |
| DCB0129 Clinical Risk Management Plan | Not started | |
| Hazard Log | Draft 02 | Workshop needed |
| Clinical Safety Case Report | Not started | |
| Medical device position (UK MDR 2002) and registration if applicable | Unknown | See 11 |
| Evidence of clinical assurance / user testing | Not started | |

## C. Data protection

| Evidence | Status | Gap |
|---|---|---|
| Registered with ICO (data protection fee) | Unknown `<TBD>` | Check whether fee applies and pay if so **[External review]** |
| DPIA (Art 35) | Template 06 | Needs controller (Trust) involvement and DPO review |
| Controller/processor roles and Art 28 contract | **[Assumption]** Trust controller, PreVid processor | Lawyer to draft DPA **[External review]** |
| Record of processing (Art 30) | Not started | |
| DSPT (Data Security and Protection Toolkit) | Not completed. Status: none | Register organisation, complete assessment to required standard; Trusts will expect it |
| Subprocessor list and contracts (Vercel, Supabase, GitHub) | Draft in 07 | Obtain DPAs, regions, transfer mechanisms |
| Data residency statement | **Cannot be made.** Intended UK (London), unverified | Verify per component (07) |
| Retention and deletion policy | Draft 08 | |
| Breach process | Draft 10 | |
| Privacy notice / patient information | Not started | Trust-facing wording |

## D. Technical security

| Evidence | Status | Gap |
|---|---|---|
| Cyber Essentials | Not held. Status: none | See note below |
| Cyber Essentials Plus | Not held | Requires CE first plus technical verification |
| ISO 27001 | Not held, not planned | Costly for a sole developer; consider later, or rely on CE+ and DSPT first **[External review]** |
| Independent penetration test | None | Commission after build, before any real data **[External review]** |
| Vulnerability management / dependency scanning | **[Planned]** | CI tooling; evidence of patch SLA |
| Authentication: mandatory MFA | **[Planned]** | Test evidence |
| Access control: RLS, RBAC, tenant isolation | **[Planned]** | Automated tests; pen test |
| Encryption in transit and at rest | **[Planned]** (provider defaults) **[Assumption]** | Verify per provider docs and config |
| Private storage, signed URLs 60–300 s | **[Planned]** | Test evidence |
| Audit logging (IDs only) | **[Planned]** | |
| Logging/monitoring without patient data | **[Planned]** | Verify no PII in logs, including provider-side logs |
| Rate limiting, lockout, security headers | **[Planned]** | |
| Backup and recovery, tested | Unknown | Provider backup regime; restore test |
| Business continuity / DR | Not started | |
| Secure development lifecycle, code review, secrets handling | Partial, informal | Document in 09 |
| Hosting and data location | Unknown — verify | 07 |

**Note on Cyber Essentials.** Cyber Essentials has **no specific "rate limiting" requirement**. Relevant themes are password-guessing protection, MFA, secure configuration, patching/security updates, user access control, malware protection and firewalls. It certifies an **organisation's IT scope** (devices, networks, cloud services in scope), **not the application alone**. Do not cite it as proof the app is secure. Verify current requirements ("Danzell" or later question set) with IASME/NCSC. **[External review]**

## E. Interoperability

| Evidence | Status | Gap |
|---|---|---|
| Standards used (e.g. NHS number format, SNOMED CT, FHIR) | None. MVP has no integration **[Assumption]** | State "not applicable in MVP" if confirmed |
| NHS login / Entra ID / SSO support | Future (Azure Entra ID) | |
| Data export / portability | Not started | Needed for exit |
| APIs documented | None | |
| NHS number handling and validation | Not started | Modulus 11 check; verify |

## F. Usability and accessibility

| Evidence | Status | Gap |
|---|---|---|
| WCAG 2.2 AA conformance (target; verify DTAC's required level) | **[Planned]** | Accessibility audit **[External review]** |
| Accessibility statement | Not started | |
| User research / usability testing with clinicians | Not started | Include identity-check and banner tests |
| User guidance and training | Not started | |
| Supported browsers and devices statement | Not started | iOS Safari MP4, Chromium WebM, in-app browsers unsupported |
| Plain-language patient-facing information | Not started | |

## Critical gaps before any NHS use

1. No CSO, no safety case.
2. No DSPT, Cyber Essentials, pen test.
3. No DPIA agreed with a controller; no contracts.
4. Medical device status unknown.
5. No verified data location.
