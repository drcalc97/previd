# Video timing — design and feasibility evidence (DRAFT for approval)

Status: **design + one feasibility spike. Nothing here is validated.** Technical validation of video-derived timing is a separate evidence stream from protocol validity and clinical validation (see `VALIDATION.md`, to be written).

## 1. Two timing modes and what they mean
| Mode | Source of time | Stored as `method` | Resolution (honest) |
|---|---|---|---|
| A. Live stopwatch | `performance.now()` (monotonic), never frame counting | `live_stopwatch` | Human reaction + display; typically tens to hundreds of ms. Do not claim better. |
| B. Frame timing | Presentation timestamps (PTS) of decoded video frames | `video_frame_markers` | **One frame interval** (≈33 ms at 30 fps; ≈66 ms at the 15 fps spike file). Elapsed time = PTS(end frame) − PTS(start frame), ±1 frame per marker. |
| C. Manual entry (fallback) | Clinician types a time from an external stopwatch | `manual_entry` | Unknown; labelled as such. |
The modes are never silently mixed or converted. A live-stopwatch value and a video-derived value for the same test are stored as separate measurements and shown side by side.

## 2. Feasibility spike (Chromium, 2026-11-21) — `scripts/spikes/frame-timing-spike.ts`
File: `tests/fixtures/sample.webm`, recorded in-browser with `MediaRecorder` (the same path clinicians use). Findings, **measured, one file, one browser**:
1. `requestVideoFrameCallback` exists and delivers per-frame `mediaTime`; 29 callbacks for a 29-frame clip, `presentedFrames` contiguous, no dropped callbacks when played at 0.5×.
2. **The file has a variable frame interval**: first interval 0.128 s, then 0.066 s (≈15.15 fps). So timestamps are irregular even in a "constant-rate" capture → VFR handling is required.
3. **`MediaRecorder` WebM reports `duration = Infinity` until played to the end** (then 1.91 s). Any design that relies on `video.duration` for review will fail for freshly recorded files.
4. Seeking to an **exact indexed PTS landed on that frame in 20/20 cases** (error 0.000 s). Seeking to a time *between* frames lands on the *earlier* frame.
5. **The naive approach is wrong**: `currentTime + 1/fps` landed on the wrong frame in 2 of 12 steps (it stayed on the same frame). This confirms the brief's warning.
6. Not tested/unknown: Safari/iOS (records fragmented MP4, H.264/AAC), Firefox, Android Chrome, H.264 in Chromium (the bundled Chromium has no proprietary codecs), long files (6 minutes ≈ 10,000 frames), seeking cost on large files, hardware-decoder behaviour. **Real-device testing is mandatory before any claim.**

## 3. Architecture
Pure, unit-testable TypeScript in `src/lib/timing/` (no React, no DOM except where noted):
- **`frameIndex`** — builds the authoritative list of frame PTS values *without decoding*:
  - **Container demux (primary)**: WebM/Matroska (Clusters, SimpleBlock/BlockGroup timecodes) and MP4 incl. fragmented MP4 (`moov`/`stts`/`ctts`, `moof`/`trun`) → sorted PTS array, frame count, nominal and median fps, VFR flag. Reads the original file via the signed playback URL with range requests; no transcoding; original untouched. Fast and deterministic; tested with synthetic container fixtures including irregular intervals and B-frame reordering.
  - **Play-through indexer (fallback / cross-check)**: plays muted at reduced rate collecting `requestVideoFrameCallback` `mediaTime`s (as in the spike); flags gaps in `presentedFrames`; slow (real-time-ish), used only if demux fails or to verify.
  - Derived `duration = lastPts + typical interval` (fixes the Infinity problem).
- **`FrameStepper`** (DOM) — "go to frame *k*" = set `currentTime` to PTS[k], then **verify** via `requestVideoFrameCallback` that `mediaTime` equals PTS[k] (±tolerance). Step forward/back = index ±1, never `currentTime ± 1/fps`. If verification fails or `requestVideoFrameCallback` is unavailable, drop to **fallback mode**: time-based stepping with a visible banner "Approximate — frame accuracy not guaranteed in this browser", and the measurement is stored with `frame_accuracy = 'approximate'`.
- **`markers`** — validation (start < end, within media, minimum interval, both present, frame indices exist in the index), elapsed calculation in integer microseconds, resolution (= max of the two adjacent frame intervals), rounding rules documented and tested.
- **`stopwatch`** — `performance.now()` based start/stop/pause/lap/reset per protocol; survives tab throttling (monotonic delta, not tick counting); records start/stop wall-clock for audit; protocol-driven rules (e.g. 6MWT countdown, no pause).
- **`<TimingEditor>`** (React) — video, timeline, current time/frame number, start/end markers, elapsed, media duration, fps info (nominal / median / VFR / resolution ±), previous confirmed result and amendment history. Keyboard: ←/→ one frame, Shift+←/→ ten frames, `I`/`O` set start/end at the current frame, Space play/pause, `[`/`]` jump to marker. Touch: ≥44 px buttons for the same actions, scrub bar with large handle. Announces frame/time changes via a polite live region. Reduced-motion respected.
- **Reproducibility**: a saved measurement stores start/end PTS (seconds, ≥6 d.p.), start/end frame index, the media fingerprint (container, frame count, first/last PTS, byte size), `method`, `index_method`, `frame_accuracy`, software version, and who/when. On reopen the editor recomputes the index and **warns if the fingerprint differs**.
- **Amendment, never overwrite**: confirmed measurements are immutable; a change creates version *n+1* with a reason code, `supersedes_id`, and a hash-chained audit event; the old value stays visible.
- **Future automation**: the marker model (`source: 'manual' | 'auto-suggested'`) and a `suggest()` hook allow later crossing detection to propose markers that a clinician must confirm. No AI in this phase.

## 4. Known limitations to state in the UI and docs
Resolution is one frame; VFR files have irregular steps; browsers differ in decoder behaviour; Safari/iOS unverified; live-stopwatch ≠ video time; timing starts/stops depend on a human judging the event in the video; recordings are lossy and may have dropped frames. None of this is clinical validation.

## 5. Test plan (technical validation)
Unit: demuxers against synthetic WebM/MP4/fMP4 fixtures (constant, VFR, B-frames, missing duration, truncated); marker validation; elapsed arithmetic and rounding; stopwatch with a fake monotonic clock. Browser (Chromium; Playwright): frame stepping lands on indexed frames for every frame of fixtures; reopen saved markers; amendment history; fallback banner when `requestVideoFrameCallback` is removed; keyboard/touch parity. **Manual, on real iPhone/Android and desktop Safari/Firefox** — to be arranged with the owner once a hosted preview exists.
