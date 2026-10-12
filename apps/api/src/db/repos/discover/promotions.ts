// Launch-screen promotions: store, schedule, count views and taps as totals only.
/**
 * M15 T020 — the owner's launch-screen promotions (constitution v2.4.0; FR-013–FR-017).
 *
 * Nothing here knows who saw a promotion: the table has no listener and no IP column, and an
 * event only adds 1 to a total (FR-017, guard G-L2). Images are counted against a 50 MB ceiling
 * over every promotion that is not retired and not over (G-L3).
 */
import { viaStore } from '../../backend.ts';

export type PromotionState = 'draft' | 'live' | 'ended' | 'retired';
export type Promotion = {
  id: string; imageUrl: string; imagePath: string; imageBytes: number; targetKind: 'route' | 'url'; target: string; label: string;
  startsAt: string; endsAt: string; weight: number; dailyCap: number; impressions: number; taps: number; state: PromotionState; createdAt: string;
};
export type PromotionInput = {
  imageUrl: string; imagePath: string; imageBytes: number; targetKind: 'route' | 'url'; target: string; label: string;
  startsAt: string; endsAt: string; weight: number; dailyCap: number;
};

export function stateOf(r: { retired_at: unknown; starts_at: Date | string; ends_at: Date | string }, now = Date.now()): PromotionState {
  if (r.retired_at !== null && r.retired_at !== undefined) return 'retired';
  if (now < new Date(r.starts_at).getTime()) return 'draft';
  if (now >= new Date(r.ends_at).getTime()) return 'ended';
  return 'live';
}

// Each runs its DynamoDB body (ddb/promotions.ts) on the Store the Db carries (db/backend.ts).
export const listPromotions = viaStore<typeof import('./ddb/promotions.ts').listPromotions>('dv/promotions', 'listPromotions');
export const getPromotion = viaStore<typeof import('./ddb/promotions.ts').getPromotion>('dv/promotions', 'getPromotion');
export const livePromotions = viaStore<typeof import('./ddb/promotions.ts').livePromotions>('dv/promotions', 'livePromotions');
export const launchBytes = viaStore<typeof import('./ddb/promotions.ts').launchBytes>('dv/promotions', 'launchBytes');
export const createPromotion = viaStore<typeof import('./ddb/promotions.ts').createPromotion>('dv/promotions', 'createPromotion');
export const updatePromotion = viaStore<typeof import('./ddb/promotions.ts').updatePromotion>('dv/promotions', 'updatePromotion');
export const countEvent = viaStore<typeof import('./ddb/promotions.ts').countEvent>('dv/promotions', 'countEvent');
