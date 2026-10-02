/**
 * One legal document, full screen (owner, 2026-09-27). Opened from a link on the Terms
 * sheet and drawn inside the same overlay, so reading a document never gets anyone past
 * the sheet. Back — the button or Android's — returns to the sheet.
 *
 * Drawn over the stack, outside the root layout's bottom inset — so this pads all four edges
 * (M12). The padding comes from `useSafeAreaInsets`, not a SafeAreaView: the document opens
 * inside the Modal's ZoomIn (scale 0.9 → 1), and the native SafeAreaView measures the inset
 * from its on-screen frame, so it drew no top padding during the zoom and then jumped to the
 * full inset when the zoom ended (owner, 2026-10-03). The hook's insets are the screen's,
 * known before the first frame.
 */
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './lib/pressable';
import { ScrollView } from './lib/scroll-view';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { hit } from '../design';
import { parseLegal, titleOf, type Block, type BlockKind } from '../legal/markdown';

/**
 * Owner, 2026-09-27: plain weight for the body, looser lines (16 px type on 26 px lines),
 * and **one grey for all body text** — `**…**` spans are no longer darker (the owner:
 * "i want all same grey for the content"). Headings keep `text`.
 */
const KIND: Record<BlockKind, string> = {
  title: 'text-text text-lg font-semibold',
  heading: 'text-text text-xl font-bold leading-[30px] mt-section',
  subheading: 'text-text text-sm font-semibold leading-[26px] mt-row',
  paragraph: 'text-muted text-sm leading-[26px]',
  item: 'text-muted text-sm leading-[26px] flex-1',
  note: 'text-muted text-xs leading-[20px] italic',
  row: 'text-muted text-xs leading-[20px]',
};

/** iOS's scroll bar sits 3 pt inside the right edge by default; this puts it on the edge. */
export const EDGE = { right: -3 } as const;

/** Kept as a style: the tap target is asserted on the Pressable's own `style` elsewhere. */
const TAP = { minHeight: hit.min, minWidth: hit.min };

function Spans(props: { block: Block }): React.ReactElement {
  return <>{props.block.spans.map((s) => s.text).join('')}</>;
}

function BlockText(props: { block: Block }): React.ReactElement {
  const { block } = props;
  // A list item hangs: its bullet or number ("•", "(1)", "2.8.1") has its own column,
  // so the second and later lines start under the words, never under the marker.
  if (block.kind === 'item') {
    return (
      <Box className="flex-row mb-row">
        <Text className="text-muted text-sm leading-[26px] min-w-5 pr-2">{block.marker ?? '•'}</Text>
        <Text className={KIND.item}><Spans block={block} /></Text>
      </Box>
    );
  }
  return (
    <Text className={`${KIND[block.kind]} mb-row`} accessibilityRole={block.kind === 'heading' ? 'header' : undefined}>
      <Spans block={block} />
    </Text>
  );
}

/** A chevron drawn from two borders, so no icon font is added for one glyph. */
function Chevron(): React.ReactElement {
  return <Box className="w-3 h-3 border-l-2 border-b-2 border-text rotate-45 ml-1" />;
}

/** The "Last updated: …" / "Effective from: …" lines, lifted out of the body into two boxes. */
const DATE_LINE = /^(Last updated|Effective from):\s*(.+)$/;
const DATE_LABEL: Record<string, string> = { 'Last updated': 'Updated', 'Effective from': 'Effective' };
/** "29 September 2026" → "29 Sep 2026"; anything else is shown as written. */
const shortDate = (d: string): string => d.replace(/\b([A-Z][a-z]{2})[a-z]+\b/, '$1');

/** "1. Scope" → 1 + Scope; "Part 2 — Personal…" → 2 + Personal…; "Introduction" → no number. */
const NUMBER = /^(?:Part\s+)?(\d+)(?:\.|\s+—)\s+/;
type Entry = { index: number; number?: string; label: string };

/** How many sections the Contents card lists before "and N more". */
const CONTENTS_SHOWN = 5;

