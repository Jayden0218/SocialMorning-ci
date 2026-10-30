// Storage for created shows' audio and covers: upload tokens, check, delete.
/**
 * M13 — where created shows' audio and covers live (constitution v2.3.0; plan R1, R2).
 * Everything that touches the storage service is in this one file, so moving to Cloudflare R2
 * later replaces this file and nothing else.
 *
 * The API never carries a file (Vercel functions take ≤ 4.5 MB): it hands the browser a token
 * good for ONE path, the allowed types and a size limit, for 1 hour; the browser uploads
 * straight to the store; publishing then reads the file's real size and type back with `head`.
 */
import { del, head, list } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

export type StoredFile = { url: string; pathname: string; size: number; contentType: string; uploadedAt?: string };

export interface EpisodeStorage {
  /** False when the store is not connected: shows can still be created, uploads say why not. */
  readonly ready: boolean;
  uploadToken(pathname: string, opts: { maxBytes: number; types: string[] }): Promise<string>;
  head(url: string): Promise<StoredFile | undefined>;
  remove(url: string): Promise<void>;
  /** M14 US5: every stored file under a prefix (one show's folder), for the media library. */
  list(prefix: string): Promise<StoredFile[]>;
}

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_LAUNCH_IMAGE_BYTES } from '@socialmorning/social-core';
export { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_LAUNCH_IMAGE_BYTES };

/**
 * M15 T002 — launch-screen images (constitution v2.4.0, D2): JPEG/PNG/WebP, ≤ 1 MB each, ≤ 50 MB for
 * every promotion together (counted from `promotions.image_bytes`). Same store, path `launch/`.
 */
export const LAUNCH_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const LAUNCH_CEILING_BYTES = 50 * 1024 * 1024;
const LAUNCH_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** `launch/<uuid>.<ext>` for an allowed type; undefined for any other type. */
export function launchPathname(type: string, uuid: string): string | undefined {
  const ext = LAUNCH_EXT[type];
  return ext === undefined ? undefined : `launch/${uuid}.${ext}`;
}

/** A 1-hour token for ONE launch image path, through the same client-token flow as covers. */
export function launchUploadToken(storage: EpisodeStorage, pathname: string, size: number, type: string): Promise<string> {
  if (!LAUNCH_IMAGE_TYPES.includes(type)) throw new Error(`launch image type ${type} is not allowed`);
  if (size > MAX_LAUNCH_IMAGE_BYTES) throw new Error(`launch image over ${MAX_LAUNCH_IMAGE_BYTES} bytes`);
  return storage.uploadToken(pathname, { maxBytes: MAX_LAUNCH_IMAGE_BYTES, types: LAUNCH_IMAGE_TYPES });
}

export function blobStorage(token: string | undefined): EpisodeStorage {
  return {
    ready: Boolean(token),
    uploadToken: async (pathname, o) => {
      if (!token) throw new Error('episode store not connected');
      // 2.8.0 takes ONE object; vercel.com's SDK page still shows an older 3-argument form (read from the package's own .d.ts).
      return generateClientTokenFromReadWriteToken({
        token, pathname, maximumSizeInBytes: o.maxBytes, allowedContentTypes: o.types, validUntil: Date.now() + 60 * 60 * 1000, addRandomSuffix: false,
      });
    },
    head: async (url) => {
      if (!token) return undefined;
      try {
        const h = await head(url, { token });
        return { url: h.url, pathname: h.pathname, size: h.size, contentType: h.contentType };
      } catch {
        return undefined;
      }
    },
    remove: async (url) => {
      if (token) await del(url, { token });
    },
    list: async (prefix) => {
      if (!token) return [];
      const out: StoredFile[] = [];
      let cursor: string | undefined;
      do {
        const r = await list({ token, prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, contentType: typeFromPath(b.pathname), uploadedAt: new Date(b.uploadedAt).toISOString() });
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
  };
}

/** `list` does not return a type; ours are always named by the upload route, so the extension is the type. */
export function typeFromPath(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase();
  return ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}
