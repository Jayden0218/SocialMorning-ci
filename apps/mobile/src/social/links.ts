/**
 * M6 FR-027: the pages the app must link to, and the appeals address, which comes from
 * the server (`/v1/meta`) so the owner can change it without a build. Offline: the
 * mirror in settings, then a plain "through the app" fallback.
 */
import type { ApiClient } from './api';
import type { Stores } from '../storage/types';
import { apiBaseUrl } from './base-url';

export const APPEALS_KEY = 'safety.appealsEmail';

export const legalLinks = () => ({
  privacy: `${apiBaseUrl()}/privacy`,
  rules: `${apiBaseUrl()}/rules`,
  get: `${apiBaseUrl()}/get`,
});

/** The address to write to, refreshed from the server when it answers. */
export async function refreshAppeals(api: ApiClient, stores: Pick<Stores, 'settings'>): Promise<string | undefined> {
  try {
    const meta = await api.meta();
    if (meta.appealsEmail) stores.settings.set(APPEALS_KEY, meta.appealsEmail);
    return meta.appealsEmail ?? stores.settings.get(APPEALS_KEY) ?? undefined;
  } catch {
    return stores.settings.get(APPEALS_KEY) ?? undefined;
  }
}

export const appealsMailto = (address: string | undefined): string | undefined =>
  address === undefined || address === '' ? undefined : `mailto:${address}?subject=${encodeURIComponent('SocialMorning — report a problem')}`;
