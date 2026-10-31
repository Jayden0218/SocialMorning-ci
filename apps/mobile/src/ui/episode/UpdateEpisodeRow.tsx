// One episode card on the Updates deck: cover with date and length, show, title, small buttons, Play.
/**
 * One episode on the Updates tab (Owner, 2026-10-01, row 9). Plays and comments come from ONE comment-counts call for the whole page
 * (M12 FR-080); a count that is 0 or unknown is left out, never shown as "0".
 *
 * M31 D-A (T031; design-pulse2 `index.html#updates--screen`, layout pattern Deck): the row became a 290 x 350 card (radius 26, a 1 line,
 * raise) — a 150 cover with the date and length in a mono chip at its corner ("TODAY · 48 MIN"), then the show (opens it, with a ›), the
 * title in Unbounded 700 19 (opens the episode) and, at the foot, four 40 circles (the drawing's `ibtn fill` is the card's own raise colour, so a circle shows only its glyph until it is used) — Queue, Comments, Download, More — and Play (46,
 * the light disc). A swipe up marks the episode played, a swipe down removes it from Updates (`SwipeCard`; also two accessibility
 * actions on the title). Plays and comments are no longer printed on the card (the drawing has no line for them): they are in the
 * title's spoken name. Queue is not in the drawing's action list; it stays as a fourth circle so nothing is lost.
 * M21 US4: a long-press on the title opens the ⋯ sheet too. M21 US8 (FR-070): a video episode says so in the spoken name and on the chip.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Icon, PlayIcon } from '@/ui/kit/Icon';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { CoverBand } from '@/ui/discover/Deck';
import { ago, chipClock, compactCount, minutesLabel, mmss, shortDate } from '@/ui/kit/format';
import { colour } from '@/design';
import { mediaKindOf, plural } from '@socialmorning/social-core';
import type { UpdateRow } from '@/me/updates';
import { swipeA11y, type SwipeAction } from '@/ui/kit/SwipeRow';
import { SwipeCard } from '@/ui/library/SwipeCard';
import { LIB_TYPE, UPDATES } from '@/ui/library/measures';

export type UpdateMeta = { lead: string; plays?: number; comments?: number; label: string };

/**
 * The meta line's parts. `lead` is "69 min · 3 h ago"; plays / comments are present only when
 * above 0. `label` is the whole line in words, for the screen reader.
 */
export function updateMeta(p: { durationMs?: number | undefined; publishedAt?: number | undefined; plays?: number | undefined; comments?: number | undefined; now: number }): UpdateMeta {
  const lead = [minutesLabel(p.durationMs), ago(p.publishedAt, p.now)].filter((s) => s !== '').join(' · ');
  const plays = p.plays !== undefined && p.plays > 0 ? p.plays : undefined;
  const comments = p.comments !== undefined && p.comments > 0 ? p.comments : undefined;
  const label = [lead, plays !== undefined ? plural(plays, 'play') : '', comments !== undefined ? plural(comments, 'comment') : ''].filter((s) => s !== '').join(', ');
  return { lead, ...(plays !== undefined ? { plays } : {}), ...(comments !== undefined ? { comments } : {}), label };
}

const DAY = 86_400_000;
/** The cover chip: "TODAY · 48 MIN", "YESTERDAY · 38 MIN", else the date. Either part is left out when unknown. */
export function coverChip(publishedAt: number | undefined, durationMs: number | undefined, now: number): string {
  const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  let when = '';
  if (publishedAt !== undefined) {
    const days = Math.round((startOfDay(now) - startOfDay(publishedAt)) / DAY);
    when = days <= 0 ? 'TODAY' : days === 1 ? 'YESTERDAY' : shortDate(publishedAt);
  }
  return [when, minutesLabel(durationMs).toUpperCase()].filter((s) => s !== '').join(' · ');
}

/** The 40 round tools of the card: the raise disc (light with void glyph once used — queued, downloading, downloaded), the glyph 18, touched 48. */
const TOOL = { width: UPDATES.card.action, height: UPDATES.card.action, borderRadius: UPDATES.card.action / 2 };
const TOOL_SLOP = Math.ceil((48 - UPDATES.card.action) / 2);

