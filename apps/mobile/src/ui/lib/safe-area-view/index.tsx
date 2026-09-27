// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/safe-area-view. Edits are marked // M9:.
'use client';
import { SafeAreaView as ContextSafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

// M9: UniWind only reads className on react-native's own components, so the context version
// is wrapped — without it `flex-1 bg-background` on every screen root would be dropped.
export const SafeAreaView = withUniwind(ContextSafeAreaView);
