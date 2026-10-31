import assert from 'node:assert/strict';
import test from 'node:test';
import { HOOK_FILE, findMotion } from './reduce-motion-check.mjs';

const f = (file, text) => ({ file, text });
const HOOK = "import { useReducedMotion } from '@/ui/kit/useReducedMotion';";

test('a clean tree has no findings', () => {
  assert.deepEqual(findMotion([
    f('app/a.tsx', "import { Box } from '@/ui/lib/box';"),
    f('src/b.tsx', `${HOOK}\nconst r = useReducedMotion();\nAnimated.timing(v, { toValue: 1 }).start();`),
  ]), []);
});

test('asking AccessibilityInfo directly is refused, anywhere but the hook', () => {
  const r = findMotion([f('app/scan.tsx', 'void AccessibilityInfo.isReduceMotionEnabled().then(set);'), f(HOOK_FILE, 'AccessibilityInfo.isReduceMotionEnabled()')]);
  assert.equal(r.length, 1);
  assert.match(r[0], /^app\/scan\.tsx:1 asks AccessibilityInfo/);
});

test('starting an animation in a file that does not use the hook is refused, whichever way it starts', () => {
  for (const line of ['Animated.timing(v, {}).start()', 'Animated.spring(v, {}).start()', 'x.value = withTiming(1)', 'x.value = withSpring(1)', 'withRepeat(a, -1)', 'x.value = withDecay({ velocity: 1 })', 'LayoutAnimation.configureNext(p)', 'entering={ZoomIn.duration(200)}']) {
    const r = findMotion([f('src/ui/x.tsx', `const a = 1;\n${line}`)]);
    assert.equal(r.length, 1, line);
    assert.match(r[0], /^src\/ui\/x\.tsx:2 starts an animation/);
  }
});

test('comments, tests and the hook file are not findings; a hook mentioned only in a comment does not count', () => {
  assert.deepEqual(findMotion([f('src/a.tsx', '// Animated.timing(v, {})\n * withTiming(1)')]), []);
  assert.deepEqual(findMotion([f('src/__tests__/a.test.tsx', 'Animated.timing(v, {})')]), []);
  assert.equal(findMotion([f('src/a.tsx', '// uses useReducedMotion\nAnimated.timing(v, {}).start();')]).length, 1);
});

test('the real tree is clean', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [new URL('./reduce-motion-check.mjs', import.meta.url).pathname], { stdio: 'pipe' });
});
