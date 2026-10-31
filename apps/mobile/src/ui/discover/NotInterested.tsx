// The For You "···" sheet (not interested in this episode, or this show) and the Hidden card with Undo.
/**
 * M19 T021 (US2, FR-010–FR-012): a For You card's "···" opens this sheet — "Not interested in this
 * episode" or "Stop recommending this show", and Cancel. The choice is the caller's to send
 * (src/recs/dismissals.ts); the card turns into the Hidden card (`HiddenNotice`) with Undo for a while.
 *
 * M31 T030 (design-pulse2 `home--not-interested-sheet`, `home--hidden-undo`): the sheet is the kit's
 * `ActionSheet` — the episode as its header (cover 52, the show in hot-text, the title), two choice tiles
 * side by side (radius 20, min 120 tall, icon 24 in hot-text, the words Geist 600 14, the show's name under
 * the second), and Cancel as a 48 pill at the foot. `HiddenNotice` is the dashed deck card that keeps the
 * slot: an eye mark, "Hidden. We won't recommend it again." (show: "Hidden. This show won't be
 * recommended."), Undo (40, light) and a 28 ring that counts the seconds left, with "6 s" beside it.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, radius, spacing } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { ProgressRing } from '@/ui/kit/ProgressRing';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import type { EpisodeCard } from '@/social/api';
import type { DismissalKind } from '@/social/profile-api';
import { DeckCard, PX } from './Deck';

/** How long the Hidden card stays (the page's `UNDO_MS`). */
export const HIDDEN_MS = 8000;
const TICK_MS = 250;
/** Drawn: a tile is at least 120 tall with 14 of padding; the ring is 28 (stroke 3); Undo is 40. */
const TILE = { minHeight: 120, padding: 14, gap: PX.ten } as const;
const RING = 28;
const UNDO = 40;

function Choice(props: { icon: IconName; label: string; detail?: string; accessibilityLabel?: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      className="flex-1 bg-raise border border-line"
      style={{ ...TILE, borderRadius: radius.card - 4 }}
    >
      <Icon name={props.icon} size={24} color={colour.hotText} />
      <Type step="compact" className="text-text">{props.label}</Type>
      {props.detail ? <Type step="caption" className="text-text2" numberOfLines={2}>{props.detail}</Type> : null}
    </Pressable>
  );
}

export function NotInterestedSheet(props: { card: EpisodeCard | undefined; onChoose: (kind: DismissalKind, card: EpisodeCard) => void; onClose: () => void }): React.ReactElement {
  const { card } = props;
  return (
    <ActionSheet open={card !== undefined} onClose={props.onClose} label="Not interested">
      {card ? (
        <>
          <Box className="flex-row items-center" style={{ gap: spacing.row }}>
            <Artwork url={card.imageUrl} size={52} name={card.showTitle} />
            <Box className="flex-1 min-w-0">
              <Type step="caption" className="text-hotText" numberOfLines={1}>{card.showTitle}</Type>
              <Type step="lede" className="text-text font-bold" numberOfLines={1}>{card.title}</Type>
            </Box>
          </Box>
          <Box className="flex-row" style={{ gap: PX.ten }}>
            <Choice icon="eye-off-outline" label="Not interested in this episode" onPress={() => props.onChoose('episode', card)} />
            <Choice icon="remove-circle-outline" label="Stop recommending this show" detail={card.showTitle} accessibilityLabel={`Stop recommending ${card.showTitle}`} onPress={() => props.onChoose('show', card)} />
          </Box>
        </>
      ) : null}
      <PulseButton label="Cancel" kind="quiet" onPress={props.onClose} full />
    </ActionSheet>
  );
}

/** The seconds left of `ms`, ticking down from when it is drawn. */
function useSecondsLeft(ms: number): number {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const end = Date.now() + ms;
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), TICK_MS);
    return () => clearInterval(t);
  }, [ms]);
  return left;
}

/** The dashed card that holds a hidden card's slot: what was hidden, Undo, and the time left. */
export function HiddenNotice(props: { kind: DismissalKind; onUndo: () => void; ms?: number }): React.ReactElement {
  const ms = props.ms ?? HIDDEN_MS;
  const left = useSecondsLeft(ms);
  return (
    <DeckCard tone="dashed">
      <Box className="flex-1 justify-center" style={{ padding: PX.eighteen, gap: spacing.row }} accessibilityLiveRegion="polite">
        <Icon name="eye-off-outline" size={26} color={colour.text} />
        <Type step="section" className="text-text">{props.kind === 'show' ? 'Hidden. This show won’t be recommended.' : 'Hidden. We won’t recommend it again.'}</Type>
        <Box className="flex-row items-center" style={{ gap: spacing.row }}>
          <Pressable onPress={props.onUndo} accessibilityRole="button" accessibilityLabel="Undo" hitSlop={spacing.gap} className="bg-text items-center justify-center" style={{ height: UNDO, paddingHorizontal: spacing.block, borderRadius: UNDO / 2 }}>
            <Type step="row" className="text-void">Undo</Type>
          </Pressable>
          <ProgressRing progress={left / ms} size={RING} stroke={3} colour="primary" />
          <Type step="mono" className="text-text2">{`${Math.ceil(left / 1000)} s`}</Type>
        </Box>
      </Box>
    </DeckCard>
  );
}
