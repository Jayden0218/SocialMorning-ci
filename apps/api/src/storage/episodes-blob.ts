/**
 * M13 — where created shows' audio and covers live (constitution v2.3.0; plan R1, R2).
 * Everything that touches the storage service is in this one file, so moving to Cloudflare R2
 * later replaces this file and nothing else.
 *
 * The API never carries a file (Vercel functions take ≤ 4.5 MB): it hands the browser a token
 * good for ONE path, the allowed types and a size limit, for 1 hour; the browser uploads
 * straight to the store; publishing then reads the file's real size and type back with `head`.
 */
import { del, head } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

export type StoredFile = { url: string; pathname: string; size: number; contentType: string };

export interface EpisodeStorage {
  /** False when the store is not connected: shows can still be created, uploads say why not. */
  readonly ready: boolean;
  uploadToken(pathname: string, opts: { maxBytes: number; types: string[] }): Promise<string>;
  head(url: string): Promise<StoredFile | undefined>;
  remove(url: string): Promise<void>;
}

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
  };
}
