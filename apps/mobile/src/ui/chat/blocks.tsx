// The centred state blocks of the social pages: signed out (lock), could not load (wifi), and the error tile.
/**
 * M31 W4-C (T052; design-pulse2 `social.html` `signIn`, `errBlock`, `center`; discover.html `errTile`). Each block takes its button as
 * `children`, so the page that owns the action keeps its Pressable (the action inventory reads it there).
 *
 *  - `SignInBlock`: a 64 raise circle with a lock (26), the line in Unbounded 700 18, centred, and the light Sign in (at least 200 wide).
 *  - `ErrBlock`: the same with a wifi mark in hot text (28) and, if the page gives one, a light Retry.
 *  - `ErrTile`: a raise tile (radius 22, a 1 px line, padding 16) in the Mosaic lane (28 left, 16 right): a warning mark and the
 *    sentence in Geist 500 15, and the quiet 40 Retry under it.
 *
 * `CenterAt` places a block `top` from the phone's top (the drawing's `center(…, top)`), under the device's own status bar.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { belowStatus } from '@/ui/comments/measures';
import { useInsets } from '@/ui/comments/useInsets';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { CHAT } from './measures';

/** Puts a block `drawnTop` from the phone's top (measured on the 50 pt status bar), centred across the page. */
export function CenterAt(props: { top: number; children: ReactNode }): React.ReactElement {
  const insets = useInsets();
  return (
    <Box className="absolute items-center" style={{ left: CHAT.blockSide, right: CHAT.blockSide, top: belowStatus(insets.top, props.top), gap: CHAT.blockGap, zIndex: 5 }} testID="center-block">
      {props.children}
    </Box>
  );
}

function Disc(props: { children: ReactNode }): React.ReactElement {
  return <Box className="bg-raise items-center justify-center" style={{ width: CHAT.disc, height: CHAT.disc, borderRadius: CHAT.disc / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">{props.children}</Box>;
}

export function SignInBlock(props: { line: string; children?: ReactNode }): React.ReactElement {
  return (
    <Box className="items-center" style={{ gap: CHAT.blockGap, paddingHorizontal: CHAT.blockPadX }} testID="signin-block">
      <Disc><Icon name="lock-closed-outline" size={CHAT.discLock} color={colour.text} /></Disc>
      <Type step="lede" className="text-text text-center">{props.line}</Type>
      {props.children ? <Box style={{ minWidth: CHAT.signInWidth }}>{props.children}</Box> : null}
    </Box>
  );
}

export function ErrBlock(props: { line: string; children?: ReactNode }): React.ReactElement {
  return (
    <Box className="items-center" style={{ gap: CHAT.blockGap, paddingHorizontal: CHAT.blockPadX }} accessibilityLiveRegion="polite" testID="err-block">
      <Disc><Icon name="wifi" size={CHAT.discWifi} color={colour.hotText} /></Disc>
      <Type step="lede" className="text-text text-center">{props.line}</Type>
      {props.children}
    </Box>
  );
}

export function ErrTile(props: { line: string; children?: ReactNode }): React.ReactElement {
  return (
    <Box
      testID="err-tile"
      className="bg-raise border border-line"
      style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, borderRadius: CHAT.tileRadius, padding: CHAT.tilePad, gap: CHAT.tileInnerGap }}
      accessibilityLiveRegion="polite"
    >
      <Box className="flex-row items-start" style={{ gap: ME_MOSAIC.rowGap - 2 }}>
        <Icon name="alert-circle-outline" size={22} color={colour.warn} />
        <Type step="body" className="text-text font-medium flex-1">{props.line}</Type>
      </Box>
      {props.children}
    </Box>
  );
}
