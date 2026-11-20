"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { formatDuration, formatDob, formatNhs } from "@/lib/format";

type PatientInfo = { id: string; givenName: string; familyName: string; dateOfBirth: string; nhsNumber: string | null; syntheticRef: string };
type Limits = { maxDurationSec: number; maxFileBytes: number };
type Step = "details" | "verify" | "camera" | "recording" | "review" | "uploading" | "done";
type Check = "name" | "dob" | "nhs_number";

const MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}
const baseMime = (m: string) => m.split(";")[0].trim().toLowerCase();
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "") .padEnd(16, "0");

type Details = { syntheticRef: string; givenName: string; familyName: string; dateOfBirth: string; nhsNumber: string };
const EMPTY: Details = { syntheticRef: "", givenName: "", familyName: "", dateOfBirth: "", nhsNumber: "" };

function validateDetails(d: Details): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(d.syntheticRef.trim())) e.syntheticRef = "Enter a reference (letters, numbers, . _ -).";
  if (!d.givenName.trim()) e.givenName = "Enter the given name.";
  if (!d.familyName.trim()) e.familyName = "Enter the family name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth) || d.dateOfBirth < "1900-01-01" || d.dateOfBirth > new Date().toISOString().slice(0, 10)) e.dateOfBirth = "Enter a valid date of birth.";
  if (d.nhsNumber.trim() && !/^\d{10}$/.test(d.nhsNumber.replace(/\s+/g, ""))) e.nhsNumber = "NHS number must be 10 digits.";
  return e;
}

/**
 * Records a video. With `patient` it is a further recording for an existing patient; without, it is a NEW patient:
 * the details are held only in this browser until upload, and the patient is created on the server together with the
 * consent confirmation (ADR-017). Consent is confirmed for every recording.
 */
