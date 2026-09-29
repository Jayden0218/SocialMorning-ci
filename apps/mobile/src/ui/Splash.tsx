/**
 * The launch screen (owner, 2026-09-27). Drawn **over** the stack, not instead of it:
 * the router stays mounted, so a link that opened the app (M4) still lands on its
 * screen underneath and is there when this lifts. Just the app icon, centred.
 *
 * It must match the native launch screen (app.json, `expo-splash-screen`) exactly — same
 * image, 192 wide, same background — so the hand-off from one to the other cannot be seen
 * (owner, 2026-09-29: a 120-wide native icon then this 192 one read as two splash screens).
 * The corners are baked into `splash-icon.png`, since the native screen cannot round them.
 */
import { Image, View } from "react-native";

/** Keep equal to `imageWidth` of the `expo-splash-screen` plugin in app.json. */
export const SPLASH_ICON_WIDTH = 192;
const ICON = { width: SPLASH_ICON_WIDTH, height: SPLASH_ICON_WIDTH };

export function Splash(): React.ReactElement {
  return (
    <View
      className="absolute inset-0 bg-background items-center justify-center"
      accessible
      accessibilityLabel="SocialNet is loading"
    >
      <Image
        source={require("../../assets/splash-icon.png")}
        style={ICON}
      />
    </View>
  );
}
