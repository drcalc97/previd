import "server-only";
import { ForbiddenError, NotFoundError, getOrgContextOrNull } from "./authz";
import type { OrgContext } from "./db";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** CSRF defence for cookie-authenticated JSON endpoints: same-origin + JSON content type. */
export function checkCsrf(req: Request): Response | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return json({ error: "Forbidden" }, 403);
  try {
    if (new URL(origin).host !== host) return json({ error: "Forbidden" }, 403);
  } catch {
    return json({ error: "Forbidden" }, 403);
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Unsupported media type" }, 415);
  }
  return null;
}

/** Wraps an org-scoped JSON API handler: CSRF -> authn(+MFA) -> membership -> handler -> safe errors. */
export async function orgApi(
  req: Request,
  orgSlug: string,
  fn: (ctx: OrgContext) => Promise<Response>,
): Promise<Response> {
  const bad = checkCsrf(req);
  if (bad) return bad;
  try {
    const ctx = await getOrgContextOrNull(orgSlug);
    if (!ctx) return json({ error: "Not found" }, 404); // same answer for non-member and non-existent org
    return await fn(ctx);
  } catch (e) {
    if (e instanceof ForbiddenError) return json({ error: "You do not have permission to do that." }, 403);
    if (e instanceof NotFoundError) return json({ error: "Not found" }, 404);
    if (e instanceof Error && e.message === "rate_limited") return json({ error: "Too many requests. Please slow down." }, 429);
    // Never log request bodies, URLs with tokens, or DB error details (may echo values).
    console.error("api_error", { name: e instanceof Error ? e.name : "unknown", code: (e as { code?: string })?.code });
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

export { json };
