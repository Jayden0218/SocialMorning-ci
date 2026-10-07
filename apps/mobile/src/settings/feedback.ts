// Sends feedback by email and keeps a copy on the phone.
/**
 * Feedback (填写反馈 / 我的反馈, M10): a message goes to SocialNet's support address by the
 * phone's own email app — SocialNet has no feedback inbox of its own — and a copy is kept
 * on this phone so "My feedback" can list what you sent.
 */
import type { SettingsStore } from '@/storage/types';
import { readList, writeList } from '@/me/local-list';
import type { FeedbackKind } from './faq';
import { plural } from '@socialmorning/social-core';

export const FEEDBACK_KEY = 'me.feedback';
export const FEEDBACK_MAX = 2000;
export type SentFeedback = { kind: string; body: string; at: number };

const ok = (x: unknown): x is SentFeedback => typeof x === 'object' && x !== null && typeof (x as SentFeedback).body === 'string' && typeof (x as SentFeedback).at === 'number';

export const listFeedback = (s: SettingsStore): SentFeedback[] => readList(s, FEEDBACK_KEY, ok);

export function feedbackMailto(to: string, kind: FeedbackKind, body: string, appVersion: string): string {
  const subject = `SocialNet feedback — ${kind}`;
  const text = `${body.trim().slice(0, FEEDBACK_MAX)}\n\n— SocialNet ${appVersion}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/**
 * M23 US8 (FR-013): the phone's last errors, added under the message when the listener agrees.
 * Plain lines ("scope: message · version"), cut so the whole message stays within FEEDBACK_MAX.
 */
export function withErrors(body: string, errors: readonly { scope: string; message: string; appVersion: string }[]): string {
  const text = body.trim();
  if (errors.length === 0) return text;
  const lines = errorLines(errors);
  return `${text}\n\n— The last ${plural(errors.length, 'error')} on this phone:\n${lines.join('\n')}`.slice(0, FEEDBACK_MAX);
}

/** M23 US8: the errors as the feedback route's `errors` field takes them — ≤ 20 one-line strings. */
export function errorLines(errors: readonly { scope: string; message: string; appVersion: string }[]): string[] {
  return errors.slice(-20).map((e) => `${e.scope}: ${e.message.replace(/\s+/g, ' ').slice(0, 120)} · ${e.appVersion}`);
}

export function rememberFeedback(s: SettingsStore, kind: FeedbackKind, body: string, now: number): void {
  writeList(s, FEEDBACK_KEY, [{ kind, body: body.trim().slice(0, FEEDBACK_MAX), at: now }, ...listFeedback(s)].slice(0, 50));
}
