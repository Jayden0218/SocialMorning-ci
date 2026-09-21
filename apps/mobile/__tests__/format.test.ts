/** Display helpers. Small, but `mmss` is what the gate reads off the screen. */
import { htmlToText, mmss, shortDate } from '../src/ui/format';

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
