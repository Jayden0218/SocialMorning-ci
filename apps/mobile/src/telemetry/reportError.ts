// Keeps the app's last 50 errors and sends them to our own server, at most once a minute.
/**
 * M23 US8 (FR-013; owner, 2026-10-07: "our own error log", no outside service). Errors the app
 * used to swallow in an empty `catch {}` or `.catch(() => undefined)` go through `reportError`:
 *
 *  - the last 50 stay on the phone (a ring), so Feedback can offer to include the last 20;
 *  - unsent ones go to `POST /v1/errors` as `{ reports: [...] }`, up to 20 at a time, at most one
 *    send a minute, signed in or not (the request helper adds the token when there is one);
 *  - "Couldn't reach the server" (ApiError `network`) is kept on the phone but not sent: offline is
 *    normal, and it would be sent the moment it is no longer true;
 *  - a failed send is dropped quietly and never reported itself (no loop), and `reportError` never
 *    throws — it sits inside catch blocks.
 *
 * No personal data: the scope (a fixed name in the code), the message, the stack, the app version
 * and the platform. The server adds the listener id when the call is signed in.
 */
import { ApiError } from '@/social/api';

export type ErrorReport = { scope: string; message: string; stack?: string; appVersion: string; platform: string };
export type KeptError = ErrorReport & { at: number };

export type ErrorReportDeps = {
  /** Sends one batch (≤ 20) to POST /v1/errors. */
  send: (reports: ErrorReport[]) => Promise<void>;
  appVersion: string;
  platform: string;
  now?: () => number;
};

export const KEEP = 50;
export const BATCH = 20;
export const SEND_EVERY_MS = 60_000;

let deps: ErrorReportDeps | undefined;
let kept: KeptError[] = [];
let unsent: ErrorReport[] = [];
let lastSentAt = -Infinity;
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;

const clock = (): number => (deps?.now ?? Date.now)();

/** Start sending (the app's start-up). `undefined` stops it and clears the timer (tests, sign-out is not needed). */
export function configureErrorReports(next: ErrorReportDeps | undefined): void {
  deps = next;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  if (deps !== undefined && unsent.length > 0) schedule();
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, ...(error.stack ? { stack: error.stack.slice(0, 4000) } : {}) };
  if (typeof error === 'string') return { message: error };
  try { return { message: JSON.stringify(error) ?? String(error) }; } catch { return { message: String(error) }; }
}

/** Record one swallowed error. Never throws. */
export function reportError(scope: string, error: unknown): void {
  try {
    const { message, stack } = describe(error);
    const report: ErrorReport = {
      scope: scope.slice(0, 64),
      message: message.slice(0, 500),
      ...(stack !== undefined ? { stack } : {}),
      appVersion: deps?.appVersion ?? '?',
      platform: deps?.platform ?? '?',
    };
    kept = [...kept, { ...report, at: clock() }].slice(-KEEP);
    if (error instanceof ApiError && error.code === 'network') return;
    unsent = [...unsent, report].slice(-KEEP);
    if (deps !== undefined) schedule();
  } catch {
    // M23: the reporter must never break the code that called it.
  }
}

/** For promise chains: `.catch(reportAndDrop('feed.refresh'))` in place of `.catch(() => undefined)`. */
export function reportAndDrop(scope: string): (error: unknown) => undefined {
  return (error) => { reportError(scope, error); return undefined; };
}

/** The newest `n` kept errors, newest last — what Feedback offers to include. */
export function recentErrors(n = 20): KeptError[] {
  return kept.slice(-n);
}

function schedule(): void {
  if (timer !== undefined || sending) return;
  const wait = Math.max(0, lastSentAt + SEND_EVERY_MS - clock());
  timer = setTimeout(() => { timer = undefined; void flush(); }, wait);
}

/** Send one batch now (the timer calls it; exported for tests). */
export async function flush(): Promise<void> {
  const d = deps;
  if (d === undefined || sending || unsent.length === 0) return;
  const batch = unsent.slice(0, BATCH);
  unsent = unsent.slice(BATCH);
  sending = true;
  lastSentAt = clock();
  try {
    await d.send(batch);
  } catch {
    // M23: a failed send is dropped, never reported (that would loop).
  } finally {
    sending = false;
  }
  if (unsent.length > 0 && deps !== undefined) schedule();
}

/** Tests only: forget everything. */
export function resetErrorReports(): void {
  configureErrorReports(undefined);
  kept = [];
  unsent = [];
  lastSentAt = -Infinity;
  sending = false;
}
