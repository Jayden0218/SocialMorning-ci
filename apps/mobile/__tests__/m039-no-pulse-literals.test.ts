// 039: the Pulse colours (#060608, #FF4D6D, rgba(6,6,8,..)) are gone from the kit and screen parts that named them.
/**
 * The 038 palette replaced the Pulse void (#060608) and hot (#FF4D6D). These files still wrote the old values (in the notes beside their
 * gradients), so a reader could copy them back in. Each file must name the token (`void`, `hot`, `violet`, `scrimFoot`, ...) instead of the old literal.
 * The check reads the files as text: any of the three old colours, in code or in a note, in any letter case or spacing, turns it red.
 * Break to watch red: type `#060608` back into any of the files below. `assets/brand/app-icon.svg` is the brand artwork and is left alone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  'src/ui/kit/PageGlow.tsx',
  'src/ui/kit/drawn-icons.ts',
  'src/ui/discover/DiscoverGlow.tsx',
  'src/ui/discover/DiscoverMosaic.tsx',
  'src/ui/comments/Spine.tsx',
  'src/ui/status/measures.ts',
];
const OLD = [/#060608/i, /#ff4d6d/i, /rgba\(\s*6\s*,\s*6\s*,\s*8\s*[,)]/i];

describe.each(FILES)('%s', (file) => {
  const text = readFileSync(join(__dirname, '..', file), 'utf8');
  it.each(OLD.map((re) => [String(re), re] as const))('has no %s', (_n, re) => {
    expect(text).not.toMatch(re);
  });
});
