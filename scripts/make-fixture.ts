// One-off: records a 2-second synthetic canvas animation with Chromium's MediaRecorder -> tests/fixtures/sample.webm
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const b64: string = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 240;
    const ctx = c.getContext("2d")!;
    const stream = c.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(200);
    let i = 0;
    const t = setInterval(() => { ctx.fillStyle = `hsl(${(i * 20) % 360} 70% 50%)`; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = "#fff"; ctx.fillText(`synthetic ${i++}`, 20, 120); }, 66);
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(t); rec.stop(); await done;
    const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = ""; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  });
  writeFileSync("tests/fixtures/sample.webm", Buffer.from(b64, "base64"));
  await browser.close();
}
void main();
