> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 12 — Questions for Professional Review

Abbreviations: CSO clinical safety officer; IG information governance; DPO data protection officer; RC regulatory consultant; LAW lawyer; SEC security assessor/penetration tester; TRUST adopting NHS organisation.

| # | Question | Answer from | Related doc |
|---|---|---|---|
| 1 | Does DCB0129 formally apply to PreVid, and does the owner qualify as CSO after training, or is an external CSO advisable given conflict of interest? | CSO / RC | 03 |
| 2 | Are the hazard scale, acceptability criteria and initial scores in 02 appropriate? Which hazards are missing? | CSO | 02 |
| 3 | Who should attend the hazard workshop? | CSO | 02, 03 |
| 4 | Is the intended-purpose wording safe and sufficient? Should the video carry a mandatory "supplementary only" acknowledgement? | CSO / RC | 01 |
| 5 | What staleness threshold for video validity should be flagged? | CSO / clinical users | H03 |
| 6 | What is the right consent model for filming (clinical consent, confidentiality, UK GDPR)? How is it recorded? | DPO / CSO / TRUST | H13, 06 |
| 7 | Which patient groups should be excluded (capacity, children, vulnerable) and how is dignity protected? | CSO / TRUST | H19 |
| 8 | Is the video part of the clinical record? What retention schedule applies? | IG / TRUST records manager | 08 |
| 9 | What default and maximum retention days are defensible? | IG / DPO | 08 |
| 10 | How should deletion interact with backups and subject access requests? | DPO / LAW | 08 |
| 11 | Is the Trust controller and PreVid processor in all cases? Any joint controller or PreVid-as-controller aspects? | DPO / LAW | 06 |
| 12 | What are the correct Art 6, Art 9 and Schedule 1 conditions? | DPO / TRUST | 06 |
| 13 | Is facial video "biometric data" under Art 9 in this setting? | DPO | 06 |
| 14 | Is a DPIA mandatory and does residual risk require ICO consultation? | DPO | 06 |
| 15 | Which transfer mechanism applies for Vercel, Supabase, GitHub, and are the data locations acceptable? | DPO / LAW | 06, 07 |
| 16 | Is PreVid a medical device (SaMD)? If so, what class and route? | RC / MHRA | 11 |
| 17 | What DTAC version applies now, and what evidence format is expected? | TRUST / NHS England guidance | 05 |
| 18 | Which security assurances will Trusts require (CE+, DSPT, pen test, ISO 27001)? In what order should a sole developer obtain them? | IG / SEC | 05, 09 |
| 19 | Scope and depth of penetration test, including cross-tenant testing | SEC | 05, 09 |
| 20 | What should the Art 28 data processing agreement and service contract contain (liability, SLAs, breach times, audit, exit, insurance)? | LAW | 04, 10 |
| 21 | Legal entity choice and insurance for clinical software | LAW / insurer | 05 |
| 22 | PreVid's own DSPT obligations and incident reporting route | IG | 10 |
| 23 | Should media duration/size limits, supported browsers and local-persistence statements be changed? | CSO / SEC | H15, H17, H18 |
| 24 | What accessibility standard and evidence is expected? | Accessibility auditor / TRUST | H12, 05 |
| 25 | What availability target and fallback is acceptable for MDT use? | CSO / TRUST | H14 |
| 26 | What admin and support access to production data is acceptable? | DPO / SEC | 09 |
| 27 | Should an organisation admin (org_admin) be able to view video, or should the role be split? | CSO / DPO | 01, H08 |
| 28 | What go-live gate must be satisfied before any real patient data is processed? | CSO / IG / TRUST | all |

## Suggested sequencing

1. CSO and RC questions (1–4, 16) first, as they set the regulatory route.
2. DPO and IG questions (6–15) alongside a pilot Trust.
3. Security and legal questions before contracts.
