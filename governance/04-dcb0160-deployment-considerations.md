> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 04 — DCB0160 Deployment Considerations

**Caveat.** From general knowledge of DCB0160 (*Clinical Risk Management: its Application in the Deployment and Use of Health IT Systems*, NHS England). Paraphrased; **verify against the current published standard**. **[External review]**

DCB0160 is the standard for the **adopting health or social care organisation**. DCB0129 is for the **manufacturer**. PreVid cannot satisfy DCB0160 on a Trust's behalf. PreVid's job is to give the Trust what it needs to do so.

## 1. Adopting NHS organisation responsibilities (expected)

| Area | Trust responsibility | Notes |
|---|---|---|
| CSO | Trust appoints a named, qualified CSO for deployment | `<Trust CSO — TBD per Trust>` **[NHS approval]** |
| Clinical risk management plan and file | Trust-level plan for deployment and use | Uses PreVid's safety case as input |
| Local hazard log | Trust records hazards specific to local use, plus those inherited from manufacturer | Local workflow hazards: MDT process, devices, consent, patient groups |
| Clinical safety case report (deployment) | Trust CSO signs deployment safety case | Based on manufacturer's DCB0129 safety case report |
| Training | Staff trained on intended purpose, limits and workflow | PreVid supplies material; Trust delivers and records |
| Local configuration | Retention days, user roles, org_admin choice, MDT procedure | Trust approves settings |
| Governance approvals | IG, DPIA, DSPT, procurement, security review (e.g. DTAC) | **[NHS approval]** |
| Incident handling | Local incident reporting and link to manufacturer | Via Trust's incident system and PreVid contact |
| Post-deployment monitoring | Review use, incidents, user feedback | |
| Change and decommissioning | Review PreVid releases for clinical impact; plan exit | |
| Device and network policy | Managed devices, browsers, no personal devices unless approved | Addresses H15 |

## 2. What PreVid (manufacturer) must supply

| Item | Status |
|---|---|
| Intended purpose statement and contraindications / exclusions | Draft 01 |
| DCB0129 Clinical Safety Case Report and Hazard Log (current versions) | Not available. Draft hazard log only (02) |
| Named manufacturer CSO and contact | **None.** `<CSO name — TBD>` |
| Known limitations and residual risks needing Trust controls | Seeded in 02 (H01–H04, H13, H15, H20) |
| Safe-use instructions and training materials | Not started |
| Configuration guide (roles, retention, MFA, org settings) | Not started |
| Browser/device support matrix | Not started |
| Release notes with clinical-impact statement | Not started |
| Incident and vulnerability reporting route and response times | Draft 10 |
| Data protection pack: DPIA input, data flow, subprocessor list | Drafts 06, 07 |
| Security evidence: pen test summary, Cyber Essentials, DSPT status | None yet; see 05 |
| Service levels and availability statement | Not defined |
| Exit/data return and deletion procedure | Draft 08 |
| Medical-device position (UKCA/CE/UKNI status, if applicable) | Unknown; see 11 |

## 3. Suggested hand-over process

1. Trust CSO receives PreVid safety pack and requests clarifications.
2. Joint review of hazard log; Trust adds local hazards.
3. Trust approves intended local use, patient groups and consent route.
4. Trust confirms IG/DPIA/DTAC/DSPT approvals before any real data.
5. Training completed and recorded; go-live decision recorded by Trust.
6. Scheduled joint review (suggest every `<interval — TBD>` and on any significant change).

## 4. Open questions

- Will Trusts accept a sole-developer manufacturer's CSO arrangement? **[NHS approval]**
- Who is accountable for the video as part of the clinical record? **[NHS approval]**
- Is a pilot with synthetic data alone enough for a Trust's governance? **[External review]**