export function LegalDoc(props: { text: string; onClose: () => void }): React.ReactElement {
  const title = useMemo(() => titleOf(props.text), [props.text]);
  // The title is drawn once, above the body; the date lines become boxes under it.
  const { body, dates } = useMemo(() => {
    const all = parseLegal(props.text).filter((b) => b.kind !== 'title');
    const found: string[] = [];
    const rest = all.filter((b) => {
      const m = b.kind === 'paragraph' ? DATE_LINE.exec(b.spans.map((x) => x.text).join('')) : null;
      if (m?.[1] && m[2]) { found.push(`${DATE_LABEL[m[1]] ?? m[1]} ${shortDate(m[2])}`); return false; }
      return true;
    });
    return { body: rest, dates: found };
  }, [props.text]);
  const contents = useMemo<Entry[]>(() => body.flatMap((b, index) => {
    if (b.kind !== 'heading') return [];
    const text = b.spans.map((x) => x.text).join('');
    const n = NUMBER.exec(text);
    return [n?.[1] ? { index, number: n[1], label: text.slice(n[0].length) } : { index, label: text }];
  }), [body]);
  const [allShown, setAllShown] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const tops = useRef<Record<number, number>>({});
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right };
  const shown = allShown ? contents : contents.slice(0, CONTENTS_SHOWN);
  return (
    <Box className="absolute inset-0 bg-background" style={pad}>
      {/* Owner, 2026-09-27: the bar holds only the chevron; the title sits below it. */}
      <Box className="flex-row items-center pt-section px-2">
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Back" className="justify-center items-center" style={TAP}>
          <Chevron />
        </Pressable>
      </Box>
      {/* The ScrollView spans the full width, so its scroll bar sits on the screen's edge;
          the side margin is on the inner View, so the bar never lies over the words.
          iOS still draws its bar ~3 pt in from the edge; the owner wants it on the edge
          (2026-09-27), so the inset is pulled out by that much. Android draws it on the edge. */}
      <ScrollView ref={scroll} className="flex-1" automaticallyAdjustsScrollIndicatorInsets={false} scrollIndicatorInsets={EDGE}>
        <Box className="px-screen-x pt-2 pb-section">
          {/* Owner, 2026-10-03: the editorial layout — a large title, the dates in boxes,
              then a Contents card that jumps to each section. */}
          <Text className="text-text text-[32px] font-extrabold leading-[38px]" accessibilityRole="header">{title}</Text>
          {dates.length > 0 ? (
            <Box className="flex-row flex-wrap gap-2 mt-3">
              {dates.map((d) => (
                <Box key={d} className="px-3 py-1.5 rounded-full border-hairline border-separator bg-surface">
                  <Text className="text-text text-xs font-semibold">{d}</Text>
                </Box>
              ))}
            </Box>
          ) : null}
          {contents.length > 1 ? (
            <Box className="mt-section px-4 pt-3 pb-1 rounded-xl border-hairline border-separator bg-surface">
              <Text className="text-muted text-xs font-bold tracking-widest mb-1">CONTENTS</Text>
              {shown.map((e, i) => (
                <Pressable
                  key={e.index}
                  onPress={() => scroll.current?.scrollTo({ y: tops.current[e.index] ?? 0, animated: true })}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${e.label}`}
                  className={`flex-row items-center py-3 ${i < shown.length - 1 ? 'border-b border-hairline border-separator' : ''}`}
                  style={{ minHeight: hit.min }}
                >
                  <Text className="text-accent text-sm font-bold w-7">{e.number ?? '·'}</Text>
                  <Text className="text-text text-sm flex-1">{e.label}</Text>
                </Pressable>
              ))}
              {contents.length > CONTENTS_SHOWN ? (
                <Pressable onPress={() => setAllShown((v) => !v)} accessibilityRole="button" className="justify-center pl-7" style={{ minHeight: hit.min }}>
                  <Text className="text-muted text-xs">{allShown ? 'Show less' : `and ${contents.length - CONTENTS_SHOWN} more`}</Text>
                </Pressable>
              ) : null}
            </Box>
          ) : null}
          {body.map((b, i) => (
            b.kind === 'heading'
              ? <Box key={i} onLayout={(ev) => { tops.current[i] = ev.nativeEvent.layout.y; }}><BlockText block={b} /></Box>
              : <BlockText key={i} block={b} />
          ))}
        </Box>
      </ScrollView>
    </Box>
  );
}
