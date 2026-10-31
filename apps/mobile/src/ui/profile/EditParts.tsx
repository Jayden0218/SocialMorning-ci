// The small parts of Edit profile: a field tile, a small chip, the photo and its chips.
/**
 * M31 W4-A (T050; design-pulse2 social.html `ptile`, `profile-edit--screen`):
 *  - `FieldTile`: raise, radius 20, padding 12 / 14, 8 between parts — a label (Geist 600 12, text2), the field, a note (12 text3).
 *  - `smallChip(chosen)`: the props of a 32 tall chip, 11 of padding, Geist 600 12; chosen = the light chip with void words. The touch
 *    reaches 48 by `hitSlop`. The page puts them on its own `Pressable`s, so each keeps its name and handler in the page's file.
 *  - `PhotoRing`: the photo, 88 with a 3 light ring; `photoChip` the props of the chips under it ("Change photo" with a camera, "Remove photo" in text2).
 */
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PROFILE, PROFILE_TYPE } from './measures';

export function FieldTile(props: { label: string; children: React.ReactNode; note?: string; noteHot?: boolean; testID?: string }): React.ReactElement {
  return (
    <Box testID={props.testID ?? 'field-tile'} className="bg-raise" style={{ borderRadius: PROFILE.tileRadius, paddingVertical: PROFILE.tilePadY, paddingHorizontal: PROFILE.tilePadX, gap: PROFILE.tileGap }}>
      <Type step="chip" className="text-text2" style={PROFILE_TYPE.label12} accessibilityRole="header">{props.label}</Type>
      {props.children}
      {props.note ? <Type step="caption" className={props.noteHot ? 'text-hotText' : 'text-text3'} style={PROFILE_TYPE.note12}>{props.note}</Type> : null}
    </Box>
  );
}

const SLOP = { top: 8, bottom: 8, left: 0, right: 0 };
const SMALL = { height: PROFILE.smallChipHeight, paddingHorizontal: PROFILE.smallChipPad };

/** Props for a `Pressable` that is a small chip. */
export function smallChip(chosen: boolean): { hitSlop: typeof SLOP; className: string; style: typeof SMALL; accessibilityState: { selected: boolean } } {
  return { hitSlop: SLOP, className: `rounded-pill items-center justify-center border ${chosen ? 'bg-text border-text' : 'bg-raise border-line'}`, style: SMALL, accessibilityState: { selected: chosen } };
}

export function ChipText(props: { chosen?: boolean; children: string }): React.ReactElement {
  return <Type step="chip" className={props.chosen ? 'text-void' : 'text-text'} numberOfLines={1}>{props.children}</Type>;
}

const CHIP_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };
const CHIP = { height: PROFILE.photoChip, paddingHorizontal: PROFILE.photoChipPad, gap: PROFILE.chipGap };

/** Props for a `Pressable` that is one of the chips under the photo. */
export const photoChip = { hitSlop: CHIP_SLOP, className: 'flex-row items-center rounded-pill border border-line bg-raise', style: CHIP } as const;

export function PhotoRing(props: { url: string | undefined; name: string | null | undefined }): React.ReactElement {
  return (
    <Box testID="photo-ring" className="border-text overflow-hidden items-center justify-center" style={{ width: PROFILE.photo, height: PROFILE.photo, borderRadius: PROFILE.photo / 2, borderWidth: PROFILE.photoRing }}>
      <Avatar size={PROFILE.photo - 2 * PROFILE.photoRing} url={props.url} name={props.name} />
    </Box>
  );
}

export function CameraMark(): React.ReactElement {
  return <Icon name="camera-outline" size={16} color={colour.text} />;
}
