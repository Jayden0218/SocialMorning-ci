// Episode notes; lines starting with a time become rows that play from there.
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
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import type { NotePart } from '@/ui/kit/format';
import { openLink } from '@/ui/kit/openLink';
import { PictureViewer } from './PictureViewer';

const ROW = { minHeight: hit.min };
/** A first paragraph longer than this reads as body text, not a lede. */
const LEDE_MAX = 320;
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
  return (
    <>
      {props.parts.map((part, i) =>
        part.href !== undefined ? (
          <Text
            key={i}
            className="text-accent underline"
            accessibilityRole="link"
            accessibilityLabel={`${part.text}, opens in the browser`}
            onPress={() => void openLink(part.href!)}
          >
            {part.text}
          </Text>
        ) : part.atMs === undefined ? part.text : (
          <Text
            key={i}
            className="text-accent font-semibold underline"
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

/** M22 US7: one picture at the column's full width, drawn once it has loaded; a broken one leaves nothing. */
function NoteImage(props: { src: string; alt: string; onOpen: () => void }): React.ReactElement | null {
  const { width } = useWindowDimensions();
  const [ratio, setRatio] = useState<number | undefined>();
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <Pressable
      onPress={props.onOpen}
      disabled={ratio === undefined}
      accessibilityRole="imagebutton"
      accessibilityLabel={props.alt.trim() ? `Picture: ${props.alt.trim()}. Opens full screen` : 'Picture. Opens full screen'}
      className="mb-row rounded-row overflow-hidden"
      style={ratio === undefined ? { height: 1, opacity: 0 } : undefined}
    >
      <Image
        source={{ uri: props.src }}
        resizeMode="cover"
        resizeMethod="resize"
        onLoad={(e) => { const s = e.nativeEvent.source; if (s && s.width > 0 && s.height > 0) setRatio(s.width / s.height); }}
        onError={() => setBroken(true)}
        style={{ width: '100%', aspectRatio: ratio ?? 1, maxHeight: width * 2 }}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

export function ShowNotes(props: { parts: readonly NotePart[]; onPlayFrom: (ms: number) => void }): React.ReactElement | null {
  const [viewing, setViewing] = useState<number | undefined>();
  const blocks = noteBlocks(props.parts);
  if (blocks.length === 0) return null;
  const firstPara = blocks.findIndex((b) => b.kind === 'paragraph');
  const pictures = blocks.flatMap((b) => (b.kind === 'image' ? [b.src] : []));
  return (
    <Box className="mt-section">
      <Eyebrow>Show notes</Eyebrow>
      <Box className="mt-gap">
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
                className="flex-row items-center gap-row border-t-hairline border-separator py-1"
                style={ROW}
              >
                <Box className="bg-accentTint rounded-pill px-2 py-0.5">
                  <Text className="text-accent text-xs font-bold">{b.time.text}</Text>
                </Box>
                <Text className="flex-1 text-text text-body">
                  <Inline parts={b.rest} onPlayFrom={props.onPlayFrom} />
                </Text>
              </Pressable>
            );
          }
          const text = b.parts.map((p) => p.text).join('');
          const lede = i === firstPara && text.length <= LEDE_MAX;
          return (
            <Text
              key={i}
              selectable
              className={lede ? 'text-text text-title font-display-semibold leading-[25px] mb-row' : 'text-text text-body leading-[22px] mb-row'}
            >
              <Inline parts={b.parts} onPlayFrom={props.onPlayFrom} />
            </Text>
          );
        })}
      </Box>
      <PictureViewer key={viewing ?? -1} images={pictures} index={viewing} onClose={() => setViewing(undefined)} />
    </Box>
  );
}
