// Storage for comment images in a Cloudflare R2 bucket, signed by hand (AWS Signature Version 4).
/**
 * M20 US9 (spec FR-053–FR-055; research R8; constitution v3.2.0). Comment images live in the
 * Cloudflare R2 bucket the owner approved by name at gate G1 ("image replies follow yours",
 * 2026-10-06: `socialmorning-images`). R2 speaks the S3 API; a PUT or DELETE is signed with AWS
 * Signature Version 4 (region `auto`, service `s3`). No SDK: two requests do not need one, and
 * `sigV4` is checked against AWS's own published test vector (test/m20-comment-image.test.ts).
 *
 * Env (Vercel, never the repo): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 * R2_PUBLIC_BASE (the bucket's public address, e.g. https://pub-….r2.dev). Any unset → `ready`
 * is false and the image route answers 503 `storage_off`.
 */
import { createHash, createHmac } from 'node:crypto';

export interface ImageStorage {
  readonly ready: boolean;
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; pathname: string }>;
  remove(pathname: string): Promise<void>;
}

const sha256hex = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
/** RFC 3986 encoding, as SigV4 wants it; `/` kept in paths. */
const enc = (s: string, keepSlash: boolean) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`).replace(keepSlash ? /%2F/g : /$^/g, '/');

export type SignInput = {
  method: string;
  host: string;
  /** Already-encoded absolute path, e.g. `/bucket/comments/a.jpg`. */
  path: string;
  /** Extra headers to sign (lower-case names), besides host and x-amz-date. */
  headers?: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  /** `YYYYMMDDTHHMMSSZ` */
  amzDate: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** The Authorization header of AWS Signature Version 4 (header-based, no query string). */
export function sigV4(i: SignInput): string {
  const day = i.amzDate.slice(0, 8);
  const all: Record<string, string> = { host: i.host, 'x-amz-date': i.amzDate, ...(i.headers ?? {}) };
  const names = Object.keys(all).map((n) => n.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = names.map((n) => `${n}:${String(lower[n]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [i.method, i.path, '', canonicalHeaders, signedHeaders, i.payloadHash].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const amzDateOf = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function r2ImageStorage(env: Record<string, string | undefined>, f: typeof fetch = fetch, now: () => Date = () => new Date()): ImageStorage {
  const account = env['R2_ACCOUNT_ID'];
  const keyId = env['R2_ACCESS_KEY_ID'];
  const secret = env['R2_SECRET_ACCESS_KEY'];
  const bucket = env['R2_BUCKET'];
  const publicBase = env['R2_PUBLIC_BASE']?.replace(/\/+$/, '');
  const ready = Boolean(account && keyId && secret && bucket && publicBase?.startsWith('https://'));
  const host = `${account}.r2.cloudflarestorage.com`;
  const request = async (method: 'PUT' | 'DELETE', pathname: string, body?: Uint8Array, contentType?: string): Promise<Response> => {
    if (!ready) throw new Error('image store not connected');
    const path = `/${enc(bucket!, false)}/${enc(pathname, true)}`;
    const payloadHash = sha256hex(body ?? '');
    const amzDate = amzDateOf(now());
    const headers: Record<string, string> = { 'x-amz-content-sha256': payloadHash, ...(contentType ? { 'content-type': contentType } : {}) };
    const authorization = sigV4({ method, host, path, headers, payloadHash, region: 'auto', service: 's3', amzDate, accessKeyId: keyId!, secretAccessKey: secret! });
    return f(`https://${host}${path}`, { method, headers: { ...headers, 'x-amz-date': amzDate, authorization }, ...(body ? { body: body as unknown as BodyInit } : {}) });
  };
  return {
    ready,
    put: async (pathname, bytes, contentType) => {
      const r = await request('PUT', pathname, bytes, contentType);
      if (!r.ok) throw new Error(`image store answered ${r.status}`);
      return { url: `${publicBase}/${enc(pathname, true)}`, pathname };
    },
    remove: async (pathname) => {
      const r = await request('DELETE', pathname);
      // S3/R2 answer 204 for a delete, also for a key that is already gone.
      if (!r.ok && r.status !== 404) throw new Error(`image store answered ${r.status}`);
    },
  };
}
