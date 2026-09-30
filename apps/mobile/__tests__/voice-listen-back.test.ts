/**
 * M12 guard G-V3 (defect 6, phone walk 2026-09-30): a voice status could not be heard before
 * it was posted. After recording, the screen offers "Play it back", which plays the local
 * recording through the adapter; posting or recording again stops it.
 *
 * The break that turns it red: remove the "Play it back" button, or play something other
 * than the recording's own uri.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const screen = readFileSync(join(__dirname, '../app/voice/new.tsx'), 'utf8');

it('a finished recording can be played back before posting', () => {
  expect(screen).toMatch(/label=\{hearing \? 'Stop playing' : 'Play it back'\}[^>]*onPress=\{\(\) => hear\(phase\.uri\)\}/);
  expect(screen).toContain('listenBack.current = playVoice(uri, stopHearing)');
});

it('posting, recording again and leaving stop the playback', () => {
  expect(/const post = async \([^)]*\) => \{\s*stopHearing\(\);/.test(screen)).toBe(true);
  expect(/const start = async \(\) => \{\s*stopHearing\(\);/.test(screen)).toBe(true);
  expect(screen).toContain('useEffect(() => () => { listenBack.current?.stop();');
});
