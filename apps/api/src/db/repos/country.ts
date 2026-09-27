/**
 * M10b US7 — "IP location" (owner, 2026-09-27: public, like the reference). The hosting platform
 * adds `x-vercel-ip-country` (ISO 3166-1 alpha-2) to every request (vercel.com/docs/headers/
 * request-headers, read 2026-09-27). At each sign-in the listener's country is set from it —
 * two letters only, never a city or an address (guard G-I1). Anything that is not two letters
 * leaves the stored value alone.
 */
import type { Db } from '../db.ts';

export const COUNTRY_HEADER = 'x-vercel-ip-country';

export function countryOf(header: string | undefined | null): string | undefined {
  const v = (header ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== 'XX' ? v : undefined;
}

export async function recordCountry(db: Db, listenerId: string, header: string | undefined | null): Promise<void> {
  const c = countryOf(header);
  if (c === undefined) return;
  await db.query('UPDATE listeners SET country = $2 WHERE id = $1', [listenerId, c]);
}