export function UpdateEpisodeRow(props: {
  item: UpdateRow;
  plays?: number | undefined;
  comments?: number | undefined;
  /** Wave 5b: the episode's first hot moment (NEW in the drawing): a time chip and "N already reacting". Left out → no line. */
  hot?: { startMs: number; reactions: number } | undefined;
  now: number;
  /** Kept for callers: the circles take their glyph colour from the kit. */
  iconColour?: string;
  /**
   * Owner, 2026-10-05: Queue and Download show when they are done — a filled icon in `doneColour`
   * once the episode is in the queue / downloading / downloaded.
   */
  queued?: boolean;
  download?: 'none' | 'active' | 'done';
  doneColour?: string;
  onOpenShow: () => void;
  onOpenEpisode: () => void;
  onQueue: () => void;
  onComments: () => void;
  onDownload: () => void;
  onMore: () => void;
  onPlay: () => void;
  /** M21 US4 (FR-035): a long-press on the episode opens the same sheet as ⋯. Defaults to `onMore`. */
  onLongPress?: () => void;
  /** Swipe down → "Remove from Updates". Left out → no such action. */
  onRemoveFromUpdates?: () => void;
  /** Swipe up → "Mark played". Left out → no such action. */
  onMarkPlayed?: () => void;
  /** The page stops its own scroll while a finger is on a card. */
  onDragging?: (on: boolean) => void;
}): React.ReactElement {
  const { item } = props;
  const dl = props.download ?? 'none';
  const e = item.episode;
  const meta = updateMeta({ durationMs: e.durationMs, publishedAt: e.publishedAt, plays: props.plays, comments: props.comments, now: props.now });
  const video = mediaKindOf(e.enclosureType, e.enclosureUrl) === 'video';
  const chip = coverChip(e.publishedAt, e.durationMs, props.now);
  const swipes: SwipeAction[] = [
    ...(props.onMarkPlayed ? [{ key: 'played', label: 'Mark played', onPress: props.onMarkPlayed }] : []),
    ...(props.onRemoveFromUpdates ? [{ key: 'remove', label: 'Remove from Updates', onPress: props.onRemoveFromUpdates }] : []),
  ];
  const noop = (): void => undefined;
  return (
    <SwipeCard onUp={props.onMarkPlayed ?? noop} onDown={props.onRemoveFromUpdates ?? noop} {...(props.onDragging ? { onDragging: props.onDragging } : {})}>
      <Box testID="update-card" className="flex-1 bg-raise border border-line overflow-hidden" style={{ borderRadius: UPDATES.card.radius }}>
        <CoverBand url={item.imageUrl} name={item.showTitle} height={UPDATES.card.cover}>
          {chip ? (
            <Box className="absolute rounded-chip" style={{ left: UPDATES.card.chipLeft, top: UPDATES.card.chipTop, paddingHorizontal: UPDATES.card.chipPadX, paddingVertical: UPDATES.card.chipPadY, borderRadius: UPDATES.card.chipRadius, backgroundColor: colour.glassDark }}>
              <Type step="tag" className="text-text" style={LIB_TYPE.mono11} numberOfLines={1}>{video ? `${chip} · VIDEO` : chip}</Type>
            </Box>
          ) : null}
        </CoverBand>
        <Box className="flex-1" style={{ padding: UPDATES.card.pad, gap: UPDATES.card.gap }}>
          <Pressable onPress={props.onOpenShow} accessibilityRole="button" accessibilityLabel={`Open ${item.showTitle}`} hitSlop={UPDATES.card.gap} className="self-start max-w-full">
            <Type step="caption" className="text-text2" style={LIB_TYPE.show12} numberOfLines={1}>{`${item.showTitle} ›`}</Type>
          </Pressable>
          <Pressable
            {...swipeA11y(swipes)}
            onPress={props.onOpenEpisode}
            onLongPress={props.onLongPress ?? props.onMore}
            accessibilityHint="Long-press for more actions"
            accessibilityRole="button"
            accessibilityLabel={`${e.title}, ${item.showTitle}${video ? ', video' : ''}. ${meta.label}`}
          >
            <Type step="lede" className="text-text font-bold" style={LIB_TYPE.cardTitle} numberOfLines={3}>{e.title}</Type>
          </Pressable>
          {props.hot ? (
            <Box testID="update-hot" accessible accessibilityLabel={`${chipClock(mmss(props.hot.startMs))} · ${compactCount(props.hot.reactions)} already reacting`} className="flex-row items-center" style={{ gap: UPDATES.card.chipPadX - 1 }}>
              <TimestampChip text={mmss(props.hot.startMs)} />
              <Icon name="flame-outline" size={12} color={colour.hotText} />
              <Type step="tag" className="text-hotText" numberOfLines={1}>{`${compactCount(props.hot.reactions)} already reacting`}</Type>
            </Box>
          ) : null}
          <Box className="flex-row items-center mt-auto" style={{ gap: UPDATES.card.actionGap }}>
            <Pressable onPress={props.onQueue} accessibilityRole="button" accessibilityLabel={props.queued ? `${e.title} is in the queue` : `Add ${e.title} to the queue`} accessibilityState={{ selected: props.queued === true }} hitSlop={TOOL_SLOP} className={`items-center justify-center ${props.queued ? 'bg-text' : 'bg-raise'}`} style={TOOL}>
              <Icon name={props.queued ? 'checkmark' : 'add'} size={18} color={props.queued ? colour.void : colour.text} />
            </Pressable>
            <Pressable onPress={props.onComments} accessibilityRole="button" accessibilityLabel={meta.comments !== undefined ? `Comments on ${e.title}, ${plural(meta.comments, 'comment')}` : `Comments on ${e.title}`} hitSlop={TOOL_SLOP} className="items-center justify-center bg-raise" style={TOOL}>
              <Icon name="chatbubble-outline" size={18} color={colour.text} />
            </Pressable>
            <Pressable onPress={props.onDownload} accessibilityRole="button" accessibilityLabel={dl === 'done' ? `${e.title} is downloaded` : dl === 'active' ? `Downloading ${e.title}` : `Download ${e.title}`} accessibilityState={{ selected: dl !== 'none' }} hitSlop={TOOL_SLOP} className={`items-center justify-center ${dl === 'none' ? 'bg-raise' : 'bg-text'}`} style={TOOL}>
              <Icon name={dl === 'done' ? 'checkmark-done' : dl === 'active' ? 'cloud-download' : 'download-outline'} size={18} color={dl === 'none' ? colour.text : colour.void} />
            </Pressable>
            <Pressable onPress={props.onMore} accessibilityRole="button" accessibilityLabel={`More for ${e.title}`} hitSlop={TOOL_SLOP} className="items-center justify-center bg-raise" style={TOOL}>
              <Icon name="ellipsis-horizontal" size={18} color={colour.text} />
            </Pressable>
            <Box className="flex-1" />
            <Pressable onPress={props.onPlay} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} hitSlop={1} className="bg-text items-center justify-center" style={{ width: UPDATES.card.play, height: UPDATES.card.play, borderRadius: UPDATES.card.play / 2, paddingLeft: 2 }}>
              <PlayIcon size={16} tint="void" />
            </Pressable>
          </Box>
        </Box>
      </Box>
    </SwipeCard>
  );
}
