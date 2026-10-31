// The pieces of a listener's profile page: the Stage, the tiles of the Numbers grid, the collapsed name and the bottom zone.
/**
 * M31 D-C (design-pulse2 `social.html` `profile--screen`, `--own`, `--host`, `--blocked`, `--suspended`, `--stats-empty`; layout pattern Stage, then
 * a Mosaic). Read off the drawing:
 *  - Stage: the two-colour glow (hot then violet; a host's leans violet first; 50 %, or 15 % on a blocked or suspended page), the photo 104 inside a
 *    3 light ring (a suspended account's ring is the line colour at half strength), the name in Unbounded 800 26, then "This is you" /
 *    "Host of 《…》 and 1 more show" / "IP location: …" (mono 11) / the bio (14 / 20, text2), all centred and 40 in from the sides.
 *    The stickers they placed float over it (`StickerLayer`, as on every viewer's screen).
 *  - Tiles: the Numbers grid's tiles are raise, radius 22, padding 14, at least 84 tall (the Me tab's `ME_MOSAIC`). Listening time is a 2 x 1
 *    tile in a hot-tinted gradient: the mono label in hot-text, the total in Unbounded 800 28 and the small facts on the right.
 *  - Bottom zone: back (44) then the page's actions, 10 apart, on a fade; the title bar's spot (40 on a pushed page, 108 with the now bar).
 *  - Collapsed: once the name scrolls away, the photo 28 and the name join the status-bar strip.
 * Not as drawn: RN has no blur, so the glow is the kit's radial gradient (`PageGlow`); the Listening time tile's 120deg gradient is a linear
 * one from the premium tint to the raise fill.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { bars, colour, gutter, spacing } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Fade } from '@/ui/kit/Fade';
import { PageGlow } from '@/ui/kit/PageGlow';
import { Type } from '@/ui/kit/Type';
import { PAGE_TYPE } from '@/ui/discover/measures';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { useWindowDimensions } from 'react-native';
import { PROFILE_PAGE } from './measures';

/** The Stage's variants: the usual page, a blocked page (faint glow, one line) and a suspended one (also a faded ring). */
export type StageLook = 'normal' | 'blocked' | 'suspended';

export function ProfileStage(props: {
  /** The status bar's height. */
  top: number;
  name: string;
  avatarUrl?: string | null;
  look?: StageLook;
  host?: boolean;
  /** Under the name: "This is you", the host line, "IP location: …", the bio — each its own line, in order. */
  lines?: ReactNode;
  /** The single line of a blocked or suspended page ("You blocked this listener."). */
  quiet?: ReactNode;
  /** The PLUS badge, or any mark that sits right under the name. */
  badge?: ReactNode;
  /** The stickers the person placed. */
  stickers?: ReactNode;
}): React.ReactElement {
  const look = props.look ?? 'normal';
  const quiet = look !== 'normal';
  const faded = look === 'suspended';
  return (
    <Box testID="profile-stage" className="items-center" style={{ paddingTop: props.top + PROFILE_PAGE.stageTop, paddingHorizontal: PROFILE_PAGE.stageSide, gap: PROFILE_PAGE.lineGap }}>
      {props.stickers}
      <Box
        testID="profile-photo-ring"
        className={faded ? 'bg-line' : 'bg-text'}
        style={{ borderRadius: (PROFILE_PAGE.photo + 2 * PROFILE_PAGE.photoRing) / 2, padding: PROFILE_PAGE.photoRing, opacity: faded ? 0.5 : 1 }}
      >
        {/* The drawing's avatar has a 3 void border inside the ring. */}
        <Box className="bg-void" style={{ borderRadius: PROFILE_PAGE.photo / 2, padding: PROFILE_PAGE.photoInner }}>
          <Avatar size={PROFILE_PAGE.photo - 2 * PROFILE_PAGE.photoInner} url={props.avatarUrl} name={props.name} />
        </Box>
      </Box>
      <Type step="title" className="text-text text-center" style={[PAGE_TYPE.title26, { marginTop: PROFILE_PAGE.nameGap - PROFILE_PAGE.lineGap }]} accessibilityRole="header">{props.name}</Type>
      {props.badge}
      {quiet ? <Box style={{ marginTop: PROFILE_PAGE.quietLine }}>{props.quiet}</Box> : props.lines}
    </Box>
  );
}

/** The glow behind the Stage: hot first (violet first for a host), at full strength, or faint on a blocked or suspended page. */
export function ProfileGlow(props: { look?: StageLook; host?: boolean }): React.ReactElement {
  const quiet = (props.look ?? 'normal') !== 'normal';
  return <PageGlow tone="hot" top={PROFILE_PAGE.glowTop} strength={quiet ? PROFILE_PAGE.glowQuiet : PROFILE_PAGE.glowStrength} flip={props.host === true} />;
}

