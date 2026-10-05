// Tests picking transcript lines to share: the range, the 280-character card limit, the 60 s video limit.
/**
 * M20 US1 (spec FR-001, FR-002; research R4). Logic and the pane's picking only — the card on a
 * phone's share sheet and the link opening at the line are quickstart B1, NOT VERIFIED.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { TranscriptLine } from '@socialmorning/player-core';
import { pickableLines, QUOTE_CARD_MAX, quoteOf, toggleLine } from '@/graph/quote';
import { TranscriptPane } from '@/ui/player/TranscriptPane';

const lines: TranscriptLine[] = [
  { startMs: 10_000, endMs: 14_000, text: 'One.' },
  { startMs: 14_000, text: 'Two  words.' },
  { startMs: 20_000, endMs: 25_000, text: 'Three.' },
  { startMs: 90_000, endMs: 95_000, text: 'Far.' },
];

describe('quoteOf', () => {
  it('runs from the first line start to the last line end, in reading order, text joined', () => {
    expect(quoteOf(lines, [2, 0, 1], true)).toEqual({ startMs: 10_000, endMs: 25_000, text: 'One. Two words. Three.', tooLong: false, video: true,
      captions: [{ atMs: 10_000, text: 'One.' }, { atMs: 14_000, text: 'Two words.' }, { atMs: 20_000, text: 'Three.' }] });
  });

  it('a line with no end ends where the next one starts', () => {
    expect(quoteOf(lines, [1], true)).toMatchObject({ startMs: 14_000, endMs: 20_000 });
  });

  it('over 60 s is no video; over 280 characters is no card; nothing picked is nothing', () => {
    expect(quoteOf(lines, [0, 3], true)?.video).toBe(false);
    const long = [{ startMs: 0, endMs: 1000, text: 'x'.repeat(QUOTE_CARD_MAX + 1) }];
    expect(quoteOf(long, [0], true)?.tooLong).toBe(true);
    expect(quoteOf(lines, [], true)).toBeUndefined();
  });

  it('clamped to the episode; untimed text is picked by paragraph, links to the start, never a video', () => {
    expect(quoteOf(lines, [3], true, 92_000)).toMatchObject({ startMs: 90_000, endMs: 92_000 });
    const plain = pickableLines({ text: 'First para.\n\nSecond para.' });
    expect(plain.timed).toBe(false);
    expect(plain.lines.map((l) => l.text)).toEqual(['First para.', 'Second para.']);
    expect(quoteOf(plain.lines, [1], false)).toEqual({ text: 'Second para.', tooLong: false, video: false });
  });

  it('a tap adds a line or takes it out', () => {
    expect(toggleLine([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleLine([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe('the pane', () => {
  const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };
  const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];

  it('long-press starts picking, taps add lines without seeking, Share sends the quote', () => {
    const seeks: number[] = []; const shared: unknown[] = [];
    const r = render(createElement(TranscriptPane, { transcript: { lines }, positionMs: 0, onSeek: (ms: number) => void seeks.push(ms), onShareImage: (q: unknown) => void shared.push(q) }));
    const row = (i: number) => r.root.findAll((n) => n.props['testID'] === `transcript-line-${i}` && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { row(0).props['onPress'](); });
    expect(seeks).toEqual([10_000]);
    act(() => { row(0).props['onLongPress'](); });
    act(() => { row(2).props['onPress'](); });
    expect(seeks).toEqual([10_000]);
    act(() => { byLabel(r, 'Share the picked lines as an image')!.props['onPress'](); });
    expect(shared).toEqual([{ startMs: 10_000, endMs: 25_000, text: 'One. Three.', tooLong: false, video: true, captions: [{ atMs: 10_000, text: 'One.' }, { atMs: 20_000, text: 'Three.' }] }]);
    act(() => { r.unmount(); });
  });

  it('W2: Video sends the quote with its captions; over 60 s it is disabled and the bar says why', () => {
    const videos: unknown[] = [];
    const r = render(createElement(TranscriptPane, { transcript: { lines }, positionMs: 0, onSeek: () => undefined, onShareImage: () => undefined, onShareVideo: (q: unknown) => void videos.push(q) }));
    const row = (i: number) => r.root.findAll((n) => n.props['testID'] === `transcript-line-${i}` && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { row(0).props['onLongPress'](); });
    act(() => { row(3).props['onPress'](); });
    const video = () => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Share the picked lines as a video' && typeof n.props['onPress'] === 'function')[0]!;
    expect(video().props['disabled']).toBe(true);
    const words = r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);
    expect(words).toContain('Videos are 60 s or less');
    act(() => { row(3).props['onPress'](); });
    act(() => { video().props['onPress'](); });
    expect(videos).toEqual([expect.objectContaining({ startMs: 10_000, endMs: 14_000, captions: [{ atMs: 10_000, text: 'One.' }] })]);
    act(() => { r.unmount(); });
  });

  it('without onShareImage there is no picking', () => {
    const r = render(createElement(TranscriptPane, { transcript: { lines }, positionMs: 0, onSeek: () => undefined }));
    act(() => { r.root.findAll((n) => n.props['testID'] === 'transcript-line-0' && typeof n.props['onLongPress'] === 'function')[0]?.props['onLongPress'](); });
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Cancel picking lines')).toHaveLength(0);
    act(() => { r.unmount(); });
  });
});
