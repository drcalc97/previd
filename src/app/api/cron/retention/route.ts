import { timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import { runRetentionSweep } from "@/server/services/recordings";

// Scheduled (e.g. Vercel Cron). Authorised by a shared secret in the Authorization header.
async function handle(req: Request) {
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(config().CRON_SECRET);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response("Forbidden", { status: 403 });
  return Response.json(await runRetentionSweep(), { headers: { "Cache-Control": "no-store" } });
}
export const GET = handle;
export const POST = handle;
