// The local-only /_compare/* routes both comparison servers answer (sessions, sample, episode), in front of the app.
/**
 * M28 US1 (contracts/compare-cli.md). `compare-server.ts` (this branch, DynamoDB) and `compare-server-old.ts` (the `main`
 * build, Postgres) both put this in front of their app, each with its own hooks, so `compare.ts` talks to the two alike.
 * The file imports nothing from `src/`: the old server loads it next to a different build of the app.
 *
 *   POST /_compare/session       { listenerId }  → { token }   a session minted by the side's own session code
 *   POST /_compare/session/end   { token }       → { ok }      signed out through the app's own route
 *   GET  /_compare/sample?n=5                    → { ids }     the most active listeners
 *   GET  /_compare/episode?listener=<id>         → { id }      the listener's most-commented episode
 *   POST /_compare/by-email      { email }       → { id }      for --email-env (the email is never logged or echoed)
 *
 * Answered only for a Host of localhost / 127.0.0.1 (everything else is the app's own 404). No token is logged here.
 */
export type CompareHooks = {
  app: { fetch(req: Request, env?: unknown): Response | Promise<Response> };
  mint(listenerId: string): Promise<string>;
  sample(n: number): Promise<string[]>;
  episode(listenerId: string): Promise<string | undefined>;
  byEmail(email: string): Promise<string | undefined>;
};

/** What the app is given in place of the network: a difference between the sides is then data, never a fetch. */
export const offlineFetch = (async () => new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

const json = (v: unknown, status = 200): Response => Response.json(v, { status, headers: { 'cache-control': 'no-store' } });
const localHost = (req: Request): boolean => {
  const h = new URL(req.url).hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
};

export function compareFetch(h: CompareHooks): (req: Request, env?: unknown) => Promise<Response> {
  return async (req, env) => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/_compare/') || !localHost(req)) return h.app.fetch(req, env);
    const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    try {
      if (req.method === 'POST' && url.pathname === '/_compare/session' && typeof body['listenerId'] === 'string') return json({ token: await h.mint(body['listenerId']) });
      if (req.method === 'POST' && url.pathname === '/_compare/session/end' && typeof body['token'] === 'string') {
        const res = await h.app.fetch(new Request(new URL('/v1/auth/sign-out', url), { method: 'POST', headers: { authorization: `Bearer ${body['token']}` } }), env);
        return json({ ok: res.status < 300 });
      }
      if (req.method === 'GET' && url.pathname === '/_compare/sample') return json({ ids: await h.sample(Math.max(1, Math.min(200, Number(url.searchParams.get('n') ?? 5) || 5))) });
      if (req.method === 'GET' && url.pathname === '/_compare/episode') {
        const id = await h.episode(url.searchParams.get('listener') ?? '');
        return id ? json({ id }) : json({ error: 'none' }, 404);
      }
      if (req.method === 'POST' && url.pathname === '/_compare/by-email' && typeof body['email'] === 'string') {
        const id = await h.byEmail(body['email']);
        return id ? json({ id }) : json({ error: 'none' }, 404);
      }
    } catch (e) {
      return json({ error: 'compare_failed', message: e instanceof Error ? e.constructor.name : 'error' }, 500);
    }
    return json({ error: 'not_found' }, 404);
  };
}
