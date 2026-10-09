// Read-only wallet routes: my purchases and the tips I gave.
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { listEntitlementRows, listPurchaseRows, listTipRows } from '../../db/repos/account/purchases.ts';

/**
 * M12 FR-105/FR-106 — mounted at /v1/me. READ ONLY: what migration 007's `purchases`,
 * `entitlements` and `tips` hold for the caller. Nothing here buys anything; `storeReady`
 * stays false until M10b's store setup (constitution 2.1.0: store purchases only, each
 * verified by the server — that verification does not exist yet).
 *
 * M20 US6: the verification exists (`purchases-google.ts`). `storeReady` = Google Play is
 * connected on this server; `stores` says which store, so the iPhone keeps "not available yet"
 * (owner 2026-10-06: no Apple program, no Play account yet — both false until the env is set).
 */
export const wallet = new Hono<AuthEnv>();

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

wallet.get('/purchases', requireAuth, async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const [rows, ents] = await Promise.all([
    listPurchaseRows(db, me),
    listEntitlementRows(db, me),
  ]);
  return c.json({
    items: rows.map((r) => ({
      id: r.id, store: r.store, productId: r.product_id, status: r.status, expiresAt: iso(r.expires_at),
      amountMicros: r.amount_micros === null ? null : Number(r.amount_micros), currency: r.currency?.trim() ?? null, createdAt: iso(r.created_at),
    })),
    entitlements: ents.map((e) => ({ kind: e.kind, ref: e.ref, until: iso(e.until), ...(e.starts_at ? { startsAt: iso(e.starts_at) } : {}) })), // fix F-S: a code may start later
    storeReady: c.get('play').ready,
    stores: { google: c.get('play').ready, apple: false },
  });
});

wallet.get('/tips', requireAuth, async (c) => {
  const rows = await listTipRows(c.get('db'), c.get('listener')!.id);
  return c.json({
    items: rows.map((r) => ({
      id: r.id, feedUrl: r.to_feed_url, showTitle: r.show_title, createdAt: iso(r.created_at),
      amountMicros: r.amount_micros === null ? null : Number(r.amount_micros), currency: r.currency?.trim() ?? null,
    })),
    storeReady: c.get('play').ready,
    stores: { google: c.get('play').ready, apple: false },
  });
});
