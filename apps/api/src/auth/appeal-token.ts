// A signed, short-lived token that lets a suspended listener appeal without a working session.
/**
 * M24 US6. A suspended account is refused on every request (session.ts), and the phone then
 * forgets its session. So the `suspended` answer carries `appealToken`: `<listenerId>.<expiresMs>.<mac>`,
 * the MAC an HMAC-SHA256 of the first two parts with the server's pepper. It opens only the appeal
 * routes (`routes/safety/appeals.ts`), only for that listener, for APPEAL_TOKEN_DAYS.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const APPEAL_TOKEN_DAYS = 30;

/** Constant-time compare (session.ts has the same; not imported, as session.ts imports this file). */
const same = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const mac = (body: string, pepper: string): string => createHmac('sha256', pepper).update(`appeal:${body}`).digest('base64url');

export function appealTokenFor(listenerId: string, pepper: string, now = Date.now()): string {
  const body = `${listenerId}.${now + APPEAL_TOKEN_DAYS * 86_400_000}`;
  return `${body}.${mac(body, pepper)}`;
}

/** The listener the token names, or undefined when it is malformed, forged or expired. */
export function listenerForAppealToken(token: string, pepper: string, now = Date.now()): string | undefined {
  const m = /^([0-9a-f-]{36})\.(\d{1,15})\.([A-Za-z0-9_-]{20,64})$/i.exec(token);
  if (!m) return undefined;
  const [, id, exp, sig] = m;
  if (!same(sig!, mac(`${id}.${exp}`, pepper))) return undefined;
  return Number(exp) > now ? id : undefined;
}
