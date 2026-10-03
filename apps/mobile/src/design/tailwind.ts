// Lets links and gradients accept style class names like other components.
/**
 * UniWind turns `className` into `style` on React Native's own components by itself (its
 * Metro resolver swaps them). Anything else that takes a `style` is wrapped here once, and
 * screens import the wrapped version. Unlike NativeWind's `cssInterop`, `withUniwind`
 * returns a new component instead of patching the original in place (M9, research R1).
 */
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Link as ExpoLink } from 'expo-router';
import { withUniwind } from 'uniwind';

export const Link = withUniwind(ExpoLink);
export const LinearGradient = withUniwind(ExpoLinearGradient);
