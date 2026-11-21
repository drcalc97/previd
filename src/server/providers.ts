import "server-only";
import { config } from "./config";
import type { IdentityProvider } from "./ports/identity";
import type { VideoStorage } from "./ports/storage";
import { localIdentity } from "./adapters/local/identity";
import { localStorageAdapter } from "./adapters/local/storage";
import { supabaseIdentity } from "./adapters/supabase/identity";
import { supabaseStorage } from "./adapters/supabase/storage";

let cached: IdentityProvider | undefined;
let cachedStorage: VideoStorage | undefined;

export function identity(): IdentityProvider {
  if (config().AUTH_PROVIDER === "local") return localIdentity;
  return (cached ??= supabaseIdentity());
}

export function storage(): VideoStorage {
  if (config().STORAGE_PROVIDER === "local") return localStorageAdapter;
  return (cachedStorage ??= supabaseStorage());
}
