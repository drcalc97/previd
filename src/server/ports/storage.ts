/**
 * Video storage port. Keys are opaque (`o/{orgId}/r/{recordingId}`); no URLs are ever persisted.
 * Adapters: local filesystem (dev/test), supabase (MVP), s3 / azure-blob (future).
 */
export type UploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export interface VideoStorage {
  createUploadTarget(key: string, opts: { mimeType: string; maxBytes: number; expiresInSec: number }): Promise<UploadTarget>;
  head(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null>;
  /** First `n` bytes, used for container magic-number verification. */
  readStart(key: string, n: number): Promise<Buffer>;
  createPlaybackUrl(key: string, expiresInSec: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const STORAGE_KEY_RE = /^o\/[0-9a-f-]{36}\/r\/[0-9a-f-]{36}$/;
export const makeStorageKey = (orgId: string, recordingId: string) => `o/${orgId}/r/${recordingId}`;
