/**
 * The launch screen (owner, 2026-09-27). Drawn **over** the stack, not instead of it:
 * the router stays mounted, so a link that opened the app (M4) still lands on its
 * screen underneath and is there when this lifts. Just the app icon, centred.
 */
import { Image } from './lib/image';
import { Box } from './lib/box';

const ICON = { width: 192, height: 192 };

export function Splash(): React.ReactElement {
  return (
    <Box
      className="absolute inset-0 bg-background items-center justify-center"
      accessible
      accessibilityLabel="SocialNet is loading"
    >
      <Image
        source={require("../../assets/app-icon.png")}
        style={ICON}
        className="rounded-artwork"
      />
    </Box>
  );
}
