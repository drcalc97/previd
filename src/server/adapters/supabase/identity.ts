import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { config, isProd } from "../../config";
import { withAnon } from "../../db";
import { rateLimit } from "../../ratelimit";
import { createSupabaseIdentity, type SignInGuard, type UserLinks } from "./identity-core";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const MAX_FAILS = 5;

const links: UserLinks = {
  async resolve(subject, email) {
    const [r] = await withAnon((tx) => tx`select identity_link_supabase(${subject}, ${email}) as id`);
    return (r?.id as string | null) ?? null;
  },
};

const guard: SignInGuard = {
  async check(email, meta) {
    const okIp = await rateLimit(`login:ip:${meta.ipHash ?? "unknown"}`, 600, 30);
    const okEmail = await rateLimit(`login:email:${sha(email)}`, 900, 10);
    if (!okIp || !okEmail) return "rate_limited";
    const [r] = await withAnon(
      (tx) => tx`select coalesce(sum(hits), 0)::int as n from rate_limits where key = ${`login:fail:${sha(email)}`} and window_start > now() - interval '15 minutes'`,
    );
    return r.n >= MAX_FAILS ? "locked" : "ok";
  },
  async recordFailure(email) {
    await rateLimit(`login:fail:${sha(email)}`, 900, 1_000_000);
  },
  allowMfaAttempt: (id) => rateLimit(`mfa:user:${id}`, 300, 10),
};

export function supabaseIdentity() {
  const c = config();
  if (!c.SUPABASE_URL || !c.SUPABASE_PUBLISHABLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for AUTH_PROVIDER=supabase");
  return createSupabaseIdentity({
    url: c.SUPABASE_URL,
    publishableKey: c.SUPABASE_PUBLISHABLE_KEY,
    secret: c.SIGNING_SECRET,
    secureCookies: isProd(),
    cookies: async () => {
      const store = await cookies();
      return {
        getAll: () => store.getAll().map((x) => ({ name: x.name, value: x.value })),
        setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options as never)),
      };
    },
    links,
    guard,
  });
}
