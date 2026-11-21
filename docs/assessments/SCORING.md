DRAFT — compiled by an AI assistant from retrieved sources; requires review by a qualified clinician before any clinical use. Not clinical validation.

# Scoring rules and worked examples (candidate unit-test fixtures)

## Status and caveats

- Primary scoring sheets could not be fetched (see `REFERENCES.md`). Tables below were assembled from WebSearch summaries of secondary sources and are **PARTLY verified**; every boundary flagged "disputed" must be checked against the official NIA/Guralnik sheet before tests are frozen.
- Items labelled **PreVid convention** are recording rules proposed for the software (reason codes, rounding). They are not from any source.
- Recommended arithmetic: times in integer hundredths of a second, weights in integer hundredths, to avoid floating-point boundary errors (for example 6.20 vs 6.21, 11.19 vs 11.20).
- PreVid will NOT implement risk categories, normal ranges or interpretation in this phase. The only banded scores below are the SPPB's own official points, if the clinician decides to expose them.
- Nothing here is a validated surgical risk threshold.

Proposed shared result codes (PreVid convention): `completed`, `unable`, `declined`, `unsafe_not_attempted`, `stopped_early`, `aid_used`, `assistance_given`, `video_invalid`.

---

## 1. TUG

- Result: time in seconds, from the chosen start event to the chosen stop event (clinician decision pending; PROTOCOLS.md, decisions 1-2). Unit s, store to 0.01 s.
- No scoring bands (none adopted).

| # | Case | Input | Expected recorded result |
|---|---|---|---|
| T1 | Normal | start 2.00 s, stop 11.84 s on video clock | 9.84 s, `completed` |
| T2 | Aid used | cane used, time 14.20 s | 14.20 s, `completed` + `aid_used` (aid recorded, not adjusted) |
| T3 | Unable to rise without help | no independent rise | no time; `unable` |
| T4 | Physical assistance during walk | assistance given | time not valid for standard result; `assistance_given`; clinician decides |
| T5 | Participant stops mid-task | stopped at turn | no time; `stopped_early` |
| T6 | Turning point not visible on video | cannot see 3 m line crossing | no time; `video_invalid` |
| T7 | Start-event variant | "go" at 2.00 s, first movement at 2.60 s, seated at 11.84 s | 9.84 s ("go" variant) vs 9.24 s (movement variant): variants differ by 0.60 s and are not interchangeable |

---

## 2. 5xSTS

- Result: total time (s) for five completed repetitions from the chosen start to the chosen stop event. Stop event decision pending (seat contact vs full upright).

| # | Case | Input | Expected |
|---|---|---|---|
| S1 | Normal | "Go" at 1.00 s, 5th seat contact at 13.40 s | 12.40 s, `completed` |
| S2 | Arms used to push up | arms uncrossed to push | `unable` / modified; no valid time (SPPB treats as unable) |
| S3 | Fewer than five reps | 4 reps then stopped | no time; `stopped_early`, reps = 4 |
| S4 | Zero reps | cannot stand | `unable` |
| S5 | Stop-event difference | 5th full upright at 11.00 s; seat contact at 11.60 s | 11.00 s (SPPB variant) vs 11.60 s (seat-contact variant). In SPPB points 11.00 gives 4, 11.60 gives 3: shows non-interchangeability |
| S6 | Rep-count error | 6 reps performed | stop at 5th; extra rep ignored; flag for clinician check |

---

## 3. Four-metre gait speed

- Formula: speed (m/s) = 4.00 / time (s). Store full precision; display 2 dp, round half up.
- If a 6 m walk is converted (Studenski 2011 [13], PARTLY): 4 m speed = -0.0341 + 0.9816 x (6 m speed). Do not use unless a clinician chooses to; PreVid default is to measure 4 m directly.
- Two trials: faster (shorter time) used in SPPB sheets (PARTLY).

