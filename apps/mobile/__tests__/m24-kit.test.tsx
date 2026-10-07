// Checks the M24 shared look: paper sheets, app fonts on buttons and fields, the back arrow, tabs, switch, avatar, covers.
/**
 * M24 US18 (lane B1): the shared parts that fix many screens at once. Each block names the break
 * that turns it red.
 */
import { createElement as h } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour, hit } from '@/design';
import { loadFonts, resetFontsForTest } from '@/design/fonts';
import { coverTone } from '@socialmorning/social-core';
import { sheetClass } from '@/ui/lib/actionsheet';
import { Button, ButtonText } from '@/ui/lib/button';
import { Heading } from '@/ui/lib/heading';
import { Input, InputField } from '@/ui/lib/input';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Artwork, cornerFor, thumbUrl } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Segmented } from '@/ui/kit/Segmented';
import { Toggle } from '@/ui/kit/Toggle';
import { TopBar } from '@/ui/kit/TopBar';

const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string');
const rgb = (v: unknown): string => {
  const s = String(v);
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) { const n = parseInt(hex[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
  return (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).join(',');
};

describe('sheets (break: drop sheetClass from ActionsheetContent)', () => {
  it('a caller\'s old white / 16 pt look is dropped; its layout classes stay', () => {
    expect(sheetClass('bg-surface rounded-t-row px-screen-x pt-row max-h-[90%] items-stretch')).toBe('px-screen-x pt-row max-h-[90%] items-stretch');
    expect(sheetClass('bg-background rounded-t-artwork-lg px-screen-x pt-gap')).toBe('px-screen-x pt-gap');
    expect(sheetClass(undefined)).toBe('');
  });
});

describe('app faces on words that are not Text (break: ButtonText back on react-native Text)', () => {
  beforeAll(async () => { await loadFonts(async () => undefined, 1000); });
  afterAll(() => resetFontsForTest());
  const family = (r: ReactTestRenderer, pick: (n: ReactTestInstance) => boolean): unknown =>
    flat(hosts(r).find(pick)?.props['style'])['fontFamily'];

  it('a button label is Manrope at its weight', () => {
    const r = render(h(Button, null, h(ButtonText, { className: 'text-onPrimary font-bold' }, 'Play')));
    expect(family(r, (n) => n.props['children'] === 'Play')).toBe('Manrope-Bold');
  });
  it('text fields are Manrope, or Lora when they ask for the display face', () => {
    const a = render(h(Input, null, h(InputField, { accessibilityLabel: 'Email' })));
    expect(family(a, (n) => n.props['aria-label'] === 'Email')).toBe('Manrope-Regular');
    const b = render(h(Textarea, null, h(TextareaInput, { accessibilityLabel: 'Note', className: 'text-text font-display-semibold' })));
    expect(family(b, (n) => n.props['aria-label'] === 'Note')).toBe('Lora-SemiBold');
  });
  it('a heading is the serif unless it names a weight', () => {
    expect(family(render(h(Heading, { className: 'text-text text-display font-display' }, 'Report')), (n) => n.props['children'] === 'Report')).toBe('Lora-Bold');
    expect(family(render(h(Heading, { className: 'text-text text-base font-bold' }, 'Sign out?')), (n) => n.props['children'] === 'Sign out?')).toBe('Manrope-Bold');
  });
});

it('the back button is the 22 pt arrow, still a named 48 pt button (break: the 10 pt chevron)', () => {
  const r = render(h(TopBar, { onBack: () => undefined }));
  const back = hosts(r).find((n) => n.props['accessibilityLabel'] === 'Back')!;
  expect(Number(flat(back.props['style'])['minHeight'])).toBeGreaterThanOrEqual(hit.min);
  const arrow = r.root.findAll((n) => n.props['name'] === 'arrow-back');
  expect(arrow.length).toBeGreaterThan(0);
  expect(arrow[0]!.props['size']).toBe(22);
});

describe('Segmented (break: the white bordered track, or drop the dark tone)', () => {
  const items = [{ value: 'a', label: 'All' }, { value: 'b', label: 'Only finished' }] as const;
  const tabs = (r: ReactTestRenderer) => hosts(r).filter((n) => n.props['accessibilityRole'] === 'tab');
  it('beige track, yellow choice, one-line 13 pt words, a 48 pt tap', () => {
    const r = render(h(Segmented<'a' | 'b'>, { items, value: 'a', onChange: () => undefined }));
    const track = hosts(r).find((n) => n.props['accessibilityRole'] === 'tablist')!;
    expect(rgb(flat(track.props['style'])['backgroundColor'])).toBe(rgb(colour.segment));
    const [on] = tabs(r);
    expect(rgb(flat(on!.props['style'])['backgroundColor'])).toBe(rgb(colour.primary));
    const s = flat(on!.props['style']);
    const slop = on!.props['hitSlop'] as { top: number; bottom: number };
    expect(Number(s['minHeight']) + slop.top + slop.bottom).toBeGreaterThanOrEqual(hit.min);
    const words = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'Only finished')[0]!;
    expect(words.props['numberOfLines']).toBe(1);
    expect(flat(words.props['style'])['fontSize']).toBe(13);
  });
  it('tone dark: the chosen tab is dark with paper words', () => {
    const r = render(h(Segmented<'a' | 'b'>, { items, value: 'b', onChange: () => undefined, tone: 'dark' }));
    const on = tabs(r)[1]!;
    expect(rgb(flat(on.props['style'])['backgroundColor'])).toBe(rgb(colour.text));
    const words = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'Only finished')[0]!;
    expect(rgb(flat(words.props['style'])['color'])).toBe(rgb(colour.background));
  });
});

