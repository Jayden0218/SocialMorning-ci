// Tests the shared screen loader: no state after unmount, newest answer wins, one offline message.
/**
 * M23 US9 (FR-014): `useLoad` replaces hand-written loading in screens that had no cancel guard.
 *
 * The break that turns it red: in `src/ui/kit/useLoad.ts`, delete `return () => { live = false; };`
 * and the `id === latest.current` checks — the unmount and retry cases then set state late.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { ApiError } from '@/social/api';
import { FAILED_MESSAGE, OFFLINE_MESSAGE, useLoad, type LoadState } from '@/ui/kit/useLoad';
import { recentErrors, resetErrorReports } from '@/telemetry/reportError';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const label = (s: LoadState<{ n: number }>): string => (s.kind === 'ok' ? `ok ${s.n}` : s.kind === 'error' ? `error ${s.message}` : 'loading');

beforeEach(() => resetErrorReports());

it('an answer after the screen closed sets nothing', async () => {
  const d = deferred<{ n: number }>();
  const seen: string[] = [];
  function Screen(): React.ReactElement {
    const [s] = useLoad(() => d.promise, []);
    seen.push(label(s));
    return createElement(Text, null, label(s));
  }
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Screen)); });
  act(() => { r.unmount(); });
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => { d.resolve({ n: 1 }); await d.promise; });
  expect(seen).toEqual(['loading']);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

it('after a retry only the newest answer lands, even when the older one is slower', async () => {
  const calls: Deferred<{ n: number }>[] = [];
  let reload!: () => void;
  function Screen(): React.ReactElement {
    const [s, again] = useLoad(() => { const d = deferred<{ n: number }>(); calls.push(d); return d.promise; }, []);
    reload = again;
    return createElement(Text, null, label(s));
  }
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Screen)); });
  act(() => { reload(); });
  expect(calls).toHaveLength(2);
  await act(async () => { calls[1]!.resolve({ n: 2 }); await calls[1]!.promise; });
  expect(r.toJSON()).toMatchObject({ children: ['ok 2'] });
  await act(async () => { calls[0]!.resolve({ n: 1 }); await calls[0]!.promise; });
  expect(r.toJSON()).toMatchObject({ children: ['ok 2'] });
});

it('offline gives the one "Couldn\'t reach the server." message and is not logged; other failures are', async () => {
  function Screen(props: { fail: unknown }): React.ReactElement {
    const [s] = useLoad(() => Promise.reject(props.fail), [props.fail], 'test.load');
    return createElement(Text, null, label(s as LoadState<{ n: number }>));
  }
  let r!: ReactTestRenderer;
  const offline = new ApiError('network', "Couldn't reach the server.", 0);
  await act(async () => { r = create(createElement(Screen, { fail: offline })); });
  expect(r.toJSON()).toMatchObject({ children: [`error ${OFFLINE_MESSAGE}`] });
  expect(recentErrors()).toEqual([]);
  await act(async () => { r.update(createElement(Screen, { fail: new Error('500') })); });
  expect(r.toJSON()).toMatchObject({ children: [`error ${FAILED_MESSAGE}`] });
  expect(recentErrors().map((e) => e.scope)).toEqual(['test.load']);
});

it('the screens named in the task use it', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const screens = ['friends-listening', 'chart', 'issue/[id]', 'issues', 'tips', 'picks/daily', 'chat/new', 'wallet', 'settings/help', 'settings/feedback'];
  const using = screens.filter((s) => /useLoad\(/.test(readFileSync(join(__dirname, '..', 'app', `${s}.tsx`), 'utf8')));
  expect(using).toEqual(screens);
});
