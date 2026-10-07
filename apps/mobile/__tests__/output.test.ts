// Checks that expo-audio still has no audio-output-change event.
/**
 * Pins the T039 finding so that "expo-audio has no output-change event"
 * cannot quietly become folklore. If a future SDK adds one, this test fails
 * and the gate row is re-run. (M23 US12: the never-imported placeholder
 * `src/playback/output.ts` was deleted; the finding itself is still pinned here.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = join(__dirname, '..', '..', '..', 'node_modules', 'expo-audio', 'build');

function declarations(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...declarations(full));
    else if (entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

it('expo-audio still publishes no audio-route or output-change event', () => {
  const pattern =
    /becomingNoisy|routeChange|outputChange|headphone|bluetooth|deviceDisconnect|audioRoute|onAudioFocus/i;
  const hits = declarations(BUILD).filter((file) => pattern.test(readFileSync(file, 'utf8')));
  expect(hits).toEqual([]);
});