it('an off switch has a visible track and a white thumb with a shadow (break: bg-separator)', () => {
  const r = render(h(Toggle, { value: false, onChange: () => undefined, label: 'Autoplay' }));
  const all = hosts(r).map((n) => flat(n.props['style']));
  expect(all.some((s) => rgb(s['backgroundColor']) === rgb(colour.switchOff))).toBe(true);
  expect(all.some((s) => s['shadowOpacity'] === 0.18)).toBe(true);
});

it('a person is a flat circle with one letter on their own colour (break: back to the cover tile)', () => {
  const r = render(h(Avatar, { name: 'Mira Okafor', size: 56 }));
  const json = JSON.stringify(r.toJSON());
  expect(json).toContain('"M"');
  expect(json).not.toContain('"MO"');
  expect(flat(hosts(r)[0]!.props['style'])['backgroundColor']).toBe(coverTone('Mira Okafor').fill);
});

describe('covers', () => {
  it('corners follow the size, as the B designs draw them', () => {
    expect([40, 56, 64, 72, 110, 148, 196].map(cornerFor)).toEqual([10, 12, 12, 14, 14, 16, 18]);
    const r = render(h(Artwork, { size: 56, name: 'Late Walks' }));
    expect(flat(hosts(r)[0]!.props['style'])['borderRadius']).toBe(12);
  });

  it('asks the resizing CDNs for a picture near the drawn size; other addresses are untouched', () => {
    const imgix = 'https://megaphone.imgix.net/podcasts/x/image/a.jpg?ixlib=rails-4.3.1&max-w=3000&max-h=3000&fit=crop&auto=format,compress';
    expect(thumbUrl(imgix, 56)).toBe(`${imgix}&w=200&h=200`);
    expect(thumbUrl('https://a.imgix.net/b.jpg', 150)).toBe('https://a.imgix.net/b.jpg?w=600&h=600');
    expect(thumbUrl('https://a.imgix.net/b.jpg?w=100', 56)).toBe('https://a.imgix.net/b.jpg?w=100');
    const apple = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/6c/mza_1.jpeg/3000x3000bb.jpg';
    expect(thumbUrl(apple, 72)).toBe('https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/6c/mza_1.jpeg/300x300bb.jpg');
    expect(thumbUrl(apple.replace('3000x3000', '600x600'), 300)).toBe(apple.replace('3000x3000', '600x600'));
    expect(thumbUrl('https://img/a.png', 56)).toBe('https://img/a.png');
  });

  it('the image is drawn at once — no JS fade gates it (break: wrap it in an opacity-0 view again)', () => {
    const r = render(h(Artwork, { url: 'https://img/a.png', size: 56, name: 'Late Walks' }));
    const img = hosts(r).find((n) => JSON.stringify(n.props['source'] ?? '').includes('https://img/a.png'))!;
    expect(img).toBeDefined();
    for (let n: ReactTestInstance | null = img; n; n = n.parent) {
      if (typeof n.type === 'string') expect(flat(n.props['style'])['opacity']).not.toBe(0);
    }
  });
});
