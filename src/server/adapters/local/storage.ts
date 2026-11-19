import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { config } from "../../config";
import { STORAGE_KEY_RE, type UploadTarget, type VideoStorage } from "../../ports/storage";

/** DEVELOPMENT/TEST storage on the local filesystem, behind HMAC-signed short-lived URLs. */

type TokenPayload = { k: string; op: "put" | "get"; exp: number; max?: number; mime?: string };

export function signToken(p: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", config().SIGNING_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string, op: "put" | "get"): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", config().SIGNING_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (p.op !== op || p.exp < Date.now() || !STORAGE_KEY_RE.test(p.k)) return null;
    return p;
  } catch {
    return null;
  }
}

export function localPath(key: string): string {
  if (!STORAGE_KEY_RE.test(key)) throw new Error("invalid storage key");
  const base = resolve(config().LOCAL_STORAGE_DIR);
  const p = resolve(base, key);
  if (!p.startsWith(base + sep)) throw new Error("path escape");
  return p;
}

export const localMetaPath = (key: string) => `${localPath(key)}.meta.json`;
export async function writeMeta(key: string, meta: { contentType: string }) {
  await writeFile(localMetaPath(key), JSON.stringify(meta));
}
export async function readMeta(key: string): Promise<{ contentType: string } | null> {
  try {
    return JSON.parse(await readFile(localMetaPath(key), "utf8"));
  } catch {
    return null;
  }
}
export { createReadStream };

export const localStorageAdapter: VideoStorage = {
  async createUploadTarget(key, { mimeType, maxBytes, expiresInSec }): Promise<UploadTarget> {
    const exp = Date.now() + expiresInSec * 1000;
    const t = signToken({ k: key, op: "put", exp, max: maxBytes, mime: mimeType });
    return {
      url: `/api/storage/upload?t=${encodeURIComponent(t)}`,
      method: "PUT",
      headers: { "Content-Type": mimeType },
      expiresAt: new Date(exp).toISOString(),
    };
  },
  async head(key) {
    try {
      const s = await stat(localPath(key));
      return { sizeBytes: s.size, contentType: (await readMeta(key))?.contentType ?? null };
    } catch {
      return null;
    }
  },
  async readStart(key, n) {
    const fh = await open(localPath(key), "r");
    try {
      const buf = Buffer.alloc(n);
      const { bytesRead } = await fh.read(buf, 0, n, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  },
  async createPlaybackUrl(key, expiresInSec) {
    return `/api/storage/play?t=${encodeURIComponent(signToken({ k: key, op: "get", exp: Date.now() + expiresInSec * 1000 }))}`;
  },
  async delete(key) {
    await rm(localPath(key), { force: true });
    await rm(localMetaPath(key), { force: true });
  },
};

export async function ensureDirFor(key: string) {
  await mkdir(dirname(localPath(key)), { recursive: true });
}
