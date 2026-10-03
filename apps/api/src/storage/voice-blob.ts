// Storage for voice post recordings in Vercel Blob.
/**
 * M12 FR-104 — where voice status posts live: the Vercel Blob store `socialmorning-voice`,
 * approved by name by the owner (tasks.md T126, gate A1; constitution 2.2.0 exception). Its
 * token is `BLOB_READ_WRITE_TOKEN` in the Vercel env — never in the repo. Unset → `ready`
 * is false and posting answers 503 `storage_off`.
 *
 * Unlike M13's episode store the API does carry these files itself: ≤ 600 000 bytes is far
 * under Vercel's 4.5 MB request limit, and the server must see the bytes to check the length.
 */
import { del, put } from '@vercel/blob';

export interface VoiceStorage {
  readonly ready: boolean;
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; pathname: string }>;
  remove(url: string): Promise<void>;
}

export function voiceBlobStorage(token: string | undefined): VoiceStorage {
  return {
    ready: Boolean(token),
    put: async (pathname, bytes, contentType) => {
      if (!token) throw new Error('voice store not connected');
      // @vercel/blob 2.8.0 (read from its .d.ts): put(pathname, body, { access, token, contentType, addRandomSuffix }).
      const r = await put(pathname, Buffer.from(bytes), { access: 'public', token, contentType, addRandomSuffix: false });
      return { url: r.url, pathname: r.pathname };
    },
    remove: async (url) => {
      if (!token) throw new Error('voice store not connected');
      await del(url, { token });
    },
  };
}
