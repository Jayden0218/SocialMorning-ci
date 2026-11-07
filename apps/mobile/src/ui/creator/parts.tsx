// The Creator centre's claim card: a show waiting for its code, or proven with its numbers.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `claimCard`, `creator--host-proven`, `creator--code-pending`, `creator--code-not-found`): a raise card
 * (radius 22, 1 px line, 16 of padding, 10 between parts).
 *  - Pending: the cover (72, radius 16) with "PENDING · NOT PROVEN YET" in hot-text mono caps over the show's name (Unbounded 800 20), the three steps (13, text-2),
 *    the code in Unbounded 800 34 spaced 0.04 em in the hot-to-violet gradient (selectable; its spoken name "Your code: …"), and the answer to Verify in hot-text 13 (announced).
 *  - Proven: the cover (88, radius 18) with "PROVEN — YOU ARE THE HOST" over the name (Unbounded 800 22); the numbers in Geist 600 15 ("120 listened · 14 comments · 32 episodes";
 *    "Proven — loading your numbers…" until they arrive); "Where people talk most" and up to three moments, each a timestamp chip, the episode and the comment count.
 * Not as drawn: the drawing's 46-tall curve of the whole show is left out — the app has no per-show curve to draw it from, and a made-up one would pass for data.
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { plural } from '@socialmorning/social-core';
import type { ShowStats } from '@/social/api';
import { STAGE_TYPE } from '@/ui/wallet/measures';
import { Big, Cap, GlowWords, Line } from '@/ui/wallet/stage';
import { CREATOR } from './measures';

export function ClaimCard(props: {
  status: 'pending' | 'proven';
  title: string;
  imageUrl: string | undefined;
  code: string;
  /** Pending: the answer to Verify. */
  note: string | undefined;
  /** Proven: the numbers, once they have come. */
  stats: ShowStats | undefined;
  /** Several codes are waiting: this card is the one Share code and Verify act on. */
  active?: boolean;
  /** Makes a waiting card that is not the active one tappable. */
  onUse?: () => void;
}): React.ReactElement {
  const pending = props.status === 'pending';
  const k = CREATOR.card;
  const cover = pending ? k.coverPending : k.coverProven;
  const body = (
    <Box testID={pending ? 'claim-card-pending' : 'claim-card-proven'} className="bg-raise border border-line" style={{ borderRadius: k.radius, padding: k.pad, gap: k.gap, ...(props.active === true ? { borderColor: colour.hot } : null) }}>
      <Box className="flex-row items-end" style={{ gap: k.headGap }}>
        <Box className="overflow-hidden" testID="claim-cover" style={{ width: cover, height: cover, borderRadius: pending ? k.radiusPending : k.radiusProven }}>
          <Artwork url={props.imageUrl} size={cover} name={props.title} />
        </Box>
        <Box className="flex-1" style={{ gap: pending ? k.headTextPending : k.headTextProven }}>
          <Cap>{pending ? 'Pending · not proven yet' : 'Proven — you are the host'}</Cap>
          <Big size={pending ? 'big20' : 'big22'} numberOfLines={3}>{props.title}</Big>
        </Box>
      </Box>
      {pending ? (
        <>
          <Line size="line13">1. Copy this code. 2. Put it anywhere in your show description, in your hosting service. 3. Tap Verify.</Line>
          <GlowWords text={props.code} style={STAGE_TYPE.claimCode} selectable testID="claim-code" accessibilityLabel={`Your code: ${props.code}`} />
          {props.note ? <Line size="line13" tone="hot" live>{props.note}</Line> : null}
        </>
      ) : <ProvenNumbers stats={props.stats} />}
    </Box>
  );
  if (!pending || props.onUse === undefined || props.active === true) return body;
  return <Pressable onPress={props.onUse} accessibilityRole="button" accessibilityLabel={`Use the code for ${props.title}`}>{body}</Pressable>;
}

function ProvenNumbers(props: { stats: ShowStats | undefined }): React.ReactElement {
  const s = props.stats;
  if (!s) return <Line size="line14">Proven — loading your numbers…</Line>;
  return (
    <>
      <Type step="row" className="text-text">{`${s.listeners} listened · ${plural(s.comments, 'comment')} · ${plural(s.episodes, 'episode')}`}</Type>
      {s.topMoments.length > 0 ? <Type step="caption" className="text-text3" style={STAGE_TYPE.small12}>Where people talk most</Type> : null}
      {s.topMoments.slice(0, 3).map((m) => (
        <Box key={m.episodeId + m.offsetMs} testID="proven-moment" className="flex-row items-center" style={{ gap: CREATOR.card.momentGap }} accessible accessibilityLabel={`${mmss(m.offsetMs)} · ${m.title} · ${m.comments}`}>
          <TimestampChip text={mmss(m.offsetMs)} />
          <Type step="note" className="text-text flex-1" numberOfLines={1}>{m.title}</Type>
          <Type step="mono" className="text-text3" style={STAGE_TYPE.small12}>{String(m.comments)}</Type>
        </Box>
      ))}
    </>
  );
}