/** The Numbers grid's lane: 28 on the left for the edge label, 16 on the right. */
export const LANE = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right } as const;

/** A tile of the grid: raise, radius 22, padding 14, at least `rows` of 84 tall (a row is 84 and 10 between). */
export function ProfileTile(props: { rows?: number; children: ReactNode; testID?: string; tone?: 'raise' | 'hot' }): React.ReactElement {
  const rows = props.rows ?? 1;
  const style = { minHeight: rows * ME_MOSAIC.row + (rows - 1) * ME_MOSAIC.gap, padding: ME_MOSAIC.pad, borderRadius: ME_MOSAIC.radius, overflow: 'hidden' as const };
  if (props.tone === 'hot') {
    return (
      <LinearGradient testID={props.testID ?? 'profile-tile'} colors={[colour.premiumTint, colour.raise]} start={{ x: 0, y: 0.25 }} end={{ x: 1, y: 0.75 }} style={style}>
        {props.children}
      </LinearGradient>
    );
  }
  return <Box testID={props.testID ?? 'profile-tile'} className="bg-raise" style={style}>{props.children}</Box>;
}

/** The mono label at a tile's top ("LISTENING TIME", "MY STICKERS · 3 EARNED"). */
export function TileLabel(props: { text: string; hot?: boolean }): React.ReactElement {
  return <Type step="tag" className={props.hot === true ? 'text-hotText' : 'text-text3'} style={ME_TYPE.mono11} accessibilityRole="header">{props.text}</Type>;
}

/** Listening time as a 2 x 1 hot-tinted tile: the total, how many finished and (when there is one) this week. */
export function ListeningTile(props: { total: string; finished: number; week?: string; spoken: string }): React.ReactElement {
  return (
    <ProfileTile tone="hot" testID="listening-tile">
      <Box accessible accessibilityLabel={props.spoken}>
        <TileLabel text="LISTENING TIME" hot />
        <Box className="flex-row items-end justify-between" style={{ marginTop: spacing.gap, gap: spacing.row }}>
          <Type step="figure" className="text-text flex-1" style={PAGE_TYPE.count28} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{props.total}</Type>
          <Box className="items-end">
            <Type step="tag" className="text-text2" style={ME_TYPE.mono11}>{`${props.finished} finished`}</Type>
            {props.week ? <Type step="tag" className="text-text2" style={ME_TYPE.mono11}>{`This week: ${props.week}`}</Type> : null}
          </Box>
        </Box>
      </Box>
    </ProfileTile>
  );
}

/** A listening tile that says why there is no total: private, or nothing played yet. */
export function ListeningNote(props: { line: string }): React.ReactElement {
  return (
    <ProfileTile testID="listening-note">
      <TileLabel text="LISTENING TIME" />
      <Type step="note" className="text-text" style={{ marginTop: PROFILE_PAGE.tileLabelGap }}>{props.line}</Type>
    </ProfileTile>
  );
}

/** The name and a 28 photo that join the status-bar strip once the head has scrolled away. */
export function CollapsedName(props: { top: number; name: string; avatarUrl?: string | null }): React.ReactElement {
  return (
    <Box testID="collapsed-name" className="absolute left-0 right-0 top-0 bg-void flex-row items-center justify-center" style={{ paddingTop: props.top, paddingBottom: spacing.gap, gap: spacing.gap, zIndex: 25 }} accessible accessibilityLabel={props.name}>
      <Avatar size={PROFILE_PAGE.collapsedAvatar} url={props.avatarUrl} name={props.name} />
      <Type step="row" className="text-text" numberOfLines={1}>{props.name}</Type>
    </Box>
  );
}

/** The bottom zone: the fade, then the row of actions at the title bar's spot (back first). */
export function ProfileFoot(props: { bottom: number; children: ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <>
      <Fade bottom={0} height={260 + (props.bottom - bars.pushedGap)} />
      <Box testID="profile-foot" className="absolute left-0 right-0 flex-row items-center" style={{ bottom: props.bottom, paddingHorizontal: gutter(width), gap: PROFILE_PAGE.barGap, zIndex: 20 }}>
        {props.children}
      </Box>
    </>
  );
}

/**
 * A section under an edge label (design-pulse2 `sec(label, inner)`): 2 of padding above, the label 4 down in the 28 lane (20 down for the
 * Numbers grid), at least 120 tall, 18 below. `spoken` is the section's name for a screen reader when the label carries a count.
 */
export function ProfileSection(props: { label: string; spoken?: string; edgeTop?: number; bottom?: number; children: ReactNode; testID?: string }): React.ReactElement {
  return (
    <Box testID={props.testID} style={{ paddingTop: 2, paddingBottom: props.bottom ?? 18, minHeight: 120 }}>
      <EdgeLabel label={props.label} {...(props.spoken ? { spoken: props.spoken } : {})} top={props.edgeTop ?? 4} />
      {props.children}
    </Box>
  );
}
