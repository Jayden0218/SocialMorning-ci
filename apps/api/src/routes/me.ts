import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { publicListener, requireAuth } from '../auth/session.ts';
import { verifyPassword } from '../auth/password.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { deleteAccount } from '../db/repos/delete-account.ts';

export const me = new Hono<AuthEnv>();

me.get('/', requireAuth, (c) => c.json({ listener: publicListener(c.get('listener')!) }));

/** FR-005a: self-service deletion, password re-asked. Ends every session (cascade). */
me.delete('/', requireAuth, json(z.object({ password: z.string().min(1).max(200) })), async (c) => {
  const db = c.get('db');
  const listener = c.get('listener')!;
  const [row] = await db.query<{ password_hash: string }>('SELECT password_hash FROM listeners WHERE id = $1', [listener.id]);
  if (!row || !(await verifyPassword(c.req.valid('json').password, row.password_hash))) {
    throw new ApiError('unauthenticated', 'That password is not right.');
  }
  await deleteAccount(db, listener.id);
  return c.json({});
});
