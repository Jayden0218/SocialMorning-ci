/**
 * M12 T004 (Principle IV): an error shows a way back, never a blank app. The break that turns it
 * red: remove the `ErrorBoundary` export from app/_layout.tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('the root layout exports an ErrorBoundary with a Try again button', () => {
  const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
  expect(layout).toMatch(/export function ErrorBoundary\(props: ErrorBoundaryProps\)/);
  expect(layout).toContain('props.retry()');
});
