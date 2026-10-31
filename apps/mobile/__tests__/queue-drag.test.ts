// Tests that sliding a queue card sideways moves it by whole cards inside the queue.
/**
 * M12 FR-044 (rows, vertical) → M31 W3-B (design-pulse2 `queue--screen`: "Drag a card sideways to reorder"; cards 290 wide, 10 apart):
 * a slide moves a card by whole card pitches (300 pt) and never out of the queue. The pitch is the drawing's
 * `QUEUE_CARD.width + QUEUE_CARD.gap`, read from src/ui/queue/measures.ts.
 *
 * The break that turns it red: change `QUEUE_CARD.width` or `gap` in src/ui/queue/measures.ts (the pitch moves), or drop the clamp from `dragTarget`.
 */
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}) }));
import { QUEUE_CARD, QUEUE_PITCH } from '@/ui/queue/measures';
import { dragTarget } from '@/ui/queue/QueueList';

it('the pitch is the drawn card plus its gap: 290 + 10', () => {
  expect(QUEUE_CARD.width).toBe(290);
  expect(QUEUE_CARD.gap).toBe(10);
  expect(QUEUE_PITCH).toBe(300);
});

it('turns a drag distance into places, clamped to the queue', () => {
  expect(dragTarget(2, 0, 5)).toBe(2);
  expect(dragTarget(2, QUEUE_PITCH * 1.4, 5)).toBe(3);
  expect(dragTarget(2, -QUEUE_PITCH * 2.6, 5)).toBe(0);
  expect(dragTarget(2, QUEUE_PITCH * 9, 5)).toBe(4);
  expect(dragTarget(2, -QUEUE_PITCH * 0.4, 5)).toBe(2);
});
