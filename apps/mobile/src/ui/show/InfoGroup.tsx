// Show info's parts: a group of rows in one raise tile, the breathing ghost while a lookup is slow, and the inline error tile.
/**
 * M31 W3-A (T040; design-pulse2 `group()`, `ghost()` and the `show-info--error` tile), restyled by spec 039 I2 on the 038 tokens.
 *
 * A group is one raise panel (radius 16, edges clipped); each row is 56 tall at least, 16 of padding across and 12 down, with a 34 square
 * icon tile (raise2, radius 12, the glyph in hot-text 18), the name at the `strong` step, the detail at the `small` step in text2 under it (the
 * long feed address wraps and can be selected), and, on the right, whatever the row offers (a Copy pill). A 1 px rule divides the rows.
 *
 * The ghost is `rows` blocks (a 64 tall one, then two 16 tall lines, repeating; radius 16 and 8; widths 100, 70, 88, 100, 60 %)
 * in raise2 that breathe, opacity 1 → 0.5 over 2.4 s — a still block with Reduce Motion. The error tile is a raise panel with a hot-tinted
 * 1 px line, the alert glyph in hot-text 22 and the sentence at the `body` step.
 */
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { colour, motion, radius, spacing } from '@/design';
import { player } from '@/design/tokens';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { EPISODE } from '@/ui/episode/measures';

const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

export type InfoRowSpec = { icon: IconName; title: string; detail?: string; selectable?: boolean; right?: React.ReactNode; /** What a screen reader says for the row when it differs. */ label?: string };

export function InfoGroup(props: { rows: readonly InfoRowSpec[] }): React.ReactElement {
  return (
    <Box testID="info-group" className="bg-raise overflow-hidden" style={{ borderRadius: radius.row }}>
      {props.rows.map((r, i) => (
        <Box key={r.title} testID="info-row" accessible={r.right === undefined} accessibilityLabel={r.right === undefined ? (r.label ?? (r.detail ? `${r.title}: ${r.detail}` : r.title)) : undefined} className="flex-row items-center" style={{ minHeight: EPISODE.infoTile.row, paddingVertical: player.panelRowPadY, paddingHorizontal: spacing.section, gap: spacing.row, ...(i > 0 ? { borderTopWidth: 1, borderTopColor: player.rowRule } : null) }}>
          <Box {...HIDE} className="items-center justify-center bg-raise2" style={{ width: EPISODE.infoTile.icon, height: EPISODE.infoTile.icon, borderRadius: radius.small }}>
            <Icon name={r.icon} size={player.panelIconGlyph} color={colour.hotText} />
          </Box>
          <Box className="flex-1 min-w-0">
            <Type step="strong" className="text-text">{r.title}</Type>
            {r.detail ? <Type step="small" className="text-text2" selectable={r.selectable === true} style={{ marginTop: spacing.hair / 2 }}>{r.detail}</Type> : null}
          </Box>
          {r.right}
        </Box>
      ))}
    </Box>
  );
}

const WIDTHS = ['100%', '70%', '88%', '100%', '60%'] as const;
const BIG = 64;
const SMALL = 16;

/** The breathing blocks of a slow lookup. */
export function InfoGhost(props: { rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const [breathe] = useState(() => new Animated.Value(1));
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
        <Animated.View key={k} className="bg-raise2" style={{ opacity: breathe, height: k % 3 === 0 ? BIG : SMALL, width: WIDTHS[k % WIDTHS.length], borderRadius: k % 3 === 0 ? radius.row : radius.chip }} />
      ))}
    </Box>
  );
}

/** Today's words for a lookup that failed, in a tile with a hot-tinted line. */
export function InfoError(props: { children: string }): React.ReactElement {
  return (
    <Box testID="info-error" accessibilityLiveRegion="polite" className="bg-raise flex-row items-start" style={{ borderRadius: radius.row, padding: spacing.section, gap: spacing.row, borderWidth: 1, borderColor: EPISODE.errorLine }}>
      <Box {...HIDE}><Icon name="alert-circle-outline" size={22} color={colour.hotText} /></Box>
      <Type step="body" className="flex-1 text-text">{props.children}</Type>
    </Box>
  );
}
