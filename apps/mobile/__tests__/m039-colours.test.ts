// 039 T024: row M of the palette drawing (design/M-Palette.dc.html): grey base, one muted accent, neutral avatars.
/**
 * Pins the M values for the default theme and measures contrast (WCAG 2.x, 4.5:1) for every text colour on base / raised /
 * overlay, the accent words on base and raised, and the base-coloured words on every accent fill, for every accent theme.
 * Red on the Pulse values (`#060608` etc.); the break that turns it red again: lower `text2` to `#6b7280` or set a theme's
 * accent to a dark tone.
 */
import { ACCENTS, colour } from '@/design';
import { AVATAR_TONES } from '@/ui/kit/Avatar';
import { BODY_MIN, contrastRatio, over } from '@/design/contrast';

it('the default theme takes the M values', () => {
  expect(colour.void).toBe('#111318');
  expect(colour.raise).toBe('#1a1d23');
  expect(colour.raise2).toBe('#22262e');
  expect(colour.line).toBe('#2c313a');
  expect(colour.text).toBe('#eceef2');
  expect(colour.text2).toBe('#9aa1ad');
  expect(colour.hot).toBe('#f2867e');
  expect(colour.hotSoft).toBe('rgba(242,134,126,0.14)');
  expect(colour.onPrimary).toBe(colour.void);
});

const surfaces = { base: colour.void, raised: colour.raise, overlay: colour.raise2 } as const;
describe.each(Object.entries(surfaces))('on %s', (_n, bg) => {
  it.each(['text', 'text2', 'text3'] as const)('%s reaches 4.5:1', (k) => {
    expect(contrastRatio(colour[k], bg)).toBeGreaterThanOrEqual(BODY_MIN);
  });
});

describe.each(Object.entries(ACCENTS))('accent theme %s', (_name, t) => {
  it('its words reach 4.5:1 on base and raised', () => {
    expect(contrastRatio(t.light.accent, colour.void)).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(t.light.accent, colour.raise)).toBeGreaterThanOrEqual(BODY_MIN);
  });
  it('base-coloured words on its fill reach 4.5:1', () => {
    expect(contrastRatio(colour.void, t.light.primary)).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(t.light.onPrimary, t.light.primary)).toBeGreaterThanOrEqual(BODY_MIN);
  });
  it('its words on its own tint over base reach 4.5:1', () => {
    expect(contrastRatio(t.light.accent, over(t.light.accentTint, colour.void))).toBeGreaterThanOrEqual(BODY_MIN);
  });
});

it('hotText reaches 4.5:1 on base and raised; void on hot reaches 4.5:1', () => {
  expect(contrastRatio(colour.hotText, colour.void)).toBeGreaterThanOrEqual(BODY_MIN);
  expect(contrastRatio(colour.hotText, colour.raise)).toBeGreaterThanOrEqual(BODY_MIN);
  expect(contrastRatio(colour.void, colour.hot)).toBeGreaterThanOrEqual(BODY_MIN);
});

it('avatars are neutral: one disc colour (line) for every name, the letter is text', () => {
  expect(AVATAR_TONES.map((t) => t.fill)).toEqual([colour.line]);
  expect(AVATAR_TONES.every((t) => t.ink === 'text')).toBe(true);
  expect(contrastRatio(colour.text, colour.line)).toBeGreaterThanOrEqual(BODY_MIN);
});
