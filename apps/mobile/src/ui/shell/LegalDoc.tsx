// Shows one full legal document, with contents, over the terms page.
/**
 * One legal document, full screen (owner, 2026-09-27). Opened from a link on the Terms
 * sheet and drawn inside the same overlay, so reading a document never gets anyone past
 * the sheet. Back — the button or Android's — returns to the sheet.
 *
 * Drawn over the stack, outside the root layout's bottom inset, so it pads the home strip itself (`OverlayPage` `inset`); the
 * top padding comes from the safe-area context, known before the first frame (owner, 2026-10-03: no jump during the modal's zoom).
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `legalPage`, entries `terms--full-document`, `auth-sign-in--legal-document`, layout
 * Panel): no glow; the content is the eyebrow "SocialNet · legal" (mono 12, hot-text), the document's title in Unbounded 800 28,
 * the dates in mono 12 on two lines, a Contents tile (radius 22) with a hot number and the name of every part — each a jump —
 * and the text in Geist 15 on 26 in text-2 under it. The bar is low: Back (a 44 circle) and a short title ("Service
 * Agreement", `name`) with the "Last updated" date under it. Every Contents row stays (B showed five and "and 3 more"; each row is
 * a jump, so none is hidden). The Contents rows are 48 tall (the drawn 29 is under the touch floor).
 */
