// Episode notes; lines starting with a time become rows that play from there.
/**
 * M17 (`Episode-B`): the episode page's show notes, laid out the Editorial way — a "Show notes"
 * eyebrow, the first paragraph as a serif lede, the rest as body text, and every line that
 * starts with a time ("00:39 Why the first hour…") as its own row: a tinted time chip and the
 * chapter's words, the whole row one 48 pt link that plays from there.
 *
 * Same parts as before (M12 FR-003/030/031, `noteParts`): links still open the browser and a
 * mid-line h:mm:ss still plays from there; only where they sit changed.
 */
import { Linking } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import type { NotePart } from '@/ui/kit/format';

const ROW = { minHeight: hit.min };
/** A first paragraph longer than this reads as body text, not a lede. */
const LEDE_MAX = 320;
/** Text that is only a list bullet or an opening bracket, as `timestampParts` leaves before a time. */
const BULLET = /^[\s\-•*·–([]*$/;

export type NoteBlock =
  | { kind: 'paragraph'; parts: NotePart[] }
  | { kind: 'chapter'; time: NotePart & { atMs: number }; rest: NotePart[] };

/** Splits the note parts into lines, then groups them: chapter rows, and paragraphs between blank lines. */
export function noteBlocks(parts: readonly NotePart[]): NoteBlock[] {
  const lines: NotePart[][] = [[]];
  for (const p of parts) {
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
            onPress={() => void Linking.openURL(part.href!).catch(() => undefined)}
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

export function ShowNotes(props: { parts: readonly NotePart[]; onPlayFrom: (ms: number) => void }): React.ReactElement | null {
  const blocks = noteBlocks(props.parts);
  if (blocks.length === 0) return null;
  const firstPara = blocks.findIndex((b) => b.kind === 'paragraph');
  return (
    <Box className="mt-section">
      <Eyebrow>Show notes</Eyebrow>
      <Box className="mt-gap">
        {blocks.map((b, i) => {
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
              className={lede ? 'text-text text-title font-display-semibold leading-[25px] mb-row' : 'text-text text-body leading-[22px] mb-row'}
            >
              <Inline parts={b.parts} onPlayFrom={props.onPlayFrom} />
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
