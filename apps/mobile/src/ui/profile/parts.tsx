// The parts the profile-side pages share: the centred sign-in / error block and a person's name.
/**
 * Spec 039 I2: the 038 tokens only, no edge label. M31 W4-A's `MosaicList`, `GhostTiles`, `ErrorTile` and `CenterBlock` (the Mosaic lane, the edge labels and the
 * drawn-phone offsets) had no page left drawing them once the profile pages moved onto `Page`/`PageList`, and are gone with `evenList`.
 *  - `IconBlock`: a 64 raise disc with a mark (hot-text for a failure), the line at the `lede` step, and the page's action under it (a light button, 200 wide at least).
 *  - `NameText`: a person's name in a step of the type scale.
 */
import { Box } from '@/ui/lib/box';
import { colour, spacing, type TypeName } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PROFILE } from './measures';

const BUTTON_MIN = { minWidth: PROFILE.blockButton, marginTop: spacing.hair } as const;

/** `children` is the block's action (a light button): the page writes it, so the page's file names it. */
export function IconBlock(props: { icon: IconName; failure?: boolean; line: string; children?: React.ReactNode; testID?: string }): React.ReactElement {
  return (
    <Box className="items-center" style={{ gap: spacing.row, paddingHorizontal: spacing.row }} testID={props.testID ?? 'icon-block'}>
      <Box className="bg-raise items-center justify-center" style={{ width: PROFILE.disc, height: PROFILE.disc, borderRadius: PROFILE.disc / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={props.icon} size={PROFILE.discIcon} color={props.failure ? colour.hotText : colour.text} />
      </Box>
      <Type step="lede" className="text-text text-center" accessibilityRole="header">{props.line}</Type>
      {props.children ? <Box style={BUTTON_MIN}>{props.children}</Box> : null}
    </Box>
  );
}

/**
 * A person's name on a tile or a card, in a step of the type scale. It is `Type` under a name the action inventory reads as text
 * (`scripts/action-inventory.mjs` names a link by its first `…Text` child), so a link keeps being named by the name it shows.
 */
export function NameText(props: { step: TypeName; /** A deleted account: text2, in italics. */ muted?: boolean; /** Layout classes only (`flex-1`). */ layout?: string; numberOfLines?: number; children: string }): React.ReactElement {
  return <Type step={props.step} className={`${props.muted === true ? 'text-text2 italic' : 'text-text'} ${props.layout ?? ''}`} {...(props.numberOfLines !== undefined ? { numberOfLines: props.numberOfLines } : {})}>{props.children}</Type>;
}
