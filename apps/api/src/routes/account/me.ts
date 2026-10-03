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

export const me = new Hono<AuthEnv>();

me.get('/', requireAuth, async (c) => {
  const l = c.get('listener')!;
  // M4 (FR-013): the privacy switch travels with the account, so a second phone shows it right.
  const [row] = await c.get('db').query<{ private_listening: boolean }>('SELECT private_listening FROM listeners WHERE id = $1', [l.id]);
  return c.json({ listener: { ...publicListener(l), privateListening: row?.private_listening ?? false } });
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
  await deleteAccount(db, listener.id);
  return c.json({});
});
