import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  PREVID_ALLOW_DEV_ADAPTERS: z.string().default("false"),
  SIGNING_SECRET: z.string().min(16),
  AUTH_ENC_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16),
  LOCAL_STORAGE_DIR: z.string().default(".data/videos"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_VIDEO_BUCKET: z.string().default("videos"),
});

export type Config = z.infer<typeof schema>;
let cached: Config | undefined;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable NAMES only, never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment configuration: ${names}`);
  }
  const c = parsed.data;
  const dev = c.AUTH_PROVIDER === "local" || c.STORAGE_PROVIDER === "local";
  if (c.NODE_ENV === "production" && dev && c.PREVID_ALLOW_DEV_ADAPTERS !== "true") {
    throw new Error("Development auth/storage adapters are disabled in production.");
  }
  if (c.AUTH_PROVIDER === "local" && !c.AUTH_ENC_KEY) throw new Error("AUTH_ENC_KEY is required for the local auth provider");
  cached = c;
  return c;
}

export const isProd = () => process.env.NODE_ENV === "production";
