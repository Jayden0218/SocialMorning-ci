// Serves the made-for-you show cover PNG named by its address.
/**
 * Owner, 2026-10-04 — GET /covers/auto/v1/<colour>[-<hex>…].png: the tile a Studio show gets when
 * its owner uploads no cover. The address names everything drawn (colour and letters), so it reads
 * no database and the same address is always the same picture: cached for a year by anyone (5 minutes if a
 * font for its letters could not be fetched, so a tile without its letters does not stick). A name
 * `autoCoverUrl` could not have made is a 404.
 */
import { Hono } from 'hono';
import { parseAutoCover } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { renderCover } from '../../share/cover.ts';

export const covers = new Hono<AuthEnv>();

covers.get('/auto/v1/:file', async (c) => {
  const tile = parseAutoCover(c.req.param('file'));
  if (!tile) return c.text('Not found', 404);
  const { png, whole } = await renderCover(tile.tone, tile.letters, c.get('imageFetch'));
  const cache = whole ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  return c.body(png as unknown as ArrayBuffer, 200, { 'content-type': 'image/png', 'cache-control': cache });
});
