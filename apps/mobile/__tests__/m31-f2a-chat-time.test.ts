// F2a: the Chat list's times read 2m / 1h / Yesterday / Mon (design-pulse2 chat--screen); the shared ago() is untouched.
// Break: make chatTime return ago() (src/discover/sections.ts) — the first test turns red.
import { chatTime } from '@/ui/chat/chat-time';
import { ago } from '@/discover/sections';

const NOW = new Date(2026, 9, 28, 14, 0, 0).getTime(); // Wed 28 Oct 2026, local time
const at = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const H = 3_600_000;

describe('chatTime', () => {
  it('the drawn four: 2m, 1h, Yesterday, Mon', () => {
    expect(chatTime(at(2 * MIN), NOW)).toBe('2m');
    expect(chatTime(at(H + 5 * MIN), NOW)).toBe('1h');
    expect(chatTime(new Date(2026, 9, 27, 9, 0).toISOString(), NOW)).toBe('Yesterday');
    expect(chatTime(new Date(2026, 9, 26, 9, 0).toISOString(), NOW)).toBe('Mon');
  });
  it('under a minute is now; under a day counts hours even across midnight', () => {
    expect(chatTime(at(20_000), NOW)).toBe('now');
    expect(chatTime(at(59 * MIN), NOW)).toBe('59m');
    expect(chatTime(at(15 * H), NOW)).toBe('15h');
  });
  it('a week or more is the date; another year adds the year', () => {
    expect(chatTime(new Date(2026, 9, 12, 9, 0).toISOString(), NOW)).toBe('12 Oct');
    expect(chatTime(new Date(2025, 11, 31, 9, 0).toISOString(), NOW)).toBe('31 Dec 2025');
  });
  it('an unreadable time is empty, and the shared ago() keeps its words for the other pages', () => {
    expect(chatTime('nope', NOW)).toBe('');
    expect(ago(at(2 * H), NOW)).toBe('2 h ago');
  });
});
