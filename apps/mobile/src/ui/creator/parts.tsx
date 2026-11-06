// The Creator centre's claim card: a show waiting for its code, or proven with its numbers.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `claimCard`, `creator--host-proven`, `creator--code-pending`, `creator--code-not-found`), restyled by spec 039 I2 on the
 * 038 tokens: a raise card (radius 24, 1 px line, 16 of padding, 12 between parts).
 *  - Pending: the cover (72, radius 16) with "PENDING · NOT PROVEN YET" in hot-text mono caps over the show's name (`heading` step), the three steps (`body`, text-2),
 *    the code at the `number` step spaced 0.04 em in the hot gradient (selectable; its spoken name "Your code: …"), and the answer to Verify in hot-text (announced).
 *  - Proven: the cover (88, radius 16) with "PROVEN — YOU ARE THE HOST" over the name; the numbers at the `strong` step ("120 listened · 14 comments · 32 episodes";
 *    "Proven — loading your numbers…" until they arrive); "Where people talk most" and up to three moments, each a timestamp chip, the episode and the comment count.
 * Not as drawn: the drawing's 46-tall curve of the whole show is left out — the app has no per-show curve to draw it from, and a made-up one would pass for data.
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour, radius, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { plural } from '@socialmorning/social-core';
import type { ShowStats } from '@/social/api';
import { STAGE_TYPE } from '@/ui/wallet/measures';
import { Cap, GlowWords } from '@/ui/wallet/stage';
import { CREATOR } from './measures';

/** The code's letter spacing (0.04 em of the `number` step's 34). */
const CODE_TRACK = { letterSpacing: STAGE_TYPE.claimCode.letterSpacing } as const;

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
    <Box testID={pending ? 'claim-card-pending' : 'claim-card-proven'} className="bg-raise border border-line" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row, ...(props.active === true ? { borderColor: colour.hot } : null) }}>
      <Box className="flex-row items-end" style={{ gap: spacing.row }}>
        <Box className="overflow-hidden" testID="claim-cover" style={{ width: cover, height: cover, borderRadius: radius.row }}>
          <Artwork url={props.imageUrl} size={cover} name={props.title} />
        </Box>
        <Box className="flex-1" style={{ gap: spacing.hair }}>
          <Cap>{pending ? 'Pending · not proven yet' : 'Proven — you are the host'}</Cap>
          <Type step="heading" className="text-text" numberOfLines={3}>{props.title}</Type>
        </Box>
      </Box>
      {pending ? (
        <>
          <Type step="body" className="text-text2">1. Copy this code. 2. Put it anywhere in your show description, in your hosting service. 3. Tap Verify.</Type>
          <GlowWords text={props.code} step="number" style={CODE_TRACK} selectable testID="claim-code" accessibilityLabel={`Your code: ${props.code}`} />
          {props.note ? <Type step="body" className="text-hotText" accessibilityLiveRegion="polite">{props.note}</Type> : null}
        </>
      ) : <ProvenNumbers stats={props.stats} />}
    </Box>
  );
  if (!pending || props.onUse === undefined || props.active === true) return body;
  return <Pressable onPress={props.onUse} accessibilityRole="button" accessibilityLabel={`Use the code for ${props.title}`}>{body}</Pressable>;
}

function ProvenNumbers(props: { stats: ShowStats | undefined }): React.ReactElement {
  const s = props.stats;
  if (!s) return <Type step="body" className="text-text2">Proven — loading your numbers…</Type>;
  return (
    <>
      <Type step="strong" className="text-text">{`${s.listeners} listened · ${plural(s.comments, 'comment')} · ${plural(s.episodes, 'episode')}`}</Type>
      {s.topMoments.length > 0 ? <Type step="small" className="text-text3">Where people talk most</Type> : null}
      {s.topMoments.slice(0, 3).map((m) => (
        <Box key={m.episodeId + m.offsetMs} testID="proven-moment" className="flex-row items-center" style={{ gap: spacing.gap }} accessible accessibilityLabel={`${mmss(m.offsetMs)} · ${m.title} · ${m.comments}`}>
          <TimestampChip text={mmss(m.offsetMs)} />
          <Type step="body" className="text-text flex-1" numberOfLines={1}>{m.title}</Type>
          <Type step="time" className="text-text3">{String(m.comments)}</Type>
        </Box>
      ))}
    </>
  );
}
