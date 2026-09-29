/**
 * FR-028 / SC-007: axe finds no violations on each page. jsdom has no layout, so axe's
 * colour-contrast rule cannot run here — contrast is measured from the tokens instead
 * (test/tokens.test.ts). Said plainly so a green run is not read as a contrast check.
 */
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Home } from '../src/pages/Home';
import { NoShow } from '../src/pages/NoShow';
import { SignIn } from '../src/pages/SignIn';
import { Layout } from '../src/shell/Layout';
import { SessionProvider } from '../src/session';
import { OVERVIEW, SHOW, mockApi, renderIn, trendOf } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function violations(el: Element) {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('axe (no layout, so no contrast — see tokens.test.ts)', () => {
  it('sign-in', async () => {
    const { container } = render(<MemoryRouter><SessionProvider initial={{ state: 'out' }}><SignIn /></SessionProvider></MemoryRouter>);
    expect(await violations(container)).toEqual([]);
  });

  it('no show yet', async () => {
    const { container } = renderIn(<NoShow />);
    expect(await violations(container)).toEqual([]);
  });

  it('home in the layout, with data', async () => {
    mockApi((p) => (p.includes('/overview') ? { status: 200, body: OVERVIEW } : p.includes('/trend') ? { status: 200, body: trendOf(3) } : undefined));
    const { container } = renderIn(<Layout show={SHOW}><Home show={SHOW} /></Layout>);
    await screen.findByText('1,234');
    expect(await violations(container)).toEqual([]);
  });
});
