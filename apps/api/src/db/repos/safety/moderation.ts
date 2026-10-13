// Applies a moderation action, closes its reports and records it, in one step.
/**
 * M6 moderation actions (FR-012–FR-016, R8): one transaction records the action, closes
 * the target's open reports, and applies the effect. Only the owner reaches this (G9,
 * checked in the page).
 */
import type { Action, TargetKind } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export type ActionRow = { id: string; actor_id: string; action: Action; target_kind: TargetKind; target_id: string; created_at: string };

// DynamoDB bodies: ddb/moderation.ts (db/backend.ts).
export const act = viaStore<typeof import('./ddb/moderation.ts').act>('sf/moderation', 'act');
export const authorOf = viaStore<typeof import('./ddb/moderation.ts').authorOf>('sf/moderation', 'authorOf');
export const hiddenFeedUrls = viaStore<typeof import('./ddb/moderation.ts').hiddenFeedUrls>('sf/moderation', 'hiddenFeedUrls');
export const recentActions = viaStore<typeof import('./ddb/moderation.ts').recentActions>('sf/moderation', 'recentActions');
export const setPublisherMark = viaStore<typeof import('./ddb/moderation.ts').setPublisherMark>('sf/moderation', 'setPublisherMark');
