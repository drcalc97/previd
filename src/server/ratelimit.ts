import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { config } from "./config";
import { withAnon, type Tx } from "./db";

/** Keyed hash of the client IP: lets us correlate/limit without storing raw IPs. */
export function hashIp(ip: string): string {
  return createHmac("sha256", config().SIGNING_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 24);
}

export async function requestMeta(): Promise<{ ipHash: string | null }> {
  const h = await headers();
  // On Vercel, x-forwarded-for is set by the platform; the first entry is the client.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  return { ipHash: ip ? hashIp(ip) : null };
}

/** true = allowed. Fixed window counter in Postgres. */
export async function rateLimit(key: string, windowSec: number, limit: number, tx?: Tx): Promise<boolean> {
  const run = async (t: Tx) => (await t`select rate_limit_hit(${key}, ${windowSec}, ${limit}) as ok`)[0].ok as boolean;
  return tx ? run(tx) : withAnon(run);
}