import { useContext, useMemo, useRef, type ComponentRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { gutter, hit, spacing } from '@/design';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { Type } from '@/ui/kit/Type';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { parseLegal, titleOf, type Block } from '@/legal/markdown';

/** Kept as a style: the tap target is asserted on the Pressable's own `style` elsewhere. */
const ROW = { minHeight: hit.min };

function Spans(props: { block: Block }): string {
  return props.block.spans.map((s) => s.text).join('');
}

/** One block of the text: a heading, a hanging list item, a note or a paragraph (Geist 15 on 26 in text-2, one grey for all of it). */
function BlockText(props: { block: Block }): React.ReactElement {
  const { block } = props;
  const text = Spans({ block });
  // A list item hangs: its bullet or number ("•", "(1)", "2.8.1") has its own column,
  // so the second and later lines start under the words, never under the marker.
  if (block.kind === 'item') {
    return (
      <Box className="flex-row" style={{ gap: spacing.gap }}>
        <Type step="body" className="text-text2 font-normal" style={{ ...AUTH_TYPE.legalBody, minWidth: spacing.block }}>{block.marker ?? '•'}</Type>
        <Type step="body" className="text-text2 font-normal flex-1" style={AUTH_TYPE.legalBody}>{text}</Type>
      </Box>
    );
  }
  if (block.kind === 'heading') return <Type step="heading" className="text-text" accessibilityRole="header" style={{ marginTop: spacing.section }}>{text}</Type>;
  if (block.kind === 'subheading') return <Type step="row" className="text-text" style={{ marginTop: spacing.gap }}>{text}</Type>;
  if (block.kind === 'note') return <Type step="caption" className="text-text2 italic">{text}</Type>;
  if (block.kind === 'row') return <Type step="caption" className="text-text2">{text}</Type>;
  return <Type step="body" className="text-text2 font-normal" style={AUTH_TYPE.legalBody}>{text}</Type>;
}

/** The "Last updated: …" / "Effective from: …" lines, lifted out of the body and shown under the title, one per row. */
const DATE_LINE = /^(Last updated|Effective from):\s*(.+)$/;

/** "1. Scope" → 1 + Scope; "Part 2 — Personal…" → 2 + Personal…; an unnumbered heading shows its place in the list. */
const NUMBER = /^(?:Part\s+)?(\d+)(?:\.|\s+—)\s+/;
type Entry = { index: number; number?: string; label: string };

/** `name` is the short title on the bar ("Service Agreement"); left out, the document's own title without "SocialNet ". */
export function LegalDoc(props: { text: string; onClose: () => void; name?: string }): React.ReactElement {
  // Owner, 2026-10-03: "Privacy Policy", not "SocialNet Privacy Policy".
  const title = useMemo(() => titleOf(props.text).replace(/^SocialNet\s+/, ''), [props.text]);
  // The title is drawn once, above the body; the date lines become mono lines under it.
  const { body, dates } = useMemo(() => {
    const all = parseLegal(props.text).filter((b) => b.kind !== 'title');
    const found: string[] = [];
    const rest = all.filter((b) => {
      const m = b.kind === 'paragraph' ? DATE_LINE.exec(b.spans.map((x) => x.text).join('')) : null;
      if (m?.[1] && m[2]) { found.push(`${m[1]}: ${m[2]}`); return false; }
      return true;
    });
    // M31 F8 (wave-5 defect 10; the drawing): the lead-in paragraphs stay plain text under the Contents tile — no "Introduction" heading, no "0" row.
    return { body: rest, dates: found };
  }, [props.text]);
  const contents = useMemo<Entry[]>(() => body.flatMap((b, index) => {
    if (b.kind !== 'heading') return [];
    const text = b.spans.map((x) => x.text).join('');
    const n = NUMBER.exec(text);
    return [n?.[1] ? { index, number: n[1], label: text.slice(n[0].length) } : { index, label: text }];
  }), [body]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const tops = useRef<Record<number, number>>({});
  const bodyAt = useRef(0);
  const { width } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <Box className="absolute inset-0 bg-void">
      <OverlayPage title={props.name ?? title} {...(dates[0] ? { subtitle: dates[0] } : {})} size={AUTH_TYPE.cardTitle.fontSize} onBack={props.onClose} tone="none" inset={insets?.bottom ?? 0}>
        {(l) => (
          <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ paddingTop: l.top + AUTH.bodyTop, paddingBottom: l.reserve, paddingHorizontal: gutter(width) }}>
            <Box style={{ gap: AUTH.bodyGap }}>
              <Type step="mono" className="text-hotText" style={AUTH_TYPE.eyebrow}>SocialNet · legal</Type>
              <Type step="hero" className="text-text" style={AUTH_TYPE.sheetTitle} accessibilityRole="header">{title}</Type>
              <Box>{dates.map((d) => <Type key={d} step="mono" className="text-text2">{d}</Type>)}</Box>
              {contents.length > 1 ? (
                <Box className="bg-raise" style={{ borderRadius: AUTH.tile.radius, padding: AUTH.tile.pad }}>
                  <Type step="mono" className="text-text3" style={AUTH_TYPE.fieldLabel}>Contents</Type>
                  {contents.map((e) => (
                    <Pressable
                      key={e.index}
                      onPress={() => scroll.current?.scrollTo({ y: Math.max(0, l.top + AUTH.bodyTop + bodyAt.current + (tops.current[e.index] ?? 0)), animated: true })}
                      accessibilityRole="button"
                      accessibilityLabel={`Go to ${e.label}`}
                      className="flex-row items-center"
                      style={{ ...ROW, gap: spacing.row }}
                    >
                      <Type step="body" className="text-hotText font-bold" style={{ ...AUTH_TYPE.contentsNumber, width: spacing.section + 2 }}>{e.number ?? String(contents.indexOf(e) + 1)}</Type>
                      <Type step="note" className="text-text flex-1">{e.label}</Type>
                    </Pressable>
                  ))}
                </Box>
              ) : null}
              <Box style={{ gap: spacing.row }} onLayout={(ev) => { bodyAt.current = ev.nativeEvent.layout.y; }}>
                {body.map((b, i) => (
                  b.kind === 'heading'
                    ? <Box key={i} onLayout={(ev) => { tops.current[i] = ev.nativeEvent.layout.y; }}><BlockText block={b} /></Box>
                    : <BlockText key={i} block={b} />
                ))}
              </Box>
            </Box>
          </ScrollView>
        )}
      </OverlayPage>
    </Box>
  );
}
