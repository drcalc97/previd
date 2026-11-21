import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkTimers, COOKIE_ACTIVITY, COOKIE_START, readStamp, signStamp } from "@/server/adapters/supabase/session-clock";

/**
 * Per-request CSP nonce. When AUTH_PROVIDER=supabase it also refreshes the Supabase session cookies and enforces the idle /
 * absolute session limits. Authorisation is NOT done here: every page/route re-checks server-side.
 */
function storageOrigin(): string {
  // Only when Supabase Storage is in use: browsers upload to / play from signed URLs on the project origin.
  if (process.env.STORAGE_PROVIDER !== "supabase" || !process.env.SUPABASE_URL) return "";
  try {
    return new URL(process.env.SUPABASE_URL).origin;
  } catch {
    return "";
  }
}

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  const so = storageOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    `media-src 'self' blob:${so ? ` ${so}` : ""}`, // recorded preview (blob:) + signed playback URLs
    "font-src 'self'",
    `connect-src 'self'${so ? ` ${so}` : ""}`, // signed direct uploads go to the storage origin
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const finish = () => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SIGNING_SECRET;
  if (process.env.AUTH_PROVIDER !== "supabase" || !url || !key || !secret) return finish();

  const hasSupabaseCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasSupabaseCookie) return finish();

  const secure = process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // Refreshed tokens must reach both this request (server components) and the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: new Headers({ ...Object.fromEntries(requestHeaders), cookie: request.headers.get("cookie") ?? "" }) } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
    auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });

  const now = Date.now();
  const timers = await checkTimers(
    { activity: request.cookies.get(COOKIE_ACTIVITY)?.value, start: request.cookies.get(COOKIE_START)?.value },
    secret,
    now,
  );
  if (timers !== "ok") {
    // Idle or over 12 h (or no start stamp): revoke the session server-side and clear every cookie.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    for (const n of [COOKIE_START, COOKIE_ACTIVITY]) response.cookies.set(n, "", { path: "/", maxAge: 0 });
    for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    return finish();
  }

  await supabase.auth.getClaims(); // refreshes the access token when needed (cookies are written via setAll above)

  const last = await readStamp("act", request.cookies.get(COOKIE_ACTIVITY)?.value, secret);
  if (last === null || now - last > 60_000) {
    response.cookies.set(COOKIE_ACTIVITY, await signStamp("act", now, secret), { httpOnly: true, secure, sameSite: "lax", path: "/" });
  }
  return finish();
}

export const config = {
  // Exclude static assets and the storage endpoints (large streamed bodies must not pass through the proxy).
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|api/storage).*)" }],
};
