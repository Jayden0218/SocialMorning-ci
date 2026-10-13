// My profile: name, bio, photo, optional age range and gender; the photo's storage limits.
/**
 * M19 US1 (FR-001–FR-005). The photo lives in the launch-image store (constitution v2.6.0): at most
 * 200 KB each, 200 MB for every photo together, its own path `avatars/`. Age range and gender are
 * optional and never leave this file except as the listener's own answers or as totals (FR-073).
 */
import { viaStore } from '../../backend.ts';

export const AVATAR_MAX_BYTES = 204_800;
export const AVATAR_CEILING_BYTES = 200 * 1024 * 1024;
export const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export const GENDERS = ['woman', 'man', 'another', 'unsaid'] as const;

export type MyProfile = {
  avatarUrl?: string; bio?: string; ageRange?: string; gender?: string; likesPublic: boolean; privateListening: boolean;
  /** M21 US8 (FR-075, G-M21-10): optional, and only ever returned to the listener themselves (this function's one caller is /v1/me). */
  birthday?: string; industry?: string;
  /** M21 US10: the privacy switches. */
  hideBadge: boolean; hideStickers: boolean; hideDecorations: boolean; privateSubscriptions: boolean;
};

export const myProfile = viaStore<typeof import('./ddb/index.ts').myProfile>('ac/index', 'myProfile');

/** M21 US8: industry is free text, 1–40 characters. */
export const INDUSTRY_MAX = 40;

export type ProfilePatch = { displayName?: string; bio?: string; ageRange?: string | null; gender?: string | null; likesPublic?: boolean;
  /** M21: null clears birthday or industry. */
  birthday?: string | null; industry?: string | null;
  hideBadge?: boolean; hideStickers?: boolean; hideDecorations?: boolean; privateSubscriptions?: boolean };

/** Only the fields sent change; `null` clears age range or gender; an empty bio clears it. */
export const updateProfile = viaStore<typeof import('./ddb/index.ts').updateProfile>('ac/index', 'updateProfile');

/** Bytes every photo takes now, without this listener's own (it is about to be replaced). */
export const avatarBytesOthers = viaStore<typeof import('./ddb/index.ts').avatarBytesOthers>('ac/index', 'avatarBytesOthers');

export const currentAvatar = viaStore<typeof import('./ddb/index.ts').currentAvatar>('ac/index', 'currentAvatar');

export const setAvatar = viaStore<typeof import('./ddb/index.ts').setAvatar>('ac/index', 'setAvatar');

/** JPEG or PNG by their first bytes — the declared type is not trusted. */
export function imageKind(b: Uint8Array): 'image/jpeg' | 'image/png' | undefined {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return undefined;
}

// M26: small reads and writes of the listener's own row (moved here from routes/).

/** The listener's display name as stored now. */
export const displayNameRows = viaStore<typeof import('./ddb/index.ts').displayNameRows>('ac/index', 'displayNameRows');

/** The listener accepted the community rules; the first time is kept. */
export const acceptRules = viaStore<typeof import('./ddb/index.ts').acceptRules>('ac/index', 'acceptRules');

/** The listener's password hash, to check a password. */
export const passwordHashRows = viaStore<typeof import('./ddb/index.ts').passwordHashRows>('ac/index', 'passwordHashRows');

/** The listener's email. */
export const listenerEmailRows = viaStore<typeof import('./ddb/index.ts').listenerEmailRows>('ac/index', 'listenerEmailRows');
