// Show info's parts: a group of rows in one raise tile, the breathing ghost while a lookup is slow, and the inline error tile.
/**
 * M31 W3-A (T040; design-pulse2 `group()`, `ghost()` and the `show-info--error` tile in `listen.html` / `kit.js`).
 *
 * A group is one raise tile (radius 20, edges clipped); each row is 56 tall at least, 12 / 14 of padding, with a 34 square
 * icon tile (raise2, radius 11, the glyph in hot-text 18), the name in Geist 600 15, the detail in text2 12 under it (the long
 * feed address wraps and can be selected), and — on the right — whatever the row offers (a Copy pill). A 1 px rule divides
 * the rows (`rowRule`), full width from the icon.
 *
 * The ghost is `rows` blocks (a 64 tall one, then two 14 tall lines, repeating; radii 18 and 7; widths 100, 70, 88, 100, 60 %)
 * in raise2 that breathe, opacity 1 → 0.5 over 2.4 s — a still block with Reduce Motion. The error tile is raise with a hot-tinted
 * 1 px line, the alert glyph in hot-text 22 and today's sentence in Geist 500 14/1.4.
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { colour, motion } from '@/design';
import { player } from '@/design/tokens';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { EPISODE } from '@/ui/episode/measures';

const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

export type InfoRowSpec = { icon: IconName; title: string; detail?: string; selectable?: boolean; right?: React.ReactNode; /** What a screen reader says for the row when it differs. */ label?: string };

export function InfoGroup(props: { rows: readonly InfoRowSpec[] }): React.ReactElement {
  return (
    <Box testID="info-group" className="bg-raise overflow-hidden" style={{ borderRadius: EPISODE.infoTile.radius }}>
      {props.rows.map((r, i) => (
        <Box key={r.title} testID="info-row" accessible={r.right === undefined} accessibilityLabel={r.right === undefined ? (r.label ?? (r.detail ? `${r.title}: ${r.detail}` : r.title)) : undefined} className="flex-row items-center" style={{ minHeight: EPISODE.infoTile.row, paddingVertical: player.panelRowPadY, paddingHorizontal: EPISODE.infoTile.pad, gap: player.rowGap, ...(i > 0 ? { borderTopWidth: 1, borderTopColor: player.rowRule } : null) }}>
          <Box {...HIDE} className="items-center justify-center bg-raise2" style={{ width: EPISODE.infoTile.icon, height: EPISODE.infoTile.icon, borderRadius: EPISODE.infoTile.iconRadius }}>
            <Icon name={r.icon} size={player.panelIconGlyph} color={colour.hotText} />
          </Box>
          <Box className="flex-1 min-w-0">
            <Type step="row" className="text-text">{r.title}</Type>
            {r.detail ? <Type step="caption" className="text-text2" selectable={r.selectable === true} style={{ marginTop: player.detailGap, fontSize: player.panelDetail, lineHeight: player.panelDetailLine }}>{r.detail}</Type> : null}
          </Box>
          {r.right}
        </Box>
      ))}
    </Box>
  );
}

const WIDTHS = ['100%', '70%', '88%', '100%', '60%'] as const;
const BIG = 64;
const SMALL = 14;

/** The breathing blocks of a slow lookup. */
export function InfoGhost(props: { rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const breathe = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) { breathe.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, breathe]);
  const rows = props.rows ?? 4;
  return (
    <Box testID="info-ghost" accessibilityLabel="Loading" accessibilityLiveRegion="polite" className="gap-row">
      {Array.from({ length: rows }, (_, k) => (
        <Animated.View key={k} className="bg-raise2" style={{ opacity: breathe, height: k % 3 === 0 ? BIG : SMALL, width: WIDTHS[k % WIDTHS.length], borderRadius: k % 3 === 0 ? EPISODE.pictureRadius : colourRadius }} />
      ))}
    </Box>
  );
}
const colourRadius = 7;

/** Today's words for a lookup that failed, in a tile with a hot-tinted line. */
export function InfoError(props: { children: string }): React.ReactElement {
  return (
    <Box testID="info-error" accessibilityLiveRegion="polite" className="bg-raise flex-row items-start" style={{ borderRadius: EPISODE.infoTile.radius, padding: EPISODE.infoTile.pad + 2, gap: player.rowGap, borderWidth: 1, borderColor: EPISODE.errorLine }}>
      <Box {...HIDE}><Icon name="alert-circle-outline" size={22} color={colour.hotText} /></Box>
      <Type step="note" className="flex-1 text-text">{props.children}</Type>
    </Box>
  );
}
