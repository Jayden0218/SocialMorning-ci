// One episode card on Updates: notes, plays, comments, small buttons, Play.
/**
 * One episode row on the Updates tab (Owner, 2026-10-01, row 9): artwork, title, show notes,
 * the show — then a meta line "duration · ago · (headset) plays · (chat) comments" and a row of
 * small icon buttons (queue, comments, download, more) with the round play button at the right.
 * Plays and comments come from ONE comment-counts call for the whole page (M12 FR-080); a count
 * that is 0 or unknown is left out, never shown as "0".
 *
 * M17 (`Library-B`, T041): each row is a white `Card` — 64 pt artwork beside the show (accent)
 * and the episode title in the serif; the notes and the meta line under them at full width; a
 * hairline, then the four icon buttons and a yellow "Play" pill at the right. Same buttons,
 * names and handlers as before.
 * M21 US4: a long-press on the episode opens the ⋯ sheet too.
 * M21 US8 (FR-070): a video episode shows a small video mark before the show name (and says so).
 * M22 US12 (FR-036/037): the row swipes — left for Queue and Remove from Updates, right for Mark
 * played (src/ui/kit/SwipeRow.tsx); each is also an accessibility action on the episode button.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Card, CardDivider } from '@/ui/kit/Card';
import { CommentsButton } from '@/ui/comments/CommentsButton';
import { Icon, PlayIcon, type IconName } from '@/ui/kit/Icon';
import { ago, minutesLabel } from '@/ui/kit/format';
import { hit } from '@/design';
import { mediaKindOf, plural } from '@socialmorning/social-core';
import type { UpdateRow } from '@/me/updates';
import { SwipeRow, swipeA11y, type SwipeAction } from '@/ui/kit/SwipeRow';

const TAP = { minHeight: hit.min, minWidth: hit.min };
/** The episode link and the Play pill: 48 pt tall, any width. */
const PILL = { minHeight: hit.min };

/** "999", "1.2k", "12k" — short enough for the meta line. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toString()}k`;
  return `${Math.floor(n / 1000)}k`;
}

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

function IconButton(props: { name: IconName; label: string; colour: string; onPress: () => void; selected?: boolean }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} {...(props.selected !== undefined ? { accessibilityState: { selected: props.selected } } : {})} className="items-center justify-center pr-section" style={TAP}>
      <Icon name={props.name} size={20} color={props.colour} />
    </Pressable>
  );
}

export function UpdateEpisodeRow(props: {
  item: UpdateRow;
  plays?: number | undefined;
  comments?: number | undefined;
  now: number;
  /** A token colour from useColours — the icons are font glyphs, not text. */
  iconColour: string;
  /**
   * Owner, 2026-10-05: Queue and Download show when they are done — a filled icon in `doneColour`
   * (the accent) once the episode is in the queue / downloading / downloaded.
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
  /** M22 US12: swipe left → "Remove from Updates". Left out → no such action. */
  onRemoveFromUpdates?: () => void;
  /** M22 US12: swipe right → "Mark played". Left out → no such action. */
  onMarkPlayed?: () => void;
}): React.ReactElement {
  const { item, iconColour: c } = props;
  const done = props.doneColour ?? c;
  const dl = props.download ?? 'none';
  const e = item.episode;
  const meta = updateMeta({ durationMs: e.durationMs, publishedAt: e.publishedAt, plays: props.plays, comments: props.comments, now: props.now });
  const video = mediaKindOf(e.enclosureType, e.enclosureUrl) === 'video';
  const swipeLeft: SwipeAction[] = [
    { key: 'queue', label: 'Queue', onPress: props.onQueue },
    ...(props.onRemoveFromUpdates ? [{ key: 'remove', label: 'Remove from Updates', onPress: props.onRemoveFromUpdates }] : []),
  ];
  const swipeRight: SwipeAction[] = props.onMarkPlayed ? [{ key: 'played', label: 'Mark played', onPress: props.onMarkPlayed }] : [];
  return (
    <SwipeRow swipeLeft={swipeLeft} swipeRight={swipeRight}>
    <Card className="mx-screen-x mt-row pt-row">
      <Box className="flex-row gap-row">
        <Pressable onPress={props.onOpenShow} accessibilityRole="button" accessibilityLabel={`Open ${item.showTitle}`}>
          <Artwork url={item.imageUrl} size={64} rounded="row" name={item.showTitle} />
        </Pressable>
        <Pressable {...swipeA11y([...swipeLeft, ...swipeRight])} onPress={props.onOpenEpisode} onLongPress={props.onLongPress ?? props.onMore} accessibilityHint="Long-press for more actions" accessibilityRole="button" accessibilityLabel={`${e.title}, ${item.showTitle}${video ? ', video' : ''}. ${meta.label}`} className="flex-1 gap-1" style={PILL}>
          <Box className="flex-row items-center gap-1">
            {video ? <Icon name="videocam-outline" size={14} color={c} /> : null}
            <Text className="text-accent text-xs font-semibold flex-1" numberOfLines={1}>{item.showTitle}</Text>
          </Box>
          <Text className="font-display text-title text-text" numberOfLines={2}>{e.title}</Text>
        </Pressable>
      </Box>
      {item.summary ? <Text className="text-muted text-meta mt-2" numberOfLines={2}>{item.summary}</Text> : null}
      <Box className="flex-row items-center flex-wrap gap-1 mt-1">
        {meta.lead !== '' ? <Text className="text-muted text-xs">{meta.lead}</Text> : null}
        {meta.plays !== undefined ? (
          <>
            {meta.lead !== '' ? <Text className="text-muted text-xs">·</Text> : null}
            <Icon name="headset-outline" size={12} color={c} />
            <Text className="text-muted text-xs">{compactCount(meta.plays)}</Text>
          </>
        ) : null}
        {meta.comments !== undefined ? (
          <>
            {meta.lead !== '' || meta.plays !== undefined ? <Text className="text-muted text-xs">·</Text> : null}
            <Icon name="chatbubble-outline" size={12} color={c} />
            <Text className="text-muted text-xs">{compactCount(meta.comments)}</Text>
          </>
        ) : null}
      </Box>
      <Box className="mt-2"><CardDivider /></Box>
      <Box className="flex-row items-center py-1">
        <IconButton name={props.queued ? 'checkmark-circle' : 'add-circle-outline'} label={props.queued ? `${e.title} is in the queue` : `Add ${e.title} to the queue`} colour={props.queued ? done : c} selected={props.queued === true} onPress={props.onQueue} />
        {/* The count is on the meta line above; the button is the icon alone (M12 FR-080). */}
        <CommentsButton title={e.title} colour={c} onPress={props.onComments} />
        <IconButton name={dl === 'done' ? 'arrow-down-circle' : dl === 'active' ? 'cloud-download' : 'download-outline'} label={dl === 'done' ? `${e.title} is downloaded` : dl === 'active' ? `Downloading ${e.title}` : `Download ${e.title}`} colour={dl === 'none' ? c : done} selected={dl !== 'none'} onPress={props.onDownload} />
        <IconButton name="ellipsis-horizontal" label={`More for ${e.title}`} colour={c} onPress={props.onMore} />
        <Box className="flex-1" />
        <Pressable onPress={props.onPlay} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} className="flex-row items-center gap-2 px-row rounded-pill bg-playDisc" style={PILL}>
          <PlayIcon size={12} tint="playGlyph" />
          <Text className="text-text text-body font-bold">Play</Text>
        </Pressable>
      </Box>
    </Card>
    </SwipeRow>
  );
}
