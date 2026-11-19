# ADR-011 getUserMedia + MediaRecorder, not file capture

Status: Accepted

## Context
Input capture can route media through the device photo library.

## Decision
Capture in-browser, hold blob in memory, upload, then release. Document that zero local persistence cannot be guaranteed.

## Consequences
Format varies by browser (MP4 on iOS Safari, WebM on Chromium); real-device testing outstanding.
