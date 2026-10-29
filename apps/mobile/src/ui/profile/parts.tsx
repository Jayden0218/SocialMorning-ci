// The parts the profile-side pages share: the mosaic list, the centred sign-in / error block, ghost tiles, the inline error tile.
/**
 * M31 W4-A (T050; design-pulse2 social.html `mosaic()`, `center()`, `errBlock()`, `signIn()`):
 *  - `MosaicList`: two columns in the Me tab's lane (28 left, 16 right), 10 apart, an odd last tile gets an empty partner so
 *    it keeps a half width; an edge label sits beside the first row, `header` goes above the first row (the stickers' hero tile).
 *  - `IconBlock`: a 64 raise disc with a mark (hot-text for a failure), the line in Unbounded 18, and a light 48 button (200 wide at least).
 *  - `CenterBlock`: puts a block `drawn` from the top of the drawn phone, 24 from each side, centred.
 *  - `GhostTiles`: raise tiles breathing while a mosaic loads.
 *  - `ErrorTile`: the inline "Couldn't load … right now." tile at the top of a mosaic, with a light 40 Retry.
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { colour, motion, spacing, type TypeName } from '@/design';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { ME_MOSAIC, HALF } from '@/ui/me/mosaic';
import { DRAWN } from '@/ui/me/lists';
import { PROFILE } from './measures';

const BUTTON_MIN = { minWidth: PROFILE.blockButton, marginTop: spacing.hair } as const;

/** Where a block drawn `drawn` from the top of the phone sits under the status bar (`top`). */
export function CenterBlock(props: { top: number; drawn: number; children: React.ReactNode }): React.ReactElement {
  return (
    <Box className="items-center" style={{ marginTop: props.top + props.drawn - DRAWN.status, paddingHorizontal: PROFILE.blockSide, gap: PROFILE.blockGap }}>
      {props.children}
    </Box>
  );
}

/** `children` is the block's action (a light button): the page writes it, so the page's file names it. */
export function IconBlock(props: { icon: IconName; failure?: boolean; line: string; children?: React.ReactNode; testID?: string }): React.ReactElement {
  return (
    <Box className="items-center" style={{ gap: PROFILE.blockGap, paddingHorizontal: spacing.row }} testID={props.testID ?? 'icon-block'}>
      <Box className="bg-raise items-center justify-center" style={{ width: PROFILE.disc, height: PROFILE.disc, borderRadius: PROFILE.disc / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={props.icon} size={PROFILE.discIcon} color={props.failure ? colour.hotText : colour.text} />
      </Box>
      <Type step="lede" className="text-text text-center" accessibilityRole="header">{props.line}</Type>
      {props.children ? <Box style={BUTTON_MIN}>{props.children}</Box> : null}
    </Box>
  );
}

/** Ghost tiles while a mosaic loads: raise, breathing, in the mosaic's own lane. */
export function GhostTiles(props: { count?: number; rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) { o.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, o]);
  const n = props.count ?? 6;
  const pairs = Array.from({ length: Math.ceil(n / 2) }, (_, k) => k);
  return (
    <Box accessible accessibilityLabel="Loading" accessibilityLiveRegion="polite" testID="ghost-tiles" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: ME_MOSAIC.gap }}>
      {pairs.map((k) => (
        <Box key={k} className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
          {[0, 1].map((j) => <Animated.View key={j} style={{ ...HALF, height: ME_MOSAIC.row * (props.rows ?? 1) + ME_MOSAIC.gap * ((props.rows ?? 1) - 1), borderRadius: ME_MOSAIC.radius, backgroundColor: colour.raise, opacity: o }} />)}
        </Box>
      ))}
    </Box>
  );
}

/** `children` is the Retry button (the page writes it, so its file names the action). */
export function ErrorTile(props: { line: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box testID="error-tile" className="bg-raise items-start" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, padding: PROFILE.errorPad, gap: PROFILE.errorGap, borderRadius: ME_MOSAIC.radius }} accessibilityLiveRegion="polite">
      <Type step="row" className="text-text">{props.line}</Type>
      {props.children}
    </Box>
  );
}

const FILLER = { __filler: true } as const;
type Filler = typeof FILLER;
const isFiller = (x: unknown): x is Filler => typeof x === 'object' && x !== null && (x as { __filler?: boolean }).__filler === true;

/** Pure: a list made even, so the last tile keeps a half width. */
export function evenList<T>(items: readonly T[]): (T | Filler)[] {
  return items.length % 2 === 1 ? [...items, FILLER] : [...items];
}

export function MosaicList<T>(props: {
  data: readonly T[];
  keyOf: (item: T) => string;
  renderTile: (item: T) => React.ReactElement;
  /** The status bar's height (`layout.top`); the list starts `mosaicTop - 50` under it. */
  top: number;
  reserve: number;
  /** Edge labels: the text and its distance from the top of the mosaic. */
  labels: readonly { text: string; top: number }[];
  /** Above the first row (inside the lane): the stickers' hero tile. Its height, so a label can sit beside the rows. */
  header?: React.ReactNode;
  footer?: React.ReactElement | null;
  onEnd?: () => void;
  empty?: React.ReactElement | null;
  testID?: string;
}): React.ReactElement {
  const rows = evenList(props.data);
  return (
    <FlatList
      testID={props.testID ?? 'mosaic'}
      className="flex-1"
      data={rows as (T | Filler)[]}
      numColumns={2}
      keyExtractor={(item, i) => (isFiller(item) ? `filler-${i}` : props.keyOf(item as T))}
      columnWrapperStyle={{ gap: ME_MOSAIC.gap, marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}
      ItemSeparatorComponent={() => <Box style={{ height: ME_MOSAIC.gap }} />}
      contentContainerStyle={{ paddingTop: props.top + PROFILE.mosaicTop - DRAWN.status, paddingBottom: props.reserve, flexGrow: 1 }}
      ListHeaderComponent={(
        <Box>
          {props.labels.map((l) => <EdgeLabel key={l.text} label={l.text} top={l.top} />)}
          {props.header ? <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, marginBottom: ME_MOSAIC.gap }}>{props.header}</Box> : null}
        </Box>
      )}
      ListEmptyComponent={props.empty ?? undefined}
      ListFooterComponent={props.footer ?? undefined}
      onEndReached={props.onEnd}
      renderItem={({ item }) => (isFiller(item) ? <Box style={HALF} accessible={false} /> : <Box style={HALF}>{props.renderTile(item as T)}</Box>)}
    />
  );
}

/**
 * A person's name on a tile or a card, in a step of the type scale. It is `Type` under a name the action inventory reads as text
 * (`scripts/action-inventory.mjs` names a link by its first `…Text` child), so a link keeps being named by the name it shows.
 */
export function NameText(props: { step: TypeName; /** A deleted account: text2, in italics. */ muted?: boolean; /** Layout classes only (`flex-1`). */ layout?: string; numberOfLines?: number; children: string }): React.ReactElement {
  return <Type step={props.step} className={`${props.muted === true ? 'text-text2 italic' : 'text-text'} ${props.layout ?? ''}`} {...(props.numberOfLines !== undefined ? { numberOfLines: props.numberOfLines } : {})}>{props.children}</Type>;
}
