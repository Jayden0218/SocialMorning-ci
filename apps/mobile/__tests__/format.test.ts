/** Display helpers. Small, but `mmss` is what the gate reads off the screen. */
import { ago, htmlToText, minutesLabel, mmss, shortDate, timestampParts } from '../src/ui/format';

describe('mmss', () => {
  it('formats under an hour as mm:ss', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(9_000)).toBe('0:09');
    expect(mmss(872_000)).toBe('14:32');
  });

  it('adds hours once the episode passes one', () => {
    expect(mmss(3_600_000)).toBe('1:00:00');
    expect(mmss(3_723_000)).toBe('1:02:03');
  });

  it('never renders a negative position', () => {
    expect(mmss(-5_000)).toBe('0:00');
  });
});

describe('shortDate', () => {
  it('renders a date, and nothing at all when the feed gave none', () => {
    expect(shortDate(Date.UTC(2024, 8, 10))).toBe('2024-09-10');
    expect(shortDate(undefined)).toBe('');
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes the entities a listener would otherwise read', () => {
    expect(htmlToText('<p>Tom &amp; Jerry</p><p>Second</p>')).toBe('Tom & Jerry\n\nSecond');
    expect(htmlToText('a<br>b')).toBe('a\nb');
    expect(htmlToText('&lt;tag&gt; &quot;quoted&quot; &#39;apostrophe&#39;&nbsp;x')).toBe(
      '<tag> "quoted" \'apostrophe\' x',
    );
  });

  it('is empty for an episode with no shownotes', () => {
    expect(htmlToText(undefined)).toBe('');
  });
});

describe('the episode and show pages (owner reference, 2026-09-27)', () => {
  it('writes a length in whole minutes', () => {
    expect(minutesLabel(69 * 60_000 + 10_000)).toBe('69 min');
    expect(minutesLabel(5_000)).toBe('1 min');
    expect(minutesLabel(undefined)).toBe('');
  });

  it('says how long ago for a week, then the date', () => {
    const now = Date.UTC(2026, 8, 27, 12);
    expect(ago(now - 13 * 3_600_000, now)).toBe('13 h ago');
    expect(ago(now - 3 * 86_400_000, now)).toBe('3 d ago');
    expect(ago(now - 30_000, now)).toBe('1 min ago');
    expect(ago(Date.UTC(2026, 7, 29), now)).toBe('2026-08-29');
  });

  it('turns shownotes timestamps into seek points and leaves other digits alone', () => {
    expect(timestampParts('00:39 Be humble\n1:02:03 End')).toEqual([
      { text: '00:39', atMs: 39_000 },
      { text: ' Be humble\n' },
      { text: '1:02:03', atMs: 3_723_000 },
      { text: ' End' },
    ]);
    expect(timestampParts('call 12:345 or 10:61')).toEqual([{ text: 'call 12:345 or 10:61' }]);
    expect(timestampParts('')).toEqual([]);
  });
});
