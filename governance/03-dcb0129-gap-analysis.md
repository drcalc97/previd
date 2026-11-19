> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 03 — DCB0129 Gap Analysis

**Caveat.** This mapping is from general knowledge of DCB0129 (*Clinical Risk Management: its Application in the Manufacture of Health IT Systems*, NHS England). The requirement list below is a paraphrase, **not** the standard's wording or numbering. **It must be verified against the current published standard text and its implementation guidance.** **[External review]**

Applicability **[Assumption]**: PreVid is health IT supplied for use in NHS-commissioned care, so a manufacturer is expected to apply DCB0129 if it is to be adopted by NHS organisations. Whether the standard formally applies, and how it interacts with UK MDR if PreVid is a medical device, needs confirmation. See 11.

## Status summary

| Area | Status |
|---|---|
| Named CSO | **Not met.** None appointed |
| Everything else | Drafts or not started |

## Gap table

| # | Requirement area (paraphrased) | Evidence expected | Current status | Gap / next step |
|---|---|---|---|---|
| 1 | Top management commitment and resourcing for clinical risk management | Documented commitment, resource allocation | Not started. Sole owner. | Owner to record commitment in plan. Resource constraints of a sole developer to be acknowledged honestly. |
| 2 | **Named Clinical Safety Officer (CSO)**: suitably qualified and experienced, registered clinician (e.g. GMC-registered doctor), with CSO training; responsible for the clinical risk management process | CSO appointment record, CV, training certificate, registration | **Not met.** Owner is a UK doctor but **assumed not a trained CSO**. **[Assumption]** | **[External review]** Owner to complete recognised CSO training, or appoint an external CSO. Consider independence of review given the owner is also developer. Record name as `<CSO name — TBD>`. |
| 3 | Clinical Risk Management Plan | Plan covering scope, process, roles, schedule, criteria for risk acceptability | Not started | Write plan; use risk scale in 02 as seed; CSO to approve. |
| 4 | Clinical Risk Management File (collates all outputs) | Controlled file/repository | This folder is a seed only | Establish version-controlled file with index, sign-offs, change history. |
| 5 | Hazard identification and Hazard Workshop with clinical and technical input | Workshop record, attendees, outputs | Initial hazard list drafted (02). No workshop held. | Hold workshop with CSO, anaesthetist/surgeon/pre-op nurse, MDT user, developer. **[External review]** |
| 6 | Risk analysis and evaluation against criteria | Scored hazards with rationale | Initial scoring in 02, unvalidated | CSO to confirm scales and acceptability. |
| 7 | Risk control and verification of controls | Control specs; test evidence that each control works | All controls **[Planned]**; no test evidence | Map each control to requirement and test; record results. |
| 8 | Hazard Log (live document) | Maintained log | Draft 02 | Adopt as live; add review dates and closure rules. |
| 9 | Clinical Safety Case and Clinical Safety Case Report (argument + evidence that system is acceptably safe for its intended use) | Signed report by CSO | Not possible yet | Produce after controls built and verified. Do not describe as complete until signed. |
| 10 | Intended purpose / scope definition feeding risk management | Written statement | Draft 01 | CSO to review. |
| 11 | Clinical safety requirements traced into design and testing (traceability) | Requirement-to-test matrix | Not started | Link hazard controls to issue tracker items and tests. |
| 12 | Usability / human factors consideration where relevant to safety | Usability test records | Not started | Test identity check, banner, MDT playback with real users using synthetic data. |
| 13 | Supplier/third-party (subprocessor) risk consideration (Vercel, Supabase, GitHub) | Assessment of dependencies' effect on safety | Not started | Add outage and region considerations (H14, 07). |
| 14 | Change management with clinical risk assessment of changes | Change procedure; per-change safety impact check | Not started (H22) | Define release procedure with safety-impact field. |
| 15 | Incident and defect handling, including clinical safety incidents | Process; incident log | Draft 10 | Add clinical-safety incident route and customer notification. |
| 16 | Post-deployment monitoring / safety surveillance (feedback, complaints, incidents, near misses) | Monitoring plan; periodic hazard-log review | Not started. Logs-only monitoring **[Planned]** with no patient data. | Define feedback channel; review cadence. Note limits: no analytics by design. |
| 17 | Communication with deploying organisations (supply information needed for DCB0160) | Safety information pack, known limitations | Not started | See 04 for supply list. |
| 18 | Configuration and version control of the safety documentation and software | Version-controlled artefacts | Repo exists; safety files draft | Tag releases against safety case version. |
| 19 | Decommissioning / end-of-life considerations | Plan for data return, deletion | Not started | Link to 08 and contract exit terms. |
| 20 | Competence of people carrying out clinical risk management | Training/competence records | None | CSO training; record competence. |
| 21 | Independence / review of safety case | Review record | None | Consider external peer review. |

## Conflict-of-interest note

The owner is clinician, developer and (potentially) CSO. A self-reviewed safety case carries weaker assurance. Consider an independent CSO or clinical reviewer. **[External review]**

## Next actions (suggested order)

1. Resolve the CSO question (train or appoint).
2. Confirm medical-device position (11), since it changes the regulatory route.
3. Write the Clinical Risk Management Plan.
4. Hold the hazard workshop; update 02.
5. Build controls with test evidence; then draft the Clinical Safety Case Report.
