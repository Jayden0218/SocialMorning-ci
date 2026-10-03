// Sends feedback by email and keeps a copy on the phone.
/**
 * Feedback (填写反馈 / 我的反馈, M10): a message goes to SocialNet's support address by the
 * phone's own email app — SocialNet has no feedback inbox of its own — and a copy is kept
 * on this phone so "My feedback" can list what you sent.
 */
import type { SettingsStore } from '@/storage/types';
import { readList, writeList } from '@/me/local-list';
import type { FeedbackKind } from './faq';

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

export function rememberFeedback(s: SettingsStore, kind: FeedbackKind, body: string, now: number): void {
  writeList(s, FEEDBACK_KEY, [{ kind, body: body.trim().slice(0, FEEDBACK_MAX), at: now }, ...listFeedback(s)].slice(0, 50));
}
