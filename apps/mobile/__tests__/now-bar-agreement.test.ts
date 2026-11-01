// Tests that every page lays out as the now bar is: one rule answers "is the now bar on this page?".
/**
 * 035 M1 / T011 (device check B1, B3, B7; FR-001). Two rules used to answer the question and disagreed: `miniPlayerShows`
 * (src/ui/player/MiniPlayer.tsx) decides whether the bar is DRAWN, `toastPlacement` (src/ui/shell/toastPlacement.ts) decides
 * where `PushedPage` puts its title bar. On /notifications, /chat/<id> and /scan the bar was drawn while the page laid out
 * as if there was none, so the title bar sat under it (run 41298243090).
 *
 * The route list is built from `app/` itself, so a new page is covered the day it is added. Metadata-free: `[id]` → "x",
 * `(group)` folders vanish, `index` is its folder. An episode is loaded (idle = false); Moments is off.
 *
 * The break that turns it red: give `toastPlacement` a constant `now` for any route (as the composer cases did), or add a
 * route to `miniPlayerShows`' stand-down list without the placement following.
 */
import fs from 'node:fs';
import path from 'node:path';
import { toastPlacement } from '@/ui/shell/toastPlacement';
import { miniPlayerShows, TAB_ROUTES } from '@/ui/player/MiniPlayer';

jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}), useToast: () => jest.fn() }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: jest.fn() }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/', router: { push: jest.fn() }, useIsFocused: () => true }));

const APP = path.join(__dirname, '..', 'app');

function walk(dir: string, rel: string[] = []): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { out.push(...walk(full, [...rel, name])); continue; }
    if (!name.endsWith('.tsx') || name.startsWith('_') || name.startsWith('+')) continue;
    out.push([...rel, name.replace(/\.tsx$/, '')].join('/'));
  }
  return out;
}

export function routesOfApp(): string[] {
  const set = new Set<string>();
  for (const file of walk(APP)) {
    const segs = file.split('/').filter((s) => !/^\(.*\)$/.test(s)).map((s) => (s.startsWith('[...') ? 'x/y' : /^\[.*\]$/.test(s) ? 'x' : s));
    if (segs[segs.length - 1] === 'index') segs.pop();
    set.add('/' + segs.join('/'));
  }
  return [...set].sort();
}

describe('the route list', () => {
  it('is read from app/ and is not trivially small', () => {
    const r = routesOfApp();
    expect(r.length).toBeGreaterThan(60);
    expect(r).toEqual(expect.arrayContaining(['/notifications', '/chat/x', '/chat/new', '/scan', '/show/x', '/player']));
  });
});

describe('where the now bar is drawn = where pages lay out for it', () => {
  it.each(routesOfApp())('%s', (route) => {
    const tabs = TAB_ROUTES.includes(route);
    const drawn = miniPlayerShows(route, tabs ? 'tabs' : 'root', false);
    expect(toastPlacement(route, false, false).now).toBe(drawn);
  });
});
