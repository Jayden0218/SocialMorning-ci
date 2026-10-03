// One clip: caption, who made it, time range, play and share buttons.
/**
 * One clip: caption, author (a profile link), range, and the actions the viewer may take.
 *
 * M17 (`Clip-B`): a second look, `variant="hero"`, for the clip page — a centred card with an
 * "A clip from" eyebrow, the episode in serif, the caption as a serif quote, the range as a
 * tinted play pill and the author under it. The list look (`row`, the default, used by the
 * episode's clip list) keeps its layout; its actions now reach 48 pt. Props are unchanged
 * apart from the three new optional ones.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, tabular } from '@/design';
import { Link } from '@/design/tailwind';
import type { Clip } from '@/social/api';
import { mmss } from '@/ui/kit/format';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Icon } from '@/ui/kit/Icon';
import { initialOf } from '@/ui/kit/Artwork';
import { useColours } from '@/ui/kit/useColours';

export type ClipCardProps = {
  clip: Clip;
  pending?: boolean;
  onPlay?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  /** M17: `hero` is the clip page's centred card (`Clip-B`); `row` (default) is the list line. */
  variant?: 'row' | 'hero';
  /** M17, hero only: the episode the clip is from, and its show (with any provenance note). */
  episodeTitle?: string | undefined;
  showTitle?: string | undefined;
};

const TAP = { minHeight: hit.min };
const AVATAR = { width: 32, height: 32 };

export function ClipCard(props: ClipCardProps): React.ReactElement {
  const { clip } = props;
  // M6 (FR-002/FR-013): a clip the viewer reported, or one moderation removed, keeps its place as a line of text.
  if (clip.reported || clip.removed) {
    return (
      <Box className="py-2.5 border-b-hairline border-separator gap-1">
        <Text className="text-muted">{clip.reported ? 'You reported this' : 'Removed by moderation'}</Text>
      </Box>
    );
  }
  if (props.variant === 'hero') return <HeroClip {...props} />;
  return (
    <Box className="py-2.5 border-b-hairline border-separator gap-1" accessibilityLabel={`Clip ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`}>
      <Pressable onPress={props.onPlay} disabled={!props.onPlay} accessibilityRole="button">
        <Text className="font-semibold text-text" style={tabular}>{mmss(clip.startMs)} – {mmss(clip.endMs)}{props.pending ? ' · sending…' : ''}{clip.deleted ? ' · removed' : ''}</Text>
        {clip.caption ? <Text className="text-sm text-text">{clip.caption}</Text> : null}
      </Pressable>
      <Box className="flex-row gap-4 items-center">
        {clip.author.displayName !== null && !props.pending ? (
          <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
            {/* A name is not an action (owner's K1 note, 2026-09-25): it takes the text colour, not the accent. */}
            <Pressable accessibilityRole="link" className="min-h-12 justify-center"><Text className="text-text">by {clip.author.displayName}</Text></Pressable>
          </Link>
        ) : <Text className="text-muted">{props.pending ? 'by you' : 'by a deleted account'}</Text>}
        {props.onShare ? <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this clip" className="min-h-12 justify-center"><Text className="text-accent">Share</Text></Pressable> : null}
        {props.onDelete ? <Pressable onPress={props.onDelete} accessibilityRole="button" accessibilityLabel="Delete this clip" className="min-h-12 justify-center"><Text className="text-accent">Delete</Text></Pressable> : null}
        {props.onReport ? <Pressable onPress={props.onReport} accessibilityRole="button" accessibilityLabel="Report this clip" className="min-h-12 justify-center"><Text className="text-muted">Report</Text></Pressable> : null}
      </Box>
    </Box>
  );
}

/** `Clip-B`'s card. Same data and the same optional actions as the row. */
function HeroClip(props: ClipCardProps): React.ReactElement {
  const { clip } = props;
  const c = useColours();
  const seconds = Math.round((clip.endMs - clip.startMs) / 1000);
  const named = clip.author.displayName !== null && !props.pending;
  return (
    <Card className="py-6 items-center gap-row">
      <Eyebrow accent>A clip from</Eyebrow>
      {props.episodeTitle ? <Text className="text-text text-lg font-display text-center" numberOfLines={3}>{props.episodeTitle}</Text> : null}
      {props.showTitle ? <Text className="text-muted text-meta text-center">{props.showTitle}</Text> : null}
      {clip.caption ? <Text className="text-text text-title font-display-semibold text-center mt-1">“{clip.caption}”</Text> : null}
      <Pressable
        onPress={props.onPlay}
        disabled={!props.onPlay}
        accessibilityRole="button"
        accessibilityLabel={`Play the clip, ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`}
        className="bg-accentTint rounded-pill px-section flex-row items-center justify-center gap-gap"
        style={TAP}
      >
        {props.onPlay ? <Icon name="play" size={12} color={c.accent} /> : null}
        <Text className="text-accent text-body font-bold" style={tabular}>{mmss(clip.startMs)} – {mmss(clip.endMs)} · {seconds} s{props.pending ? ' · sending…' : ''}{clip.deleted ? ' · removed' : ''}</Text>
      </Pressable>
      <Box className="flex-row items-center gap-gap">
        <Box className="rounded-pill bg-accentTint items-center justify-center" style={AVATAR} accessible={false}>
          <Text className="text-text text-meta font-bold">{named ? initialOf(clip.author.displayName ?? '') : '·'}</Text>
        </Box>
        {named ? (
          <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
            {/* A name is not an action (owner's K1 note, 2026-09-25): it takes the text colour, not the accent. */}
            <Pressable accessibilityRole="link" accessibilityLabel={`by ${clip.author.displayName ?? ''}`} className="justify-center" style={TAP}>
              <Text className="text-text text-body">by <Text className="text-text text-body font-bold">{clip.author.displayName}</Text></Text>
            </Pressable>
          </Link>
        ) : <Text className="text-muted text-body">{props.pending ? 'by you' : 'by a deleted account'}</Text>}
      </Box>
      {props.onShare || props.onDelete || props.onReport ? (
        <Box className="flex-row gap-section items-center">
          {props.onShare ? <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this clip" className="justify-center" style={TAP}><Text className="text-accent text-body font-semibold">Share</Text></Pressable> : null}
          {props.onDelete ? <Pressable onPress={props.onDelete} accessibilityRole="button" accessibilityLabel="Delete this clip" className="justify-center" style={TAP}><Text className="text-accent text-body font-semibold">Delete</Text></Pressable> : null}
          {props.onReport ? <Pressable onPress={props.onReport} accessibilityRole="button" accessibilityLabel="Report this clip" className="justify-center" style={TAP}><Text className="text-muted text-body">Report</Text></Pressable> : null}
        </Box>
      ) : null}
    </Card>
  );
}
