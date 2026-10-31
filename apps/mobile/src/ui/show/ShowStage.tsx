// The top of the Show screen: the show's art to the fold, fading to the page colour.
/**
 * M31 W3-A2 (T040; design-pulse2 `showBody`): "The show art fills the top 300 and fades to void": the art 300 tall at 85 %, under a
 * veil that goes from clear to void over 310 (the drawn `linear-gradient(rgba(6,6,8,.1), #060608)`). The art is the show's own cover
 * (`Artwork`, drawn square at the window's width and cropped by the box, so its middle shows), else the made-for-you tile. Decoration
 * only: the title and everything else are in the thumb zone.
 */
import { useWindowDimensions } from 'react-native';
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { SHOW } from './measures';

const VEIL = [colour.scrimTop, colour.void] as const;

export function ShowStage(props: { url: string | undefined; name: string | undefined }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <Box testID="show-stage" className="absolute left-0 right-0 top-0" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ height: SHOW.veilHeight }}>
      <Box className="absolute overflow-hidden" style={{ left: 0, right: 0, top: 0, height: SHOW.stageHeight, opacity: SHOW.stageOpacity }}>
        <Artwork url={props.url ?? null} size={width} {...(props.name !== undefined ? { name: props.name } : {})} />
      </Box>
      <LinearGradient testID="show-veil" colors={VEIL} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: SHOW.veilHeight }} />
    </Box>
  );
}
