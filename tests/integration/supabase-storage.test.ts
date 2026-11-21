/**
 * Integration tests of the Supabase Storage adapter against the REAL dev project (private `videos` bucket, synthetic video).
 * Skipped unless SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY are set.
 * In the sandbox the secret key is injected by the network proxy (the env value is a placeholder).
 * Run: NODE_USE_ENV_PROXY=1 SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SERVICE_ROLE_KEY=placeholder npx vitest run tests/integration/supabase-storage.test.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseStorage } from "../../src/server/adapters/supabase/storage-core";

const url = process.env.SUPABASE_URL, pub = process.env.SUPABASE_PUBLISHABLE_KEY, secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!(url && pub && secret);
const bucket = process.env.SUPABASE_VIDEO_BUCKET ?? "videos";
const video = readFileSync("tests/fixtures/sample.webm");

const rid = () => crypto.randomUUID();
const KEYS: string[] = [];
const newKey = () => {
  const k = `o/${rid()}/r/${rid()}`; // same opaque shape the app uses
  KEYS.push(k);
  return k;
};

describe.skipIf(!enabled)("Supabase Storage adapter (real service)", () => {
  const client = enabled ? createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } }) : (undefined as never);
  const storage = enabled ? createSupabaseStorage({ client, bucket }) : (undefined as never);

  afterAll(async () => {
    if (enabled) await client.storage.from(bucket).remove(KEYS);
  });

  const put = (target: { url: string; headers: Record<string, string> }, body: BodyInit, headers: Record<string, string> = {}) =>
    fetch(target.url, { method: "PUT", headers: { ...target.headers, ...headers }, body });

  it("uploads through a signed URL; the object has the right size/type and starts with the container signature", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: video.length + 2048, expiresInSec: 900 });
    expect(t.method).toBe("PUT");
    expect(new Date(t.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const res = await put(t, video);
    expect(res.status, await res.clone().text()).toBeLessThan(300);

    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(video.length);
    expect(head?.contentType).toBe("video/webm");
    const start = await storage.readStart(key, 16);
    expect(start.length).toBe(16);
    expect([...start.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]); // EBML (WebM) magic
  });

  it("a replayed upload URL cannot overwrite an existing object (no upsert)", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: 99999, expiresInSec: 900 });
    expect((await put(t, video)).status).toBeLessThan(300);
    const replay = await put(t, Buffer.from("tampered after verification ".repeat(50)));
    expect(replay.status).toBeGreaterThanOrEqual(400);
    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(video.length); // original bytes untouched
  });

  it("the bucket itself refuses disallowed content types", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "text/html", maxBytes: 99999, expiresInSec: 900 });
    const res = await put(t, "<script>alert(1)</script>", { "Content-Type": "text/html" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await storage.head(key)).toBeNull();
  });

  it("playback URLs work, are short-lived signed links, and tampered ones are refused", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: 99999, expiresInSec: 900 });
    await put(t, video);
    const play = await storage.createPlaybackUrl(key, 60);
    expect(play).toContain("/object/sign/");
    const ok = await fetch(play, { headers: { Range: "bytes=0-99" } });
    expect([200, 206]).toContain(ok.status);
    expect(ok.headers.get("content-type")).toContain("video/webm");
    const bad = await fetch(play.replace(/token=[^&]+/, "token=AAAA.BBBB.CCCC"));
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it("the bucket is private: no public URL, and the publishable (browser) key cannot read it", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: 99999, expiresInSec: 900 });
    await put(t, video);
    const pub1 = await fetch(`${url}/storage/v1/object/public/${bucket}/${key}`);
    expect(pub1.status).toBeGreaterThanOrEqual(400);
    // With only the publishable (browser) key there are no policies, so nothing is readable, listable or writable.
    // In the sandbox the network proxy REPLACES the apikey header with the secret key, which makes this check meaningless there:
    // set SUPABASE_KEY_INJECTED=1 to skip it (the same property is verified in SQL as the anon/authenticated roles, see SUPABASE_PLAN.md).
    if (process.env.SUPABASE_KEY_INJECTED === "1") return;
    const anon = createClient(url!, pub!, { auth: { persistSession: false } });
    const dl = await anon.storage.from(bucket).download(key);
    expect(dl.data).toBeNull();
    const ls = await anon.storage.from(bucket).list("o");
    expect((ls.data ?? []).length).toBe(0);
    const up = await anon.storage.from(bucket).upload(`o/${rid()}/r/${rid()}`, video, { contentType: "video/webm" });
    expect(up.error).not.toBeNull();
  });

  it("delete removes the object; playback and head then fail", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: 99999, expiresInSec: 900 });
    await put(t, video);
    const play = await storage.createPlaybackUrl(key, 60);
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
    expect((await fetch(play)).status).toBeGreaterThanOrEqual(400);
    await storage.delete(key); // idempotent
  });

  it("DOCUMENTED RISK (SEC-004): after a delete, an unexpired signed upload URL may re-create the object — the retention sweep re-deletes recent tombstones", { timeout: 60_000 }, async () => {
    const key = newKey();
    const t = await storage.createUploadTarget(key, { mimeType: "video/webm", maxBytes: 99999, expiresInSec: 900 });
    await storage.delete(key); // delete while the URL is still valid and before anything was uploaded
    const res = await put(t, video);
    const resurrected = res.status < 300 && (await storage.head(key)) !== null;
    // Whatever the service does, the sweep's idempotent delete must always leave the key empty.
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
    console.log(`signed upload URL after delete: HTTP ${res.status}; object re-created: ${resurrected}`);
  });
});
