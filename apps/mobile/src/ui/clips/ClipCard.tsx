// One clip on the episode page's Clips deck: a 200 × 120 card with the time range, who made it and a play dot.
/**
 * M31 W4-D (T053; design-pulse2 `episode--screen` "Clips"): a Deck card 200 wide and 120 tall (radius 20) — the episode's
 * cover across it under a veil that is void at 92 % at the foot, the range in the solid timestamp chip ("12:02 – 12:32") with
 * "by Rui" (Geist 12, a profile link) under it at the bottom left, and the light play dot (32) at the top right. Tapping the card
 * plays the clip. The drawing has no Share, Delete or Report on the card: they stay (the action replay), behind a long-press that opens
 * the kit sheet, exactly as a Related card's long-press opens its Details sheet; a screen reader gets the same three as custom actions.
 * A clip the viewer reported, or one moderation removed, keeps its place as a one-line card (M6 FR-002, FR-013).
 * The `hero` look (M17 `Clip-B`) had no caller left since the clip page was redrawn in wave 3, so it is gone.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Link, LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import type { Clip } from '@/social/api';
import { mmss } from '@/ui/kit/format';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { PlayDot } from '@/ui/me/lists';
import { EPISODE } from '@/ui/episode/measures';

export type ClipCardProps = {
  clip: Clip;
  pending?: boolean;
  onPlay?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  /** The episode's cover and show, drawn behind the card (the drawing's cards carry art). */
  imageUrl?: string | undefined;
  showTitle?: string | undefined;
};

const CARD = EPISODE.clipCard;
const VEIL = [colour.clear, colour.pickFoot] as const;
const DOT = 32;
const INSET = 10;
const FILL = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/** The card's one-line label: "Clip 12:02 to 12:32 by Rui". */
export function clipLabel(clip: Clip, pending: boolean | undefined): string {
  return `Clip ${mmss(clip.startMs)} to ${mmss(clip.endMs)}${pending ? ', sending' : ''}${clip.deleted ? ', removed' : ''}`;
}

export function ClipCard(props: ClipCardProps): React.ReactElement {
  const { clip } = props;
  const [menu, setMenu] = useState(false);
  // M6 (FR-002/FR-013): a clip the viewer reported, or one moderation removed, keeps its place as a line of text.
  if (clip.reported || clip.removed) {
    return (
      <Box testID="clip-card-note" className="bg-raise justify-center px-row" style={{ width: CARD.width, height: CARD.height, borderRadius: CARD.radius }}>
        <Type step="note" className="text-text2">{clip.reported ? 'You reported this' : 'Removed by moderation'}</Type>
      </Box>
    );
  }
  const range = `${mmss(clip.startMs)} – ${mmss(clip.endMs)}${props.pending ? ' · sending…' : ''}${clip.deleted ? ' · removed' : ''}`;
  const named = clip.author.displayName !== null && !props.pending;
  const hasMenu = props.onShare !== undefined || props.onDelete !== undefined || props.onReport !== undefined;
  const actions = [
    ...(props.onShare ? [{ name: 'share', label: 'Share this clip' }] : []),
    ...(props.onDelete ? [{ name: 'delete', label: 'Delete this clip' }] : []),
    ...(props.onReport ? [{ name: 'report', label: 'Report this clip' }] : []),
  ];
  const run = (name: string) => { if (name === 'share') props.onShare?.(); else if (name === 'delete') props.onDelete?.(); else if (name === 'report') props.onReport?.(); };
  const pick = (f: (() => void) | undefined) => () => { setMenu(false); f?.(); };
  return (
    <>
      <Box testID="clip-card" className="bg-raise overflow-hidden" style={{ width: CARD.width, height: CARD.height, borderRadius: CARD.radius }}>
        <Box className="overflow-hidden" style={FILL} accessible={false} importantForAccessibility="no-hide-descendants">
          <Box style={{ marginTop: -(CARD.width - CARD.height) / 2 }}>
            <Artwork url={props.imageUrl} size={CARD.width} name={props.showTitle} />
          </Box>
        </Box>
        <LinearGradient colors={VEIL} pointerEvents="none" style={FILL} />
        <Pressable
          onPress={props.onPlay}
          disabled={!props.onPlay}
          onLongPress={hasMenu ? () => setMenu(true) : undefined}
          accessibilityRole="button"
          accessibilityLabel={`${clipLabel(clip, props.pending)}${clip.caption ? `. ${clip.caption}` : ''}`}
          accessibilityHint={hasMenu ? 'Long-press for more actions' : undefined}
          accessibilityActions={actions}
          onAccessibilityAction={(e) => run(e.nativeEvent.actionName)}
          style={FILL}
        />
        <Box pointerEvents="none" className="absolute" style={{ right: INSET, top: INSET }} accessible={false}>
          <PlayDot size={DOT} />
        </Box>
        <Box className="absolute gap-hair" style={{ left: INSET, right: INSET, bottom: INSET }} pointerEvents="box-none">
          <Box pointerEvents="none" accessible={false}><TimestampChip text={range} solid /></Box>
          {named ? (
            <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
              {/* A name is not an action (owner's K1 note, 2026-09-25): it takes the text colour, not the accent. */}
              <Pressable accessibilityRole="link" accessibilityLabel={`by ${clip.author.displayName ?? ''}`} hitSlop={{ top: 12, bottom: 12, right: 12 }} className="self-start">
                <Type step="chip" className="text-text" numberOfLines={1}>by {clip.author.displayName}</Type>
              </Pressable>
            </Link>
          ) : <Type step="chip" className="text-text2">{props.pending ? 'by you' : 'by a deleted account'}</Type>}
        </Box>
      </Box>
      {hasMenu ? (
        <ActionSheet open={menu} onClose={() => setMenu(false)} label={`Clip ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`} title="Clip">
          <PanelGroup>
            {props.onShare ? <PanelRow icon="share-outline" label="Share" accessibilityLabel="Share this clip" onPress={pick(props.onShare)} /> : null}
            {props.onDelete ? <PanelRow icon="trash-outline" label="Delete" accessibilityLabel="Delete this clip" danger onPress={pick(props.onDelete)} /> : null}
            {props.onReport ? <PanelRow icon="flag-outline" label="Report" accessibilityLabel="Report this clip" danger onPress={pick(props.onReport)} /> : null}
          </PanelGroup>
          <PulseButton label="Cancel" kind="quiet" onPress={() => setMenu(false)} full />
        </ActionSheet>
      ) : null}
    </>
  );
}
