// Draws a listener's placed stickers over the top of their profile header, for every viewer; touches pass through.
/**
 * M21 US9 — the sticker canvas is OUR OWN DESIGN (owner, 2026-10-06). This is the read-only side:
 * the same box the decorate page edits (`ASPECT` × the width, `src/me/sticker-layout.ts`), laid
 * over the top of the profile header, so a layout saved on one phone looks the same on another.
 * Decoration only: it takes no touches; a screen reader hears one line naming the stickers.
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { STICKER_LOOK } from '@/me/stickers';
import { ASPECT, box, type Placement } from '@/me/sticker-layout';

/** One sticker: a yellow disc with a white rim and its icon, centred on its place and turned. */
export function StickerFace(props: { placement: Placement; width: number; selected?: boolean }): React.ReactElement | null {
  const c = useColours();
  const look = STICKER_LOOK[props.placement.stickerId];
  if (!look) return null;
  const b = box(props.placement, props.width);
  return (
    <Box
      className={`absolute rounded-pill bg-primary items-center justify-center border-2 ${props.selected ? 'border-accent' : 'border-surface'}`}
      style={{ left: b.cx - b.side / 2, top: b.cy - b.side / 2, width: b.side, height: b.side, zIndex: props.placement.z, transform: [{ rotate: `${props.placement.rot}rad` }] }}
    >
      <Icon name={look.icon} size={Math.max(8, b.side * 0.5)} color={c.onPrimary} />
    </Box>
  );
}

/** Spoken once for the whole layer: "Stickers: First hour, 10 hours listened." */
export function stickersSpoken(list: readonly Placement[]): string {
  const names = list.map((p) => STICKER_LOOK[p.stickerId]?.title).filter((t): t is string => t !== undefined);
  return `Stickers: ${names.join(', ')}`;
}

export function StickerLayer(props: { placements: readonly Placement[] | undefined }): React.ReactElement | null {
  const [width, setWidth] = useState(0);
  const list = props.placements ?? [];
  if (list.length === 0) return null;
  return (
    <Box
      className="absolute left-0 right-0 top-0 overflow-hidden"
      // First in the header in the code, drawn above it (zIndex), so the photo and name sit under the stickers.
      style={{ height: width * ASPECT, pointerEvents: 'none', zIndex: 10 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={stickersSpoken(list)}
    >
      {width > 0 ? list.map((p) => <StickerFace key={p.stickerId} placement={p} width={width} />) : null}
    </Box>
  );
}