| # | Case | Input | Expected |
|---|---|---|---|
| G1 | | 4.00 s | 1.00 m/s |
| G2 | | 5.00 s | 0.80 m/s |
| G3 | Fast | 3.20 s | 1.25 m/s |
| G4 | Slow | 8.00 s | 0.50 m/s |
| G5 | Rounding | 6.40 s | 0.625 m/s, shown 0.63 |
| G6 | Two trials | 5.10 s and 4.90 s | faster 4.90 s, 0.82 m/s (0.8163) |
| G7 | Unable | cannot walk 4 m | `unable`, no speed |
| G8 | Conversion (informational) | 6 m speed 1.00 m/s | 0.9475 m/s |
| G9 | Conversion | 6 m speed 0.80 m/s | 0.75118 m/s |

---

## 4. SPPB

Total = balance (0-4) + gait (0-4) + chair stands (0-4) = 0-12. (PARTLY [10][11].)

### 4.1 Balance (0-4)

| Position | Rule | Points (additive form) |
|---|---|---|
| Side-by-side | held 10 s | 1; less than 10 s: 0 and stop (balance total 0) |
| Semi-tandem | held 10 s | 1; less than 10 s: 0, stop |
| Tandem | 10 s | 2 |
| | 3.00-9.99 s | 1 |
| | under 3 s | 0 |

Equivalent ordinal form: side-by-side not held 0; held 10 s = 1; semi-tandem 10 s = 2; tandem under 3 s = 2; tandem 3-9.99 s = 3; tandem 10 s = 4. Both give the same totals (derived by this author; PARTLY).

### 4.2 Gait, 4 m (0-4), time in seconds

| Time | Points |
|---|---|
| under 4.82 | 4 |
| 4.82 to 6.20 | 3 |
| 6.21 to 8.70 | 2 |
| over 8.70 | 1 |
| unable | 0 |

Disputed boundaries: some sheets write 6.21 vs 6.20 for the 3/2 edge; whether exactly 4.82 is 3 or 4 points (this table: 3). Times must be rounded to 0.01 s before banding (PreVid convention). Faster of two trials.

### 4.3 Chair stands (0-4)

- Single stand screen without arms first. Unable: stop, score 0.
- Five stands timed:

| Time | Points |
|---|---|
| 11.19 s or less | 4 |
| 11.20 to 13.69 | 3 |
| 13.70 to 16.69 | 2 |
| 16.70 to 59.99 | 1 |
| 60 s or more, or unable to complete five | 0 (the 60 s cap differs between sheets: DISPUTED) |

### 4.4 Worked examples

| # | Balance inputs | Gait | Chair | Components | Total |
|---|---|---|---|---|---|
| P1 | SBS 10, ST 10, T 10 | 4.50 s | 10.00 s | 4 / 4 / 4 | 12 |
| P2 | SBS 10, ST 10, T 5.00 | 6.20 s | 13.69 s | 3 / 3 / 3 | 9 |
| P3 | SBS 8.00 | 8.71 s | 16.70 s | 0 / 1 / 1 | 2 |
| P4 | SBS 10, ST 10, T 2.50 | unable | single stand unable | 2 / 0 / 0 | 2 |
| P5 | SBS 10, ST 10, T 10 | 4.82 s | 11.20 s | 4 / 3 / 3 | 10 |
| P6 | SBS 10, ST 9.99 | 4.81 s | 11.19 s | 1 / 4 / 4 | 9 |
| P7 | SBS 10, ST 10, T 10 | trials 5.10 and 4.90 s, faster 4.90 | 59.99 s | 4 / 3 / 1 | 8 |
| P8 | SBS 10, ST 10, T 3.00 | 8.70 s | 13.70 s | 3 / 2 / 2 | 7 |
| P9 | SBS 10, ST 10, T 10 | 6.21 s | 60.00 s (disputed) | 4 / 2 / 0 (expected under the 60 s or more rule) | 6 |
| P10 | incomplete: balance refused | declined | declined | 0 / 0 / 0 (record reason `declined`; clinician to decide if a total is shown) | 0 or "incomplete" (decision needed) |

Handling of an incomplete battery (missing component) is NOT confirmed by a retrieved source: do not impute; PreVid should not produce a total when a component is missing unless the official rule is confirmed.

