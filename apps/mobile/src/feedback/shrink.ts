/**
 * M10b US6 — shrinking a picked image before it is sent (FR-019): no wider than 1280 px, and
 * re-encoded at falling JPEG quality until it is ≤ 200 KB (the server refuses > 250 000
 * bytes). Kept free of native modules so it can be tested; `images.ts` supplies the encoder.
 */
export const MAX_WIDTH = 1280;
export const TARGET_BYTES = 200_000;
export const QUALITIES = [0.8, 0.65, 0.5, 0.35, 0.2] as const;

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** The first quality whose encoding fits; undefined when even the lowest is too big. */
export async function smallestFit(encode: (quality: number) => Promise<string>): Promise<string | undefined> {
  for (const q of QUALITIES) {
    const b64 = await encode(q);
    if (base64Bytes(b64) <= TARGET_BYTES) return b64;
  }
  return undefined;
}
