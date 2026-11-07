// Episode notes; lines starting with a time become rows that play from there.
/**
 * M31 W3-A (T040; design-pulse2 `episode--screen`, right phone, "Notes"): the notes are plain text in the page's text colour,
 * Geist 15/23; a time that starts a line is a timestamp chip (`TimestampChip`, hot-soft, mono) beside the chapter's words and
 * the row plays from there ("Play from m:ss"); a time inside a sentence is a hot-text link; a picture is a 130 tall card
 * (radius 18) with a raise "scan" circle bottom right and opens full screen. The "Show notes" eyebrow is gone — the page names
 * the section with the edge label. Paragraph colour: the drawing's #D9D7DE is not a token; `text` (18.1 on void) is the nearest.
 */
/**
 * M17 (`Episode-B`): the episode page's show notes, laid out the Editorial way — a "Show notes"
 * eyebrow, the first paragraph as a serif lede, the rest as body text, and every line that
 * starts with a time ("00:39 Why the first hour…") as its own row: a tinted time chip and the
 * chapter's words, the whole row one 48 pt link that plays from there.
 *
 * Same parts as before (M12 FR-003/030/031, `noteParts`): links still open the browser and a
 * mid-line h:mm:ss still plays from there; only where they sit changed.
 *
 * M21 US4 (FR-031): the paragraphs are `selectable` — a long-press brings up the system's own
 * copy / look-up menu. Chapter rows stay one tap target (a press plays from the time).
 *
 * M22 US7 (FR-023–FR-025): pictures in the notes show in place at full width (`NoteImage`: drawn
 * only once it loads, so a broken one leaves nothing; a huge one is scaled down), a tap opens the
 * full-screen `PictureViewer` on that picture; web links open in the in-app browser (`openLink`).
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/kit/Text';
import { bars, hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { EPISODE } from './measures';
import type { NotePart } from '@/ui/kit/format';
import { useOpenLink } from '@/ui/kit/useOpenLink';
import { PictureViewer } from './PictureViewer';

const ROW = { minHeight: hit.min };
/** Text that is only a list bullet or an opening bracket, as `timestampParts` leaves before a time. */
const BULLET = /^[\s\-•*·–([]*$/;

export type NoteBlock =
  | { kind: 'paragraph'; parts: NotePart[] }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'chapter'; time: NotePart & { atMs: number }; rest: NotePart[] };

/** Splits the note parts into lines, then groups them: chapter rows, and paragraphs between blank lines. */
export function noteBlocks(parts: readonly NotePart[]): NoteBlock[] {
  const lines: NotePart[][] = [[]];
  for (const p of parts) {
    // M22 US7: a picture is a line of its own.
    if (p.image !== undefined) { lines.push([p], []); continue; }
    if (p.atMs !== undefined || p.href !== undefined) { lines[lines.length - 1]!.push(p); continue; }
    p.text.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece !== '') lines[lines.length - 1]!.push({ text: piece });
    });
  }
  const blocks: NoteBlock[] = [];
  let para: NotePart[] = [];
  const flush = () => {
    if (para.some((p) => p.text.trim() !== '')) blocks.push({ kind: 'paragraph', parts: para });
    para = [];
  };
  for (const line of lines) {
    const pic = line.find((p) => p.image !== undefined);
    if (pic?.image !== undefined) { flush(); blocks.push({ kind: 'image', src: pic.image, alt: pic.text }); continue; }
    if (line.every((p) => p.text.trim() === '')) { flush(); continue; }
    // A time after only a bullet or bracket ("- 00:39", "(12:05)") still starts a chapter.
    const first = line.findIndex((p) => p.atMs !== undefined || p.href !== undefined || !BULLET.test(p.text));
    const lead = first < 0 ? undefined : line[first];
    if (lead !== undefined && lead.atMs !== undefined) {
      flush();
      const rest = line.slice(first + 1);
      const head = rest[0];
      if (head && head.atMs === undefined && head.href === undefined) rest[0] = { text: head.text.replace(/^[\s\-–—:·|)\]]+/, '') };
      blocks.push({ kind: 'chapter', time: { ...lead, atMs: lead.atMs }, rest });
      continue;
    }
    if (para.length > 0) para.push({ text: '\n' });
    para.push(...line);
  }
  flush();
  return blocks;
}