---

## 5. 6MWT

- Distance (m) = (number of complete lengths x course length) + final partial length. With a 30 m course, one length = 30 m (ATS-style; UNVERIFIED how laps vs lengths are counted; here "length" means one 30 m traverse).
- Time fixed at 6 min; the score is distance only. Rounding of the partial length to the nearest metre is a recollection (UNVERIFIED); PreVid convention below.

| # | Case | Input | Expected |
|---|---|---|---|
| W1 | Normal | 12 lengths + 14 m | 12 x 30 + 14 = 374 m |
| W2 | Unable | declined/cannot walk | no distance; `unable` |
| W3 | Stopped early | stopped at 3:40 after 6 lengths + 0 m, symptoms | 180 m at 3:40; `stopped_early`; do NOT extrapolate to 6 min; flag as incomplete |
| W4 | Non-standard course | 25 m course, 15 lengths + 7 m | 382 m; flag `non_standard_course` (non-ATS length) |
| W5 | Near full | 20 lengths + 29 m | 629 m |
| W6 | Rests taken | total rest 45 s, 10 lengths + 3 m | 303 m; rest recorded; clock not stopped (UNVERIFIED rule) |
| W7 | Fraction | 8 lengths + 11.5 m | rounding rule needed (decision): 371.5 m exact; nearest-metre rounding gives 372 (half up) |

---

## 6. DASI

Weight table (PARTLY [18]; items identified by number; the item wording is not reproduced because licensing is unclear; see PROTOCOLS.md section 6):

| Item | Domain label (neutral) | Weight |
|---|---|---|
| 1 | personal care | 2.75 |
| 2 | indoor walking | 1.75 |
| 3 | level walking, short | 2.75 |
| 4 | stairs / hill | 5.50 |
| 5 | running, short | 8.00 |
| 6 | light housework | 2.70 |
| 7 | moderate housework | 3.50 |
| 8 | heavy housework | 8.00 |
| 9 | yard work | 4.50 |
| 10 | sexual activity | 5.25 |
| 11 | moderate recreation | 6.00 |
| 12 | strenuous sport | 7.50 |
| **Sum** | | **58.20** (computed: 275+175+275+550+800+270+350+800+450+525+600+750 = 5820 hundredths) |

Rules: "Yes" adds the item weight; "No" adds 0. Missing answers: no source rule retrieved; PreVid should refuse to total (UNVERIFIED). Items 1-3 and 7, 11, 12 weights corroborated by search summaries; the remainder rely on recollection plus the 58.2 sum check. Verify against the 1989 paper and licensor materials.

Estimated peak VO2 = 0.43 x DASI + 9.6 (mL/kg/min per one calculator source; unit not fully confirmed); METs = VO2 / 3.5. Derived from 50 exercise-tested subjects in Hlatky 1989 (PARTLY). Not a surgical population.

| # | Case | Yes items | DASI | VO2 | METs |
|---|---|---|---|---|---|
| D1 | All yes | 1-12 | 58.20 | 34.626 (34.63) | 9.893 (9.89) |
| D2 | All no | none | 0.00 | 9.60 | 2.743 (2.74) |
| D3 | Items 1-3 | 1, 2, 3 | 7.25 | 12.7175 (12.72) | 3.634 (3.63) |
| D4 | Mixed | 1, 2, 3, 4, 6, 7, 9, 10 | 28.70 | 21.941 (21.94) | 6.269 (6.27) |
| D5 | Heavy items only | 5, 8, 12 | 23.50 | 19.705 (19.71, half up) | 5.630 (5.63) |
| D6 | Single item | 12 | 7.50 | 12.825 (12.83, half up) | 3.664 (3.66) |
| D7 | Missing answer | item 6 unanswered | not computable | not computable | not computable |
| D8 | Sum check | weight table | must equal 58.20 exactly | | |

Do not attach any band, threshold or "risk" label to DASI results (a perioperative threshold exists in one cohort [20] but PreVid will not implement it).
