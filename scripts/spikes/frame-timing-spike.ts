// FEASIBILITY SPIKE (not production code). Probes frame-accurate timing behaviour of Chromium on the MediaRecorder fixture.
// Run: npx tsx scripts/spikes/frame-timing-spike.ts   Results are summarised in docs/assessments/VIDEO_TIMING.md.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const p = await b.newPage();
  const body = readFileSync("tests/fixtures/sample.webm");
  await p.route("http://spike.local/**", (r) => {
    if (r.request().url().endsWith("/v.webm")) return r.fulfill({ status: 200, body, contentType: "video/webm", headers: { "Accept-Ranges": "bytes" } });
    return r.fulfill({ status: 200, contentType: "text/html", body: "<video id=v muted playsinline></video>" });
  });
  await p.addInitScript("window.__name = (f) => f;");
  await p.goto("http://spike.local/");
  const out = await p.evaluate(async () => {
    const v = document.getElementById("v") as HTMLVideoElement;
    const res: Record<string, unknown> = {};
    res.hasRVFC = "requestVideoFrameCallback" in v;
    v.src = "/v.webm";
    await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    res.durationAtMetadata = v.duration;
    res.seekableLen = v.seekable.length;
    res.seekableEnd = v.seekable.length ? v.seekable.end(v.seekable.length - 1) : null;
    res.videoSize = [v.videoWidth, v.videoHeight];

    // 1. Build a frame index by playing through slowly and collecting rVFC metadata.
    const frames: { mediaTime: number; presentedFrames: number }[] = [];
    await new Promise<void>((resolve) => {
      v.playbackRate = 0.5;
      const cb = (_n: number, m: VideoFrameCallbackMetadata) => { frames.push({ mediaTime: m.mediaTime, presentedFrames: m.presentedFrames }); v.requestVideoFrameCallback(cb); };
      v.requestVideoFrameCallback(cb);
      v.addEventListener("ended", () => resolve(), { once: true });
      void v.play();
    });
    res.durationAfterPlay = v.duration;
    res.frameCount = frames.length;
    const pts = frames.map((f) => f.mediaTime);
    res.firstPts = pts.slice(0, 6);
    const deltas = pts.slice(1).map((t, i) => +(t - pts[i]).toFixed(5));
    res.deltaMin = Math.min(...deltas); res.deltaMax = Math.max(...deltas);
    res.deltaSample = deltas.slice(0, 12);
    res.presentedFramesContiguous = frames.every((f, i) => i === 0 || f.presentedFrames - frames[i - 1].presentedFrames >= 1);
    res.droppedBetweenCallbacks = frames.filter((f, i) => i > 0 && f.presentedFrames - frames[i - 1].presentedFrames > 1).length;

    // 2. Does seeking to a known pts land on that frame?
    const land = async (t: number) => {
      v.pause();
      const got = new Promise<VideoFrameCallbackMetadata>((r) => v.requestVideoFrameCallback((_n, m) => r(m)));
      v.currentTime = t;
      const m = await Promise.race([got, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
      return m ? m.mediaTime : null;
    };
    const exact: number[] = [], seekErrors: (number | null)[] = [];
    for (let i = 0; i < Math.min(pts.length, 20); i++) {
      const m = await land(pts[i]);
      seekErrors.push(m === null ? null : +(m - pts[i]).toFixed(5));
      if (m !== null && Math.abs(m - pts[i]) < 1e-4) exact.push(i);
    }
    res.seekLandExactCount = exact.length; res.seekLandErrors = seekErrors.slice(0, 20);

    // 3. Naive "currentTime + 1/fps" stepping vs the real next frame.
    const fps = 1 / (deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] || 1 / 15);
    res.medianFps = +fps.toFixed(3);
    const naive: number[] = [];
    for (let i = 2; i < Math.min(pts.length - 2, 14); i++) {
      await land(pts[i]);
      const m = await land(pts[i] + 1 / fps);
      naive.push(m === null ? -1 : pts.findIndex((x) => Math.abs(x - m) < 1e-4) - i);
    }
    res.naiveStepFrameOffsets = naive; // 1 = exactly one frame; 0/2 = wrong frame
    // 4. Seek to mid-frame time
    const mid = (pts[5] + pts[6]) / 2;
    const mm = await land(mid);
    res.midFrameSeek = { target: mid, landedOnFrameIndex: mm === null ? null : pts.findIndex((x) => Math.abs(x - mm) < 1e-4), expectedPrev: 5, expectedNext: 6 };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
void main();
