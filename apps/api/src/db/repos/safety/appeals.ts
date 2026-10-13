// Appeals: what a listener may appeal, sending one appeal per action, and the admin's decision.
/**
 * M24 US6. An appeal is about one moderation action against the listener — their suspension, or
 * the removal of something they posted — from the last APPEAL_DAYS days. One per action (keyed
 * by the action's id). Accepting undoes the action; rejecting leaves it.
 * Either way the listener gets a system notice.
 */
import type { Action, TargetKind } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export const APPEAL_DAYS = 90;
export const APPEAL_TEXT_MAX = 1000;

export type Appealable = {
  actionId: string; action: Action; targetKind: TargetKind; targetId: string; at: string;
  /** What was acted on, from the copy a report kept (a removed item is no longer readable). */
  what: string;
  appeal: { id: string; state: 'open' | 'accepted' | 'rejected'; createdAt: string } | null;
};

const obj = (v: unknown): Record<string, unknown> => {
  const x = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
};

/** One line saying what an action was about, from its report's copy. */
export function describe(kind: TargetKind, action: Action, snapshot: unknown): string {
  if (action === 'suspend') return 'Your account was suspended';
  const s = obj(snapshot);
  const text = [s['body'], s['caption'], s['title'], s['voiceText']].find((v): v is string => typeof v === 'string' && v !== '');
  const thing = kind === 'chat_message' ? 'message' : kind === 'list' ? 'shared list' : kind;
  return text ? `Your ${thing} “${text.length > 80 ? `${text.slice(0, 80)}…` : text}” was removed` : `Your ${thing} was removed`;
}

export type AdminAppeal = {
  id: string; state: 'open' | 'accepted' | 'rejected'; text: string; createdAt: string; decidedAt: string | null;
  listener: { id: string; displayName: string; email: string; suspended: boolean };
  action: { id: string; action: Action; targetKind: TargetKind; targetId: string; at: string };
  what: string; snapshot: Record<string, unknown>;
};

// DynamoDB bodies: ddb/appeals.ts (db/backend.ts).
export const appealableFor = viaStore<typeof import('./ddb/appeals.ts').appealableFor>('sf/appeals', 'appealableFor');
export const sendAppeal = viaStore<typeof import('./ddb/appeals.ts').sendAppeal>('sf/appeals', 'sendAppeal');
export const adminAppeals = viaStore<typeof import('./ddb/appeals.ts').adminAppeals>('sf/appeals', 'adminAppeals');
export const appealById = viaStore<typeof import('./ddb/appeals.ts').appealById>('sf/appeals', 'appealById');
export const restoreRemoved = viaStore<typeof import('./ddb/appeals.ts').restoreRemoved>('sf/appeals', 'restoreRemoved');
export const decide = viaStore<typeof import('./ddb/appeals.ts').decide>('sf/appeals', 'decide');
