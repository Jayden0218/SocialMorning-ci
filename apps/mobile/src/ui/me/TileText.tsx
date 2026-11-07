// Words on a Me tile: the Pulse type step, named a Text so the action inventory can read a tile's name from it.
/**
 * M31 T033: the action inventory (scripts/action-inventory.mjs) names a tappable by its `accessibilityLabel`, else by the first
 * `<…Text>` child it finds. The Me tab's big tiles are built from a Link and a Pressable whose spoken label is a long sentence
 * ("Saved moments, 3. Save a moment…"), so the tile's short name — "Saved moments", "SocialNet PLUS" — comes from this child, as
 * it did when the tile used `Text`. It is `Type` with another name; nothing else.
 */
import { Type } from '@/ui/kit/Type';

export const TileText = Type;
