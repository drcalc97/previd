import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { config } from "@/server/config";
import { localPath, readMeta, verifyToken } from "@/server/adapters/local/storage";

// DEV/TEST playback endpoint: short-lived signed token, Range support, never cacheable.
export async function GET(req: Request) {
  if (config().STORAGE_PROVIDER !== "local") return new Response("Not found", { status: 404 });
  const p = verifyToken(new URL(req.url).searchParams.get("t") ?? "", "get");
  if (!p) return new Response("Forbidden", { status: 403 });
  let size: number;
  try {
    size = (await stat(localPath(p.k))).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = (await readMeta(p.k))?.contentType ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0, end = size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    } else {
      start = Math.max(size - Number(range[2]), 0);
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  return new Response(Readable.toWeb(createReadStream(localPath(p.k), { start, end })) as ReadableStream, { status, headers });
}
