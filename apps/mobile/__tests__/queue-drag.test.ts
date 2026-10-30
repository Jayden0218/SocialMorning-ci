// Tests that dragging a queue row moves it by whole rows inside the queue.
/** M12 FR-044: a drag moves a row by whole rows and never out of the queue. */
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}) }));
import { QUEUE_ROW, dragTarget } from '@/ui/queue/QueueList';

it('turns a drag distance into places, clamped to the queue', () => {
  expect(dragTarget(2, 0, 5)).toBe(2);
  expect(dragTarget(2, QUEUE_ROW * 1.4, 5)).toBe(3);
  expect(dragTarget(2, -QUEUE_ROW * 2.6, 5)).toBe(0);
  expect(dragTarget(2, QUEUE_ROW * 9, 5)).toBe(4);
});
