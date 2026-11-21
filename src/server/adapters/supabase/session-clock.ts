// Idle / absolute session limits for the Supabase identity adapter. Edge-safe (Web Crypto only; no server-only import) so the
// proxy can use it. Values are HMAC-signed so a tampered cookie is ignored (fails closed).
export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 12 * 3600_000;
export const COOKIE_ACTIVITY = "pv_act";
export const COOKIE_START = "pv_start";

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signStamp(kind: string, ms: number, secret: string): Promise<string> {
  return `${ms}.${await hmac(secret, `${kind}:${ms}`)}`;
}

/** Returns the timestamp (ms) if the stamp is authentic, else null. */
export async function readStamp(kind: string, value: string | undefined, secret: string): Promise<number | null> {
  if (!value) return null;
  const [ts, sig] = value.split(".");
  const ms = Number(ts);
  if (!sig || !Number.isFinite(ms)) return null;
  const expected = await hmac(secret, `${kind}:${ms}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? ms : null;
}

export type Timers = { activity: string | undefined; start: string | undefined };

/** "ok" while within both limits; otherwise why the session must end. Missing/forged stamps fail closed. */
export async function checkTimers(t: Timers, secret: string, now = Date.now()): Promise<"ok" | "idle" | "absolute" | "missing"> {
  const start = await readStamp("start", t.start, secret);
  if (start === null) return "missing";
  if (now - start > ABSOLUTE_MS) return "absolute";
  const act = await readStamp("act", t.activity, secret);
  // A just-signed-in session has no activity stamp yet: treat the start time as the last activity.
  if (now - (act ?? start) > IDLE_MS) return "idle";
  return "ok";
}