function Inline(props: { parts: readonly NotePart[]; onPlayFrom: (ms: number) => void }): React.ReactElement {
  const { open } = useOpenLink();
  return (
    <>
      {props.parts.map((part, i) =>
        part.href !== undefined ? (
          <Text
            key={i}
            className="text-hotText underline"
            accessibilityRole="link"
            accessibilityLabel={`${part.text}, opens in the browser`}
            onPress={() => void open(part.href!)}
          >
            {part.text}
          </Text>
        ) : part.atMs === undefined ? part.text : (
          <Text
            key={i}
            className="text-hotText font-semibold underline"
            accessibilityRole="link"
            accessibilityLabel={`Play from ${part.text}`}
            onPress={() => props.onPlayFrom(part.atMs!)}
          >
            {part.text}
          </Text>
        ),
      )}
    </>
  );
}

/** M22 US7: one picture, a 130 tall card drawn once it has loaded; a broken one leaves nothing. A tap opens it full screen. */
function NoteImage(props: { src: string; alt: string; onOpen: () => void }): React.ReactElement | null {
  const c = useColours();
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <Pressable
      onPress={props.onOpen}
      disabled={!loaded}
      accessibilityRole="imagebutton"
      accessibilityLabel={props.alt.trim() ? `Picture: ${props.alt.trim()}. Opens full screen` : 'Picture. Opens full screen'}
      className="overflow-hidden bg-raise"
      style={loaded ? { height: EPISODE.notePicture, borderRadius: EPISODE.pictureRadius } : { height: 1, opacity: 0 }}
    >
      <Image
        source={{ uri: props.src }}
        resizeMode="cover"
        resizeMethod="resize"
        onLoad={() => setLoaded(true)}
        onError={() => setBroken(true)}
        style={{ width: '100%', height: EPISODE.notePicture }}
        accessibilityIgnoresInvertColors
      />
      {/* The drawn "scan" circle: a hint that it opens bigger (the whole card is the button). */}
      <Box className="absolute bg-raise items-center justify-center rounded-pill" style={{ right: EPISODE.deckGap, bottom: EPISODE.deckGap, width: bars.circle, height: bars.circle }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name="scan-outline" size={18} color={c.text} />
      </Box>
    </Pressable>
  );
}

/** Whether there is anything to show (the page leaves the Notes section out when there is not). */
export function hasNotes(parts: readonly NotePart[]): boolean {
  return noteBlocks(parts).length > 0;
}

export function ShowNotes(props: { parts: readonly NotePart[]; onPlayFrom: (ms: number) => void }): React.ReactElement | null {
  const [viewing, setViewing] = useState<number | undefined>();
  const blocks = noteBlocks(props.parts);
  if (blocks.length === 0) return null;
  const pictures = blocks.flatMap((b) => (b.kind === 'image' ? [b.src] : []));
  const alts = blocks.flatMap((b) => (b.kind === 'image' ? [b.alt] : []));
  return (
    <Box className="gap-row">
      {blocks.map((b, i) => {
        if (b.kind === 'image') {
          const n = pictures.indexOf(b.src);
          return <NoteImage key={i} src={b.src} alt={b.alt} onOpen={() => setViewing(n < 0 ? 0 : n)} />;
        }
        if (b.kind === 'chapter') {
          return (
            <Pressable
              key={i}
              onPress={() => props.onPlayFrom(b.time.atMs)}
              accessibilityRole="link"
              accessibilityLabel={`Play from ${b.time.text}`}
              className="flex-row items-center gap-row"
              style={ROW}
            >
              <TimestampChip text={b.time.text} />
              <Type step="body" className="flex-1 text-text" style={{ lineHeight: EPISODE.noteLine }}>
                <Inline parts={b.rest} onPlayFrom={props.onPlayFrom} />
              </Type>
            </Pressable>
          );
        }
        return (
          <Type key={i} step="body" selectable className="text-text" style={{ lineHeight: EPISODE.noteLine }}>
            <Inline parts={b.parts} onPlayFrom={props.onPlayFrom} />
          </Type>
        );
      })}
      <PictureViewer key={viewing ?? -1} images={pictures} alts={alts} index={viewing} onClose={() => setViewing(undefined)} />
    </Box>
  );
}