export function Recorder({ slug, patient, limits }: { slug: string; patient?: PatientInfo; limits: Limits }) {
  const [step, setStep] = useState<Step>(patient ? "verify" : "details");
  const [details, setDetails] = useState<Details>(EMPTY);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [savedPatientId, setSavedPatientId] = useState<string | null>(patient?.id ?? null);
  const [checks, setChecks] = useState<Set<Check>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"preparing" | "sending" | "finalising">("preparing");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [reviewInfo, setReviewInfo] = useState<{ size: number; duration: number } | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const durationRef = useRef(0);
  const keyRef = useRef<string>(newKey());
  const submittingRef = useRef(false); // synchronous guard against double-submit
  const liveRef = useRef<HTMLVideoElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const subject: PatientInfo = patient ?? {
    id: "",
    givenName: details.givenName.trim(),
    familyName: details.familyName.trim(),
    dateOfBirth: details.dateOfBirth,
    nhsNumber: details.nhsNumber.replace(/\s+/g, "") || null,
    syntheticRef: details.syntheticRef.trim(),
  };
  const needed: Check[] = subject.nhsNumber ? ["name", "dob", "nhs_number"] : ["name", "dob"];
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!navigator.mediaDevices?.getUserMedia && pickMime() !== null,
    () => true,
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Release camera + memory when leaving; warn before losing an unsaved recording.
  useEffect(() => () => { stopStream(); if (timerRef.current) clearInterval(timerRef.current); }, [stopStream]);
  useEffect(() => { return () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }; }, [reviewUrl]);
  useEffect(() => {
    const unsaved = step === "recording" || step === "review" || step === "uploading";
    const h = (e: BeforeUnloadEvent) => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [step]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  async function openCamera(face = facing) {
    setError(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setStep("camera");
      requestAnimationFrame(() => { if (liveRef.current) { liveRef.current.srcObject = stream; void liveRef.current.play().catch(() => {}); } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError" ? "Camera or microphone access was blocked. Allow access in your browser settings, then try again."
        : name === "NotFoundError" ? "No camera or microphone was found on this device."
        : name === "NotReadableError" ? "The camera is in use by another app. Close it and try again."
        : "Could not start the camera.",
      );
    }
  }

  function startRecording() {
    const stream = streamRef.current, mime = pickMime();
    if (!stream || !mime) return;
    chunksRef.current = [];
    let bytes = 0;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
    recorderRef.current = rec;
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) {
        chunksRef.current.push(ev.data);
        bytes += ev.data.size;
        if (bytes > limits.maxFileBytes * 0.97 && rec.state === "recording") rec.stop(); // never exceed the size limit
      }
    };
    rec.onstop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const blob = new Blob(chunksRef.current, { type: baseMime(rec.mimeType || mime) });
      chunksRef.current = [];
      durationRef.current = Math.max(1, Math.min(limits.maxDurationSec, Math.round((Date.now() - startedAtRef.current) / 1000)));
      stopStream();
      blobRef.current = blob;
      setReviewInfo({ size: blob.size, duration: durationRef.current });
      setReviewUrl(URL.createObjectURL(blob));
      setStep("review");
    };
    rec.onerror = () => { setError("Recording stopped unexpectedly. Please try again."); stopStream(); setStep("verify"); };
    rec.start(1000);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setStep("recording");
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(s);
      if (s >= limits.maxDurationSec && rec.state === "recording") rec.stop();
    }, 250);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function retake() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    blobRef.current = null;
    keyRef.current = newKey(); // a retake is a different submission
    setProgress(0);
    void openCamera();
  }

  function put(url: string, headers: Record<string, string>, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload_${xhr.status}`)));
      xhr.onerror = () => reject(new Error("network"));
      xhr.ontimeout = () => reject(new Error("timeout"));
      xhr.timeout = 10 * 60_000;
      xhr.send(blob);
    });
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob || submittingRef.current) return; // duplicate-submit guard
    submittingRef.current = true;
    setError(null);
    setProgress(0);
    setUploadPhase("preparing");
    setStep("uploading");
    try {
      const jsonHeaders = { "Content-Type": "application/json" };
      const initRes = await fetch(`/api/o/${slug}/recordings`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          ...(patient
            ? { patientId: patient.id }
            : { newPatient: { syntheticRef: subject.syntheticRef, givenName: subject.givenName, familyName: subject.familyName, dateOfBirth: subject.dateOfBirth, nhsNumber: subject.nhsNumber ?? "" } }),
          consentConfirmed: true,
          idempotencyKey: keyRef.current,
          identityChecks: [...checks],
          mimeType: blob.type,
          sizeBytes: blob.size,
          durationSec: durationRef.current,
        }),
      });
      const init = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(init.error ?? "Could not start the upload.");
      if (!init.alreadyUploaded) {
        setUploadPhase("sending");
        await put(init.target.url, init.target.headers, blob);
      }
      setUploadPhase("finalising");
      const doneRes = await fetch(`/api/o/${slug}/recordings/${init.recordingId}/complete`, { method: "POST", headers: jsonHeaders, body: "{}" });
      const done = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(done.error ?? "The server could not confirm the upload.");
      setSavedPatientId(init.patientId);
      // Success: release local copies.
      blobRef.current = null;
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
      setReviewUrl(null);
      setSavedAt(new Date());
      setStep("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg === "network" || msg === "timeout" || msg.startsWith("upload_")
          ? "The upload was interrupted. Your recording is still on this device — check your connection and tap Retry."
          : msg || "The upload failed. Your recording is still on this device — tap Retry.",
      );
      setStep("review");
    } finally {
      submittingRef.current = false;
    }
  }

  const toggle = (c: Check) => setChecks((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const verified = consent && needed.every((c) => checks.has(c)); // consent AND every displayed identifier must be confirmed

  const h = "mb-3 text-xl font-semibold outline-none";
  const back = savedPatientId ? `/o/${slug}/patients/${savedPatientId}` : `/o/${slug}/patients`;

  return (
    <div className="mx-auto max-w-2xl">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <div className="sr-only" aria-live="polite">
        {step === "recording" ? "Recording started" : step === "review" ? "Recording stopped. Review your recording." : step === "done" ? "Recording saved." : ""}
      </div>

      {step === "details" && (
        <Card aria-labelledby="details-h">
          <h2 id="details-h" ref={headingRef} tabIndex={-1} className={h}>1. Patient details</h2>
          <Alert tone="info" title="Nothing is stored yet">These details stay in this browser until you confirm consent and upload the recording. If you cancel, no patient record is created.</Alert>
          <form
            className="mt-4 flex flex-col gap-4"
            noValidate
            onSubmit={(ev) => {
              ev.preventDefault();
              const errs = validateDetails(details);
              setDetailErrors(errs);
              if (Object.keys(errs).length === 0) setStep("verify");
            }}
          >
            {([
              ["syntheticRef", "Reference", "text", "Hospital or synthetic reference number."],
              ["givenName", "Given name", "text", ""],
              ["familyName", "Family name", "text", ""],
              ["dateOfBirth", "Date of birth", "date", ""],
              ["nhsNumber", "NHS number (synthetic, optional)", "text", "10 digits."],
            ] as const).map(([k, label, type, hint]) => (
              <Field key={k} label={label} htmlFor={`d-${k}`} hint={hint || undefined} error={detailErrors[k]}>
                <Input id={`d-${k}`} type={type} autoComplete="off" inputMode={k === "nhsNumber" ? "numeric" : undefined}
                  value={details[k]} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))}
                  aria-describedby={hint ? `d-${k}-hint` : undefined} aria-invalid={detailErrors[k] ? true : undefined} />
              </Field>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Continue</Button>
              <Link href={`/o/${slug}/patients`} className="inline-flex min-h-11 items-center px-3 underline">Cancel</Link>
            </div>
          </form>
        </Card>
      )}

      {step === "verify" && (
        <Card aria-labelledby="verify-h">
          <h2 id="verify-h" ref={headingRef} tabIndex={-1} className={h}>{patient ? "1. Confirm consent and identity" : "2. Confirm consent and identity"}</h2>
          {!supported && (
            <div className="mb-4"><Alert tone="warn" title="This browser cannot record video">Use a current version of Safari (iOS 14.3+), Chrome, Edge or Firefox, and open PreVid in the browser itself rather than inside another app.</Alert></div>
          )}
          <p className="mb-3 text-muted">Ask the patient to state their full name and date of birth. Tick each item that matches the patient in front of you.</p>
          <div className="mb-4 rounded-lg border-2 border-primary p-3">
            <p className="text-lg font-semibold">{subject.familyName.toUpperCase()}, {subject.givenName}</p>
            <p>Date of birth: <strong>{formatDob(subject.dateOfBirth)}</strong></p>
            {subject.nhsNumber && <p>NHS number (synthetic): <strong>{formatNhs(subject.nhsNumber)}</strong></p>}
          </div>
          <fieldset className="mb-4 flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 font-semibold">Consent</legend>
            <label className="flex items-start gap-3 text-base">
              <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={consent} onChange={() => setConsent((c) => !c)} />
              <span>
                The patient has been told what PreVid is, who may view the recording and for how long it is kept, and agrees to being recorded and to
                their details and video being stored{patient ? "" : " (the patient record is only created when this recording is saved)"}.
              </span>
            </label>
          </fieldset>
          <fieldset className="mb-4 flex flex-col gap-3">
            <legend className="sr-only">Identity checks</legend>
            {needed.map((c) => (
              <label key={c} className="flex min-h-11 items-center gap-3 text-base">
                <input type="checkbox" className="h-6 w-6" checked={checks.has(c)} onChange={() => toggle(c)} />
                {c === "name" ? "Full name matches" : c === "dob" ? "Date of birth matches" : "NHS number matches"}
              </label>
            ))}
          </fieldset>
          <Alert tone="info">Follow your organisation&apos;s consent process. The consent wording here is a draft awaiting information-governance review.</Alert>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => openCamera()} disabled={!verified || !supported}>Continue to camera</Button>
            {patient ? (
              <Link href={back} className="inline-flex min-h-11 items-center px-3 underline">Cancel</Link>
            ) : (
              <Button variant="ghost" onClick={() => setStep("details")}>Back</Button>
            )}
          </div>
        </Card>
      )}

      {(step === "camera" || step === "recording") && (
        <Card aria-labelledby="cam-h">
          <h2 id="cam-h" ref={headingRef} tabIndex={-1} className={h}>{step === "camera" ? (patient ? "2. Position the camera" : "3. Position the camera") : "Recording"}</h2>
          <p className="mb-2 text-sm text-muted">{subject.familyName.toUpperCase()}, {subject.givenName} · DOB {formatDob(subject.dateOfBirth)}</p>
          <video ref={liveRef} muted playsInline autoPlay className="aspect-video w-full rounded-lg bg-black" aria-label="Camera preview" />
          {step === "recording" && (
            <p role="timer" className="my-3 text-center text-3xl font-semibold tabular-nums" data-testid="rec-timer">
              <span aria-hidden className="mr-2 text-danger">●</span>{formatDuration(elapsed)} <span className="text-base font-normal text-muted">/ {formatDuration(limits.maxDurationSec)}</span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {step === "camera" ? (
              <>
                <Button onClick={startRecording}>Start recording</Button>
                <Button variant="secondary" onClick={() => { const f = facing === "user" ? "environment" : "user"; setFacing(f); void openCamera(f); }}>Switch camera</Button>
                <Button variant="ghost" onClick={() => { stopStream(); setStep("verify"); }}>Back</Button>
              </>
            ) : (
              <Button variant="danger" onClick={stopRecording} className="w-full sm:w-auto">Stop recording</Button>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">Maximum {formatDuration(limits.maxDurationSec)}. The video is not saved to your photo library.</p>
        </Card>
      )}

      {step === "review" && reviewUrl && (
        <Card aria-labelledby="rev-h">
          <h2 id="rev-h" ref={headingRef} tabIndex={-1} className={h}>{patient ? "3. Review the recording" : "4. Review the recording"}</h2>
          <p className="mb-2 text-sm text-muted">{subject.familyName.toUpperCase()}, {subject.givenName} · DOB {formatDob(subject.dateOfBirth)}</p>
          <video src={reviewUrl} controls playsInline className="aspect-video w-full rounded-lg bg-black" aria-label="Recorded video for review" data-testid="review-video" />
          <p className="mt-2 text-sm text-muted">{reviewInfo ? `${formatDuration(reviewInfo.duration)} · ${mb(reviewInfo.size)}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={upload}>{error ? "Retry upload" : "Confirm and upload"}</Button>
            <Button variant="secondary" onClick={retake}>Retake</Button>
          </div>
        </Card>
      )}

      {step === "uploading" && (
        <Card aria-labelledby="up-h">
          <h2 id="up-h" ref={headingRef} tabIndex={-1} className={h}>Uploading…</h2>
          <progress value={uploadPhase === "sending" ? progress : undefined} max={100} className="h-4 w-full" aria-label="Upload progress" data-testid="upload-progress" />
          <p className="mt-2" role="status">
            {uploadPhase === "preparing" ? "Preparing upload…" : uploadPhase === "sending" ? `Uploading ${progress}%` : "Checking the recording…"}
          </p>
          <p className="mt-1 text-sm text-muted">Keep this page open until the upload finishes.</p>
        </Card>
      )}

      {step === "done" && (
        <Card aria-labelledby="done-h">
          <h2 id="done-h" ref={headingRef} tabIndex={-1} className={h}>Recording saved</h2>
          <Alert tone="ok" title="Upload and consent confirmed by the server">
            <p>Recording for {subject.familyName.toUpperCase()}, {subject.givenName} saved{savedAt ? ` at ${savedAt.toLocaleTimeString("en-GB")}` : ""}.</p>
          </Alert>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={back} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-fg" data-testid="back-to-patient">Back to patient record</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
