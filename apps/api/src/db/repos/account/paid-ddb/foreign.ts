// What the paid lane reads from lane ST (hosted shows, show overrides) — through lane ST's repo since it moved.
/**
 * M26 lane PD; switched by lane ST (2026-10-11): the hosted show and the override are lane ST's DynamoDB items, read with
 * its repo functions (`db` carries the Store, so each runs its DynamoDB body). No SQL is left here.
 */
import type { Db } from '../../../db.ts';
import { hostedByFeed } from '../../studio/hosted.ts';
import { getOverrides } from '../../studio/show-overrides.ts';

/** PD-03: a live hosted show's price level (undefined: no such live show). */
export async function hostedPriceTier(db: Db, feedUrl: string): Promise<{ price_tier: number | null } | undefined> {
  const show = await hostedByFeed(db, feedUrl);
  return show ? { price_tier: show.priceTier } : undefined;
}

/** PD-04: whether the show takes tips. */
export async function tipsEnabled(db: Db, feedUrl: string): Promise<boolean> {
  return Boolean((await getOverrides(db, feedUrl))?.tipsEnabled);
}

/** PD-24: the parts of a gift's show card that ST owns (override title; live hosted show's title and cover). */
export async function showCardParts(db: Db, feedUrl: string): Promise<{ overrideTitle: string | null; hostedTitle: string | null; hostedCover: string | null }> {
  const [o, h] = await Promise.all([getOverrides(db, feedUrl), hostedByFeed(db, feedUrl)]);
  return { overrideTitle: o?.title ?? null, hostedTitle: h?.title ?? null, hostedCover: h?.coverUrl ?? null };
}
