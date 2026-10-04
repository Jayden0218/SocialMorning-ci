// Checks that a busy button shows the moving bars and keeps its size.
/**
 * Guard G-BU1 (owner, 2026-10-04): a busy button showed still text ("…", "Sending…"), and the
 * code page's "Continue →" shrank to "…" when "Send again" was pressed — the two shared one
 * busy flag. Now a busy button keeps its words (hidden, so its size stays) under the app's
 * Loader, cannot be pressed again and is not dimmed; and on the email page only the pressed
 * button is busy.
 *
 * The break that turns it red: put `{props.busy ? '…' : props.text ?? props.label}` back in
 * AuthButton, or `busy={busy}` back on email.tsx's "Continue".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Button } from '@/ui/kit/Button';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function render(busy: boolean, disabled = false): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Button, { label: 'Send', onPress: () => undefined, busy, disabled })); });
  return r;
}

const button = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button')[0]!;
const bars = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'progressbar');
const words = (r: ReactTestRenderer) => JSON.stringify(r.toJSON()).includes('"Send"');

it('busy: the words stay (so the size stays), the bars move over them, no second press', () => {
  const idle = render(false);
  expect(words(idle)).toBe(true);
  expect(bars(idle)).toHaveLength(0);

  const busy = render(true);
  expect(words(busy)).toBe(true);
  expect(bars(busy)).toHaveLength(1);
  expect(button(busy).props['accessibilityState']).toMatchObject({ busy: true, disabled: true });
  act(() => { idle.unmount(); busy.unmount(); });
});

it('busy is not dimmed, even when the button is also disabled', () => {
  const r = render(true, true);
  expect(String(button(r).props['className'])).not.toContain('opacity-40');
  act(() => r.unmount());
  const off = render(false, true);
  expect(String(button(off).props['className'])).toContain('opacity-40');
  act(() => off.unmount());
});

it('AuthButton keeps its words and arrow while busy and draws BusyContent', () => {
  const shell = read('src/ui/auth/AuthShell.tsx');
  expect(shell).toContain('{props.text ?? props.label}</Text>');
  expect(shell).not.toMatch(/props\.busy \? '…'/);
  expect(shell).not.toMatch(/props\.trail && !props\.busy/);
  expect(shell).toMatch(/<BusyContent busy=\{busy\}/);
});

it('the email page: sending a code never makes "Continue" or "Create account" busy', () => {
  const page = read('app/auth/email.tsx');
  expect(page).toMatch(/label="Send code"[^>]*busy=\{sending\}/);
  expect(page).toMatch(/label="Continue"[^>]*busy=\{verifying\}/);
  expect(page).toMatch(/label="Create account"[^>]*busy=\{verifying\}/);
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
  });
}

it('no button swaps its words for still busy text', () => {
  const still = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]
    .filter((p) => /\? '(?:…|Sending…|Posting…|Saving…|Deleting…)'/.test(readFileSync(p, 'utf8')))
    .map((p) => relative(ROOT, p));
  expect(still).toEqual([]);
});
