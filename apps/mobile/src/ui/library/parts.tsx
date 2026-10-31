// Small parts the Updates tab and My subscriptions share: a cover with the drawn corner.
/**
 * M31 D-A (design-pulse2 `index.html#updates--screen` Starred covers 52 / radius 14, `listen.html` `subTiles`, the show menu's head 56 / 14).
 * `Artwork` picks its corner by size (12 at 52–64); the drawings round these covers at 14, so the cover sits in a box with that corner.
 */
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';

export function Cover(props: { url?: string | null | undefined; name: string; size: number; radius: number }): React.ReactElement {
  return (
    <Box testID="lib-cover" className="overflow-hidden" style={{ width: props.size, height: props.size, borderRadius: props.radius }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Artwork url={props.url ?? null} size={props.size} name={props.name} />
    </Box>
  );
}
