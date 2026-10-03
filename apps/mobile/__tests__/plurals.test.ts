/**
 * M12 guard G-B7 (B7): counted nouns go through social-core's `plural` / `noun`. The
 * 2026-09-29 comparison found "0 of 1 episodes" and "Share your 1 subscriptions", and 13
 * hand-written `n === 1 ? '' : 's'` copies, two of them missing entirely.
 *
 * The break that turns it red: write `${n} show${n === 1 ? '' : 's'}` in any screen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stickers } from '@/me/stickers';

const root = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return sources(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

it('no screen writes its own plural', () => {
  const found = [...sources('app'), ...sources('src')].filter((f) => /=== 1 \? '' : 's'|=== 2 \? '' : 's'|!== 1 \? 's' : ''/.test(readFileSync(join(root, f), 'utf8')));
  expect(found).toEqual([]);
});

it('a goal of 1 reads in the singular', () => {
  const lines = stickers({ listenedMs: 0, finished: 0, moments: 0, comments: 0 }).map((s) => s.progress);
  expect(lines).toContain('0 of 1 episode');
  expect(lines).toContain('0 of 1 moment');
  expect(lines).toContain('0 of 25 episodes');
  expect(lines.join(' ')).not.toMatch(/of 1 (episodes|moments|comments)\b/);
});
