import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadTarget, VideoStorage } from "../../ports/storage";

/**
 * Supabase Storage implementation of the VideoStorage port (server-side; uses the SECRET key, never exposed to browsers).
 * - Private bucket, no policies: only this server can reach it. Objects use opaque keys (o/{org}/r/{recording}).
 * - Uploads: signed upload URL, no upsert (an existing object can never be overwritten by a replayed URL).
 * - Playback: short-lived signed URL minted per request.
 * Known limits (documented in docs/SUPABASE_PLAN.md): a signed upload URL stays valid for Supabase's fixed window
 * (documented as 2 hours), cannot carry a per-recording size cap, and a deleted key could be re-created within that window,
 * so the retention sweep re-deletes recent tombstones; the bucket's own file-size/MIME limits are the hard backstop.
 */
export type SupabaseStorageDeps = {
  client: SupabaseClient;
  bucket: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
};

export const SIGNED_UPLOAD_WINDOW_SEC = 2 * 3600;

export function createSupabaseStorage(deps: SupabaseStorageDeps): VideoStorage {
  const now = () => (deps.now ? deps.now() : Date.now());
  const doFetch = deps.fetchImpl ?? fetch;
  const bucket = () => deps.client.storage.from(deps.bucket);

  return {
    async createUploadTarget(key, { mimeType }): Promise<UploadTarget> {
      const { data, error } = await bucket().createSignedUploadUrl(key, { upsert: false });
      if (error || !data) throw new Error("storage_upload_target_failed");
      return {
        url: data.signedUrl,
        method: "PUT",
        // x-upsert:false => the request fails if the object already exists (replay protection)
        headers: { "Content-Type": mimeType, "x-upsert": "false", "cache-control": "max-age=0" },
        expiresAt: new Date(now() + SIGNED_UPLOAD_WINDOW_SEC * 1000).toISOString(),
      };
    },

    async head(key) {
      const { data, error } = await bucket().info(key);
      if (error) {
        const status = (error as { status?: number; statusCode?: string | number }).status ?? Number((error as { statusCode?: string | number }).statusCode);
        if (status === 404 || status === 400 || /not.?found/i.test(error.message)) return null;
        throw new Error("storage_head_failed");
      }
      if (!data) return null;
      const size = Number((data as { size?: number }).size);
      return { sizeBytes: Number.isFinite(size) ? size : 0, contentType: (data as { contentType?: string }).contentType ?? null };
    },

    async readStart(key, n) {
      const { data, error } = await bucket().createSignedUrl(key, 60);
      if (error || !data) throw new Error("storage_read_failed");
      const res = await doFetch(data.signedUrl, { headers: { Range: `bytes=0-${n - 1}` } });
      if (!res.ok || !res.body) throw new Error("storage_read_failed");
      // Read at most n bytes even if the server ignores the Range header.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      while (got < n) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        got += value.byteLength;
      }
      await reader.cancel().catch(() => {});
      return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, n);
    },

    async createPlaybackUrl(key, expiresInSec) {
      const { data, error } = await bucket().createSignedUrl(key, expiresInSec);
      if (error || !data) throw new Error("storage_playback_failed");
      return data.signedUrl;
    },

    async delete(key) {
      const { error } = await bucket().remove([key]);
      if (error) throw new Error("storage_delete_failed");
    },
  };
}
