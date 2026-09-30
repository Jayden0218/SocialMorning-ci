/**
 * M12 guard G-C4 (found by the simulator journey and on the iPhone, 2026-09-30): fast typing in
 * the comment box lost letters ("iPhne", "herd") and moved them to the end ("Mao: heard it on
 * the simulatores"). Two causes: a synchronous draft save on every key, and a controlled input
 * whose written-back value moved the cursor. The box is now uncontrolled and the draft is saved
 * after typing stops.
 *
 * The break that turns it red: put `value={state.body}` back, or save the draft in onChangeText.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const composer = readFileSync(join(__dirname, '../src/ui/Composer.tsx'), 'utf8');
const input = /<TextareaInput[\s\S]*?\/>/.exec(composer)?.[0] ?? '';

it('the comment box keeps its own text (uncontrolled)', () => {
  expect(input).not.toBe('');
  expect(input).not.toMatch(/^\s*value=\{/m);   // a real prop, not the comment that explains it
  expect(input).toContain('defaultValue={props.initial.body}');
});

it('typing does not save the draft on every key; it is saved after a pause', () => {
  const onChange = /onChangeText=\{([\s\S]*?)\}\n/.exec(input)?.[1] ?? '';
  expect(onChange).not.toBe('');
  expect(onChange).not.toContain('composer.edit');
  expect(composer).toMatch(/setTimeout\(\(\) => \{ if \(unsaved\.current\) \{ composer\.edit\(/);
});
