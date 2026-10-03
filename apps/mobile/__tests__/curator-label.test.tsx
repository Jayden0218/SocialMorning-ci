/**
 * Guard G-C1 (specs/015-m15-admin/data-model.md, SC-006, constitution v2.4.0): a curated
 * external show reads "Shared by <name>" (linking to the profile), and no phone screen
 * calls the curator its host.
 *
 * The break that turns it red: render the curator through the "Hosted by" line — e.g. in
 * `app/show/[feedUrl].tsx` write `const hostLine = curator?.displayName ?? hostLineFor(ov, show?.author);`,
 * or make `hostLineFor` in `src/ui/show/CuratorLine.tsx` fall back to the curator.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }), router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { votePoll: jest.fn() }, listener: { listenerId: 'me' } }) }));

import { CuratorLine, hostLineFor, sharedBy } from '@/ui/show/CuratorLine';
import { ShowExtrasBlock } from '@/ui/show/ShowExtras';
import type { ShowExtras } from '@/social/api';
import { colour } from '@/design/tokens';

const CURATOR = { id: 'acct-1', displayName: 'Ana Curates' };
const texts = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

beforeEach(() => mockPush.mockClear());

it.each([false, true])('"Shared by <name>" links to the profile (row = %s), and never says host', (row) => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(CuratorLine, { curator: CURATOR, row, iconColour: colour.muted })); });
  expect(texts(r)).toContain('Shared by');
  expect(texts(r)).toContain('Ana Curates');
  expect(texts(r)).not.toMatch(/host/i);
  act(() => { byLabel(r, 'Shared by Ana Curates. Opens their profile').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/profile/[id]', params: { id: 'acct-1' } });
  expect(sharedBy(CURATOR)).toBe('Shared by Ana Curates');
});

it('the "Hosted by" line is the creator\'s names or the feed author — never the curator', () => {
  const overrides: ShowExtras['overrides'] = { title: null, description: null, coverUrl: null, themeColour: null, milestoneMessage: null, hosts: null, links: null };
  expect(hostLineFor(null, 'The Feed Author')).toBe('The Feed Author');
  expect(hostLineFor(overrides, 'The Feed Author')).toBe('The Feed Author');
  expect(hostLineFor({ ...overrides, hosts: ['Mei'] }, 'The Feed Author')).toBe('Mei');
  expect(hostLineFor(undefined, undefined)).toBeUndefined();
});

it('the show extras block (Hosted by …) does not show the curator', () => {
  const extras: ShowExtras = { overrides: null, announcements: [], polls: [], curator: CURATOR };
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ShowExtrasBlock, { extras, onPoll: jest.fn() })); });
  expect(texts(r)).not.toContain('Ana Curates');
});

describe('the source: no screen pairs the curator with "host"', () => {
  const ROOT = join(__dirname, '..');
  const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
  const isComment = (line: string): boolean => /^(\/\/|\/\*|\*|\{\/\*)/.test(line.trim());

  it('the show page builds "Hosted by" only from hostLineFor(ov, show?.author)', () => {
    const show = readFileSync(join(ROOT, 'app', 'show', '[feedUrl].tsx'), 'utf8');
    expect(show).toMatch(/const hostLine = hostLineFor\(ov, show\?\.author\);/);
    expect(show).toContain('<CuratorLine curator={curator}');
  });

  it('no code line in app/ or src/ mentions the curator and a host together', () => {
    const offenders: string[] = [];
    for (const f of [...files('app'), ...files('src')]) {
      readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
        if (!isComment(line) && /curator/.test(line) && /host/i.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
