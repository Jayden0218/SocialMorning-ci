// Tests the display helpers for time positions and short dates.
/** Display helpers. Small, but `mmss` is what the gate reads off the screen. */
import { ago, htmlToText, minutesLabel, mmss, noteParts, shortDate, timestampParts } from '@/ui/kit/format';

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

  /**
   * Phone check 2026-10-02 (Pardon My Take): ranges inside sentences were plain text. The break
   * that turns this red: drop the HMS loop in `timestampParts`.
   */
  it('makes mid-line h:mm:ss times seek points, and still leaves "John 3:16" alone', () => {
    expect(timestampParts('awesome (00:00:00-00:32:21). John 3:16 at 10:30', 3_600_000)).toEqual([
      { text: 'awesome (' },
      { text: '00:00:00', atMs: 0 },
      { text: '-' },
      { text: '00:32:21', atMs: 1_941_000 },
      { text: '). John 3:16 at 10:30' },
    ]);
    expect(timestampParts('past the end 02:00:00', 3_600_000)).toEqual([{ text: 'past the end 02:00:00' }]);
  });
});

/**
 * M12 guards G-B4 and G-S1 (B4, found on the iPhone 2026-09-29): show notes read
 * "…/buttonThere are" and "MuseumThe Button", the links could not be tapped, and a
 * space-only paragraph left a 60 pt gap. The breaks that turn these red: let only `</p>`
 * break a line again; drop the length check in `timestampParts`.
 */
describe('show notes (M12)', () => {
  const html = '<p>do so here:<a href="https://x.com/button">https://x.com/button</a></p><div>There are a few</div>'
    + '<p>LINKS:<a href="https://a.com">Busy Beaver Button Museum</a><a href="https://b.com">The Button in Question</a></p><p> </p><p>&nbsp;</p><p>Learn more</p>';

  it('G-B4: every block breaks the line, side-by-side links are split, blank paragraphs collapse', () => {
    const text = htmlToText(html);
    expect(text).not.toMatch(/buttonThere|MuseumThe/);
    expect(text).toContain('Busy Beaver Button Museum\nThe Button in Question');
    expect(text).not.toMatch(/\n\s*\n\s*\n/);
    expect(text.endsWith('Learn more')).toBe(true);
    expect(htmlToText('<div>Busy Beaver</div><div>The Button</div><li>one</li><li>two</li>')).toBe('Busy Beaver\n\nThe Button\n\n• one\n• two');
  });

  it('G-B4: links keep their target and can be tapped; bare URLs are links too', () => {
    const links = noteParts(html + '<p>more at https://podcastchoices.com/adchoices.</p>').filter((p) => p.href !== undefined);
    expect(links.map((p) => p.href)).toEqual(['https://x.com/button', 'https://a.com', 'https://b.com', 'https://podcastchoices.com/adchoices']);
    expect(links[1]!.text).toBe('Busy Beaver Button Museum');
  });

  it('G-S1: a time links only at the start of a line and inside the episode', () => {
    const parts = timestampParts('00:39 intro\n- 12:00 chapter\nJohn 3:16 said\n95:00 after the end', 60 * 60_000);
    expect(parts.filter((p) => p.atMs !== undefined).map((p) => p.text)).toEqual(['00:39', '12:00']);
  });
});
