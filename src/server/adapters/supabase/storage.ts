import "server-only";
import { createClient } from "@supabase/supabase-js";
import { config } from "../../config";
import { createSupabaseStorage } from "./storage-core";

export function supabaseStorage() {
  const c = config();
  if (!c.SUPABASE_URL || !c.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_PROVIDER=supabase");
  // The secret key bypasses RLS: it lives only in server-side environment variables, never in client code.
  const client = createClient(c.SUPABASE_URL, c.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return createSupabaseStorage({ client, bucket: c.SUPABASE_VIDEO_BUCKET });
}
