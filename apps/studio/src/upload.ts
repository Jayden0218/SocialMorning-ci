// Uploads audio and image files from the browser straight to storage.
import { put } from '@vercel/blob/client';
import { MAX_IMAGE_BYTES, MAX_LAUNCH_IMAGE_BYTES, stripImageMetadata } from '@socialmorning/social-core';
import { api } from './api';

/**
 * M25 SB (audit #36): a picture goes to storage without its personal metadata (EXIF GPS, XMP,
 * IPTC, text) — removed here in the browser, because the API never sees these bytes. Anything
 * that is not a JPEG/PNG/WebP, or a browser that cannot read the file, sends it as it is.
 */
export async function withoutMetadata(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof file.arrayBuffer !== 'function') return file;
  try {
    const clean = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
    return clean ? new File([clean as BlobPart], file.name, { type: file.type }) : file;
  } catch {
    return file;
  }
}

/**
 * M13 — a file goes from the browser straight to storage (the API never carries it): ask the
 * API for a one-path token, then `put` with progress. Returns the stored file's address.
 */
export async function uploadFile(showKey: string, kind: 'audio' | 'cover', original: File, onProgress: (pct: number) => void): Promise<string> {
  const file = kind === 'cover' ? await withoutMetadata(original) : original;
  const { pathname, token } = await api<{ pathname: string; token: string }>(`/v1/studio/shows/${showKey}/uploads`, {
    method: 'POST', body: { kind, contentType: file.type, size: file.size },
  });
  const r = await put(pathname, file, {
    access: 'public', token, contentType: file.type,
    multipart: file.size > 50 * 1024 * 1024,
    onUploadProgress: (e) => onProgress(Math.round(e.percentage)),
  });
  return r.url;
}

/** The file's length, read by the browser before upload; undefined when it cannot tell. */
export function audioDurationMs(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return resolve(undefined);
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | undefined) => { URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration * 1000) : undefined);
    a.onerror = () => done(undefined);
    a.src = url;
  });
}

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** M15 T021: a launch-screen image (JPEG/PNG/WebP, ≤ 1 MB) goes the same way — a one-path token, then `put`. */
export const LAUNCH_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_LAUNCH_BYTES = MAX_LAUNCH_IMAGE_BYTES;
export async function uploadLaunchImage(original: File, onProgress: (pct: number) => void): Promise<string> {
  const file = await withoutMetadata(original);
  const { pathname, token } = await api<{ pathname: string; token: string }>('/v1/admin/launch/uploads', {
    method: 'POST', body: { contentType: file.type, size: file.size },
  });
  const r = await put(pathname, file, { access: 'public', token, contentType: file.type, onUploadProgress: (e) => onProgress(Math.round(e.percentage)) });
  return r.url;
}

/** M19 US12: an announcement picture (JPEG/PNG, ≤ 5 MB) — a one-path token from the show, then `put`. */
export const ANNOUNCEMENT_TYPES = ['image/jpeg', 'image/png'];
export const MAX_ANNOUNCEMENT_BYTES = MAX_IMAGE_BYTES;
/** A show or episode cover (JPEG/PNG), the same limit the server checks. */
export const MAX_COVER_BYTES = MAX_IMAGE_BYTES;
export async function uploadAnnouncementImage(showKey: string, original: File, onProgress: (pct: number) => void): Promise<string> {
  const file = await withoutMetadata(original);
  const { pathname, token } = await api<{ pathname: string; token: string }>(`/v1/studio/shows/${showKey}/announcements/uploads`, {
    method: 'POST', body: { contentType: file.type, size: file.size },
  });
  const r = await put(pathname, file, { access: 'public', token, contentType: file.type, onUploadProgress: (e) => onProgress(Math.round(e.percentage)) });
  return r.url;
}
