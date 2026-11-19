import "server-only";
import { config } from "./config";
import type { IdentityProvider } from "./ports/identity";
import type { VideoStorage } from "./ports/storage";
import { localIdentity } from "./adapters/local/identity";
import { localStorageAdapter } from "./adapters/local/storage";

export function identity(): IdentityProvider {
  if (config().AUTH_PROVIDER === "local") return localIdentity;
  throw new Error("Supabase identity adapter is not implemented yet (planned: next session, once the Supabase project exists).");
}

export function storage(): VideoStorage {
  if (config().STORAGE_PROVIDER === "local") return localStorageAdapter;
  throw new Error("Supabase storage adapter is not implemented yet (planned: next session, once the Supabase project exists).");
}
