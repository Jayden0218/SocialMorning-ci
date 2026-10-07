// Tests the M23 Studio hardening: dialog focus, CSV sign-out, sign-out in every tab, security headers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { ConfirmDialog } from '../src/shell/ConfirmDialog';
import { downloadCsv, SIGNED_OUT_KEY, whenSignedOut } from '../src/api';
import { SessionProvider, useSession } from '../src/session';
import { mockApi } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Opener() {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <ConfirmDialog title="Delete?" body="Gone for good." confirm="Delete" onCancel={() => setOpen(false)} onConfirm={() => setN(n + 1)}>
          <input aria-label="Reason" />
        </ConfirmDialog>
      ) : null}
    </>
  );
}

describe('ConfirmDialog focus (T042)', () => {
  it('focuses Cancel once, keeps Tab inside, and gives focus back to the opener', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(cancel);
    // A parent re-render (Delete changes its state) must not pull focus back to Cancel.
    screen.getByLabelText('Reason').focus();
    fireEvent.click(confirm);
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
    // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last.
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('sign-out (T042)', () => {
  it('a CSV export answered 401 signs the Studio out', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const out = vi.fn();
    whenSignedOut(out);
    await expect(downloadCsv('/v1/studio/shows/abc/subscribers.csv', 'x.csv')).rejects.toMatchObject({ status: 401 });
    expect(out).toHaveBeenCalledTimes(1);
  });

  it('signing out in another tab signs this tab out', () => {
    function State() { return <p>{useSession().session.state}</p>; }
    render(<SessionProvider initial={{ state: 'in', me: { id: 'u1', email: 'o@example.com', displayName: 'O' }, shows: [] }}><State /></SessionProvider>);
    expect(screen.getByText('in')).toBeTruthy();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: SIGNED_OUT_KEY, newValue: String(Date.now()) })); });
    expect(screen.getByText('out')).toBeTruthy();
  });
});

describe('security headers (T040)', () => {
  it('every Studio page sends a CSP that forbids framing and foreign scripts, plus nosniff and Referrer-Policy', () => {
    const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const all = cfg.headers.find((h) => h.source === '/(.*)');
    const get = (k: string) => all?.headers.find((h) => h.key === k)?.value ?? '';
    const csp = get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://vercel.com");
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
