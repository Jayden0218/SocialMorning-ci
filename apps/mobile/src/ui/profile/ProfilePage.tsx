// The pieces of a listener's profile page: the header, and the tiles of the Numbers grid.
/**
 * Spec 039 (Detail template, design B): the page is a `DetailPage`; the header is the photo in a light ring, the name and their lines, centred in
 * the page's flow (the glow, the status-bar offset, the collapsed name, the bottom zone with its fade and the edge-labelled sections are gone: the
 * actions sit under the header and each block is a `Section`). Before that, M31 D-C (design-pulse2 `social.html` `profile--screen` ...), read off the drawing:
 *  - Header: the photo 104 inside a 3 light ring (a suspended account's ring is the line colour at half strength), the name, then "This is you" /
 *    "Host of 《…》 and 1 more show" / "IP location: …" (mono 11) / the bio (14 / 20, text2), all centred. The stickers they placed float over it
 *    (`StickerLayer`, as on every viewer's screen).
 *  - Tiles: the Numbers grid's tiles are raise, radius 22, padding 14, at least 84 tall . Listening time is a 2 x 1
 *    tile in a hot-tinted gradient: the mono label in hot-text, the total and the small facts on the right.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, spacing } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { Type } from '@/ui/kit/Type';
import { PAGE_TYPE } from '@/ui/discover/measures';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { PROFILE_PAGE } from './measures';

/** The header's variants: the usual page, a blocked page (one line) and a suspended one (also a faded ring). */
export type StageLook = 'normal' | 'blocked' | 'suspended';

export function ProfileStage(props: {
  name: string;
  avatarUrl?: string | null;
  look?: StageLook;
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
    <Box testID="profile-stage" className="items-center" style={{ gap: PROFILE_PAGE.lineGap }}>
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
      <Type step="title" className="text-text text-center" accessibilityRole="header">{props.name}</Type>
      {props.badge}
      {quiet ? <Box>{props.quiet}</Box> : props.lines}
    </Box>
  );
}

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
