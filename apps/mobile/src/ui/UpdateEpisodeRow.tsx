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
 */
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Artwork } from './Artwork';
import { Card, CardDivider } from './Card';
import { CommentsButton } from './CommentsButton';
import { Icon, PlayIcon, type IconName } from './Icon';
import { ago, minutesLabel } from './format';
import { hit } from '../design';
import { plural } from '@socialmorning/social-core';
import type { UpdateRow } from '../me/updates';

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

function IconButton(props: { name: IconName; label: string; colour: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className="items-center justify-center pr-section" style={TAP}>
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
  onOpenShow: () => void;
  onOpenEpisode: () => void;
  onQueue: () => void;
  onComments: () => void;
  onDownload: () => void;
  onMore: () => void;
  onPlay: () => void;
}): React.ReactElement {
  const { item, iconColour: c } = props;
  const e = item.episode;
  const meta = updateMeta({ durationMs: e.durationMs, publishedAt: e.publishedAt, plays: props.plays, comments: props.comments, now: props.now });
  return (
    <Card className="mx-screen-x mt-row pt-row">
      <Box className="flex-row gap-row">
        <Pressable onPress={props.onOpenShow} accessibilityRole="button" accessibilityLabel={`Open ${item.showTitle}`}>
          <Artwork url={item.imageUrl} size={64} rounded="row" name={item.showTitle} />
        </Pressable>
        <Pressable onPress={props.onOpenEpisode} accessibilityRole="button" accessibilityLabel={`${e.title}, ${item.showTitle}. ${meta.label}`} className="flex-1 gap-1" style={PILL}>
          <Text className="text-accent text-xs font-semibold" numberOfLines={1}>{item.showTitle}</Text>
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
        <IconButton name="add-circle-outline" label={`Add ${e.title} to the queue`} colour={c} onPress={props.onQueue} />
        {/* The count is on the meta line above; the button is the icon alone (M12 FR-080). */}
        <CommentsButton title={e.title} colour={c} onPress={props.onComments} />
        <IconButton name="download-outline" label={`Download ${e.title}`} colour={c} onPress={props.onDownload} />
        <IconButton name="ellipsis-horizontal" label={`More for ${e.title}`} colour={c} onPress={props.onMore} />
        <Box className="flex-1" />
        <Pressable onPress={props.onPlay} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} className="flex-row items-center gap-2 px-row rounded-pill bg-primary" style={PILL}>
          <PlayIcon size={12} tint="onPrimary" />
          <Text className="text-onPrimary text-body font-bold">Play</Text>
        </Pressable>
      </Box>
    </Card>
  );
}
