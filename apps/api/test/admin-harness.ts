/**
 * M15 — helpers for the Admin tests: an owner (the first admin, seeded from OWNER_LISTENER_ID)
 * and a second, ordinary Studio account; a catalogue fetch that answers Apple with the fake and
 * the fixture feed at `FX`, so nothing reaches the network.
 */
import { freshDb, type TestDb } from './harness.ts';
import { sCall, studioLogin, type StudioUser } from './studio-harness.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';

export const FX = 'https://feeds.example.com/fx.xml';

export function catalogFetch(): typeof fetch {
  const apple = fakeApple();
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('itunes.apple.com')) return apple.fetch(input, init);
    if (url.includes('feeds.example.com/fx.xml')) return fakeFeedFetch(FIXTURE_FEED)(input, init);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
}

export type AdminSetup = { t: TestDb; owner: StudioUser; other: StudioUser };

/** `opts` goes to `freshDb` (and on to `createApp`), e.g. `{ episodeStorage, picksRaw, today }`. */
export async function adminSetup(opts: Record<string, unknown> = {}): Promise<AdminSetup> {
  const t = await freshDb({ catalogFetch: catalogFetch(), ...opts } as never);
  const owner = await studioLogin(t, 'owner@example.com', 'Owner');
  t.setOwner!(owner.id);
  const other = await studioLogin(t, 'other@example.com', 'Other');
  return { t, owner, other };
}

/** An admin call as the Studio makes it. */
export const aCall = (t: TestDb, method: string, path: string, who?: StudioUser, body?: unknown, extra: Record<string, string> = {}) =>
  sCall(t, method, path, who, body, extra);

export async function auditRows(t: TestDb) {
  return t.q<{ id: string; admin_id: string; acting_as: string | null; area: string; action: string; target: string; before_type: string | null; after_type: string | null }>(
    'SELECT id::text, admin_id, acting_as, area, action, target, jsonb_typeof(before) AS before_type, jsonb_typeof(after) AS after_type FROM admin_audit ORDER BY id');
}
