import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "@/server/config";
import { ensureDirFor, localPath, verifyToken, writeMeta } from "@/server/adapters/local/storage";

// DEV/TEST storage endpoint (STORAGE_PROVIDER=local). Authorised solely by a short-lived HMAC token.
export async function PUT(req: Request) {
  if (config().STORAGE_PROVIDER !== "local") return new Response("Not found", { status: 404 });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const p = verifyToken(token, "put");
  if (!p || !p.max || !p.mime) return new Response("Forbidden", { status: 403 });
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== p.mime) return new Response("Unsupported media type", { status: 415 });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > p.max) return new Response("Payload too large", { status: 413 });
  if (!req.body) return new Response("Bad request", { status: 400 });

  await ensureDirFor(p.k);
  const dest = localPath(p.k);
  const tmp = `${dest}.${crypto.randomUUID()}.part`;
  let written = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      written += chunk.byteLength;
      if (written > p.max!) ctl.error(new Error("too large"));
      else ctl.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body.pipeThrough(limiter) as never), createWriteStream(tmp));
    await rename(tmp, dest);
    await writeMeta(p.k, { contentType: p.mime });
    return new Response(null, { status: 200 });
  } catch {
    await rm(tmp, { force: true });
    return new Response("Upload failed", { status: 413 });
  }
}
