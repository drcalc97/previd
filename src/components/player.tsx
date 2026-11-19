"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";

/**
 * Plays a recording via a short-lived signed URL requested from the server (which authorises + audits).
 * The URL is never stored; it is re-requested when it expires.
 */
export function Player({ slug, recordingId, label, autoLoad = false }: { slug: string; recordingId: string; label: string; autoLoad?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resume = useRef<{ t: number; play: boolean } | null>(null);

  const fetchUrl = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/o/${slug}/recordings/${recordingId}/playback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not load the video.");
    return body.url as string;
  }, [slug, recordingId]);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetchUrl()
      .then(setUrl)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the video."))
      .finally(() => setLoading(false));
  }, [fetchUrl]);

  // Auto-load on mount (callers pass key={recordingId}, so state resets per recording).
  useEffect(() => {
    if (!autoLoad) return;
    let live = true;
    fetchUrl().then((u) => live && setUrl(u)).catch((e) => live && setErr(e instanceof Error ? e.message : "Could not load the video."));
    return () => { live = false; };
  }, [autoLoad, fetchUrl]);

  // If the signed URL expired mid-viewing, fetch a new one and resume at the same position.
  const onError = () => {
    const v = videoRef.current;
    if (v) resume.current = { t: v.currentTime, play: !v.paused };
    void load();
  };
  const onLoaded = () => {
    const v = videoRef.current;
    if (v && resume.current) {
      v.currentTime = resume.current.t;
      if (resume.current.play) void v.play().catch(() => {});
      resume.current = null;
    }
  };

  if (!url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-slate-900 p-4 text-white">
        {err && <Alert tone="danger">{err}</Alert>}
        <Button onClick={load} disabled={loading}>{loading ? "Loading…" : `Load video: ${label}`}</Button>
      </div>
    );
  }
  return (
    <video ref={videoRef} src={url} controls playsInline preload="metadata" aria-label={label} onError={onError} onLoadedMetadata={onLoaded}
      className="aspect-video w-full rounded-lg bg-black" data-testid="player" controlsList="nodownload noremoteplayback" disablePictureInPicture />
  );
}
