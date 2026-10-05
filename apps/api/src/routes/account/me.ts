// My account routes: read, edit name and privacy, and delete the account.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { publicListener, requireAuth } from '../../auth/session.ts';
import { verifyPassword } from '../../auth/password.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { deleteAccount } from '../../db/repos/account/delete-account.ts';
import { checkCode, consumeCode } from '../../auth/codes.ts';
import { removeAllFor } from '../../db/repos/social/voice-posts.ts';
import { removeImagesFor } from '../../db/repos/social/comment-images.ts';
import { AGE_RANGES, AVATAR_CEILING_BYTES, AVATAR_MAX_BYTES, GENDERS, avatarBytesOthers, currentAvatar, imageKind, myProfile, setAvatar, updateProfile } from '../../db/repos/account/profile.ts';

export const me = new Hono<AuthEnv>();

me.get('/', requireAuth, async (c) => {
  const l = c.get('listener')!;
  // M4 (FR-013): the privacy switch travels with the account, so a second phone shows it right.
  // M19 US1: and the profile the listener edits — photo, bio, age range, gender, likes public.
  return c.json({ listener: { ...publicListener(l), ...(await myProfile(c.get('db'), l.id)) } });
});

/** M19 US1 (FR-001, FR-003): PATCH { displayName?, bio?, ageRange?, gender?, likesPublic? } — only what is sent changes. */
const patchBody = z.object({
  displayName: z.string().trim().min(1).max(30).optional(),
  bio: z.string().trim().max(160).optional(),
  ageRange: z.enum(AGE_RANGES).nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  likesPublic: z.boolean().optional(),
});
me.patch('/', requireAuth, json(patchBody), async (c) => {
  const db = c.get('db');
  const l = c.get('listener')!;
  const b = c.req.valid('json');
  await updateProfile(db, l.id, {
    ...(b.displayName !== undefined ? { displayName: b.displayName } : {}), ...(b.bio !== undefined ? { bio: b.bio } : {}),
    ...(b.ageRange !== undefined ? { ageRange: b.ageRange } : {}), ...(b.gender !== undefined ? { gender: b.gender } : {}),
    ...(b.likesPublic !== undefined ? { likesPublic: b.likesPublic } : {}),
  });
  const [n] = await db.query<{ display_name: string }>('SELECT display_name FROM listeners WHERE id = $1', [l.id]);
  return c.json({ listener: { ...publicListener({ ...l, display_name: n?.display_name ?? l.display_name }), ...(await myProfile(db, l.id)) } });
});

/**
 * M19 US1 (FR-002): PUT the photo as the raw JPEG or PNG (≤ 200 KB, checked by its bytes, not its
 * header). The old photo leaves the store once the new one is saved; every photo together stays
 * under the 200 MB ceiling (constitution v2.6.0).
 */
me.put('/avatar', requireAuth, async (c) => {
  const db = c.get('db');
  const store = c.get('avatars');
  const l = c.get('listener')!;
  if (!store.ready) throw new ApiError('storage_off', 'Profile photos are not available right now.');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) throw new ApiError('validation', 'Send the photo as the request body.');
  if (bytes.length > AVATAR_MAX_BYTES) throw new ApiError('too_large', 'A profile photo is at most 200 KB.');
  const type = imageKind(bytes);
  if (!type) throw new ApiError('validation', 'A profile photo must be a JPEG or PNG image.');
  if ((await avatarBytesOthers(db, l.id)) + bytes.length > AVATAR_CEILING_BYTES) throw new ApiError('storage_full', 'Profile photo storage is full right now.');
  const old = await currentAvatar(db, l.id);
  const path = `avatars/${l.id}/${crypto.randomUUID()}.${type === 'image/png' ? 'png' : 'jpg'}`;
  const saved = await store.put(path, bytes, type);
  await setAvatar(db, l.id, { url: saved.url, path: saved.pathname, bytes: bytes.length });
  if (old) { try { await store.remove(old); } catch (e) { console.error('old avatar not removed', e); } }
  return c.json({ avatarUrl: saved.url });
});

me.delete('/avatar', requireAuth, async (c) => {
  const db = c.get('db');
  const l = c.get('listener')!;
  const old = await currentAvatar(db, l.id);
  await setAvatar(db, l.id, null);
  if (old) { try { await c.get('avatars').remove(old); } catch (e) { console.error('avatar not removed', e); } }
  return c.body(null, 204);
});

/**
 * FR-005a: self-service deletion, re-confirmed. Ends every session (cascade). Since the
 * app dropped passwords (owner, 2026-09-27) it confirms with a code sent to the account's
 * email (`POST /v1/auth/code`); a password still works for accounts made before.
 */
const deleteBody = z.union([
  z.object({ code: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ password: z.string().min(1).max(200) }),
]);
me.delete('/', requireAuth, json(deleteBody), async (c) => {
  const db = c.get('db');
  const listener = c.get('listener')!;
  const body = c.req.valid('json');
  if ('code' in body) {
    const r = await checkCode(db, listener.email, body.code, c.get('pepper'), Date.now());
    if (r !== 'ok') throw new ApiError('unauthenticated', r === 'expired' ? 'That code has expired. Ask for a new one.' : 'That code is not right.');
    await consumeCode(db, listener.email);
  } else {
    const [row] = await db.query<{ password_hash: string }>('SELECT password_hash FROM listeners WHERE id = $1', [listener.id]);
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      throw new ApiError('unauthenticated', 'That password is not right.');
    }
  }
  // M12 FR-104: the listener's voice recordings leave the store before the rows cascade away.
  try { await removeAllFor(db, c.get('voice'), listener.id); } catch (e) { console.error('voice cleanup on delete', e); }
  // M20 US9 (FR-055): the listener's comment images leave the store before the account goes.
  try { await removeImagesFor(db, c.get('images'), listener.id); } catch (e) { console.error('image cleanup on delete', e); }
  // M19 US1: the photo is deleted with the account (constitution v2.6.0).
  try { const a = await currentAvatar(db, listener.id); if (a) await c.get('avatars').remove(a); } catch (e) { console.error('avatar cleanup on delete', e); }
  await deleteAccount(db, listener.id);
  return c.json({});
});
