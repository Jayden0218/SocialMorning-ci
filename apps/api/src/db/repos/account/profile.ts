// My profile: name, bio, photo, optional age range and gender; the photo's storage limits.
/**
 * M19 US1 (FR-001–FR-005). The photo lives in the launch-image store (constitution v2.6.0): at most
 * 200 KB each, 200 MB for every photo together, its own path `avatars/`. Age range and gender are
 * optional and never leave this file except as the listener's own answers or as totals (FR-073).
 */
import type { Db } from '../../db.ts';

export const AVATAR_MAX_BYTES = 204_800;
export const AVATAR_CEILING_BYTES = 200 * 1024 * 1024;
export const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export const GENDERS = ['woman', 'man', 'another', 'unsaid'] as const;

export type MyProfile = {
  avatarUrl?: string; bio?: string; ageRange?: string; gender?: string; likesPublic: boolean; privateListening: boolean;
};

type Row = { avatar_url: string | null; bio: string | null; age_range: string | null; gender: string | null; likes_public: boolean; private_listening: boolean };

export async function myProfile(db: Db, id: string): Promise<MyProfile> {
  const [r] = await db.query<Row>('SELECT avatar_url, bio, age_range, gender, likes_public, private_listening FROM listeners WHERE id = $1', [id]);
  return {
    ...(r?.avatar_url ? { avatarUrl: r.avatar_url } : {}), ...(r?.bio ? { bio: r.bio } : {}),
    ...(r?.age_range ? { ageRange: r.age_range } : {}), ...(r?.gender ? { gender: r.gender } : {}),
    likesPublic: r?.likes_public ?? true, privateListening: r?.private_listening ?? false,
  };
}

export type ProfilePatch = { displayName?: string; bio?: string; ageRange?: string | null; gender?: string | null; likesPublic?: boolean };

/** Only the fields sent change; `null` clears age range or gender; an empty bio clears it. */
export async function updateProfile(db: Db, id: string, p: ProfilePatch): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (p.displayName !== undefined) set('display_name', p.displayName);
  if (p.bio !== undefined) set('bio', p.bio === '' ? null : p.bio);
  if (p.ageRange !== undefined) set('age_range', p.ageRange);
  if (p.gender !== undefined) set('gender', p.gender);
  if (p.likesPublic !== undefined) set('likes_public', p.likesPublic);
  if (sets.length === 0) return;
  await db.query(`UPDATE listeners SET ${sets.join(', ')} WHERE id = $1`, vals);
}

/** Bytes every photo takes now, without this listener's own (it is about to be replaced). */
export async function avatarBytesOthers(db: Db, id: string): Promise<number> {
  const [r] = await db.query<{ n: string | number | null }>('SELECT coalesce(sum(avatar_bytes), 0) AS n FROM listeners WHERE id <> $1', [id]);
  return Number(r?.n ?? 0);
}

export async function currentAvatar(db: Db, id: string): Promise<string | undefined> {
  const [r] = await db.query<{ avatar_url: string | null }>('SELECT avatar_url FROM listeners WHERE id = $1', [id]);
  return r?.avatar_url ?? undefined;
}

export async function setAvatar(db: Db, id: string, a: { url: string; path: string; bytes: number } | null): Promise<void> {
  await db.query('UPDATE listeners SET avatar_url = $2, avatar_path = $3, avatar_bytes = $4 WHERE id = $1', [id, a?.url ?? null, a?.path ?? null, a?.bytes ?? null]);
}

/** JPEG or PNG by their first bytes — the declared type is not trusted. */
export function imageKind(b: Uint8Array): 'image/jpeg' | 'image/png' | undefined {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return undefined;
}
