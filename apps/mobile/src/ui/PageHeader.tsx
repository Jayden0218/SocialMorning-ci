/**
 * M16a T001 (FR-012, owner 2026-10-02, said twice): every stack page draws the app's own top
 * bar — never the iOS native header with its "‹ Back" pill. Built on `TopBar`, so the back
 * button is the same one the show, episode and player pages already draw (the ← glyph, 48 pt),
 * and the title has the old native title's style: `fontSize.base`, bold, the text token,
 * centred. The bar sits on the app background and pads itself by the status bar (safe-area top).
 *
 * Edge-swipe back still works: the stack keeps `gestureEnabled` per screen with
 * `headerShown: false` (expo-router's native-stack passes `gestureEnabled` to the screen
 * whatever the header does — react-navigation/native-stack/views/NativeStackView.native.js).
 */
import { router } from 'expo-router';
import { Box } from './lib/box';
import { Text } from './lib/text';
import { SafeAreaView } from './lib/safe-area-view';
import { hit } from '../design';
import { TopBar } from './TopBar';

/** The width the back button takes, mirrored on the right so the title stays centred. */
const SIDE = { minWidth: hit.min };

/** Back: the previous page, or the first page when a link opened this one cold. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function PageHeader(props: {
  /** The page's name, spoken as a header. */
  title?: string;
  /** Replaces the title, e.g. Favourites' two tabs. */
  middle?: React.ReactNode;
  /** Icon buttons on the right (use `BarButton`). */
  right?: React.ReactNode;
  /** Replaces the back button, e.g. a modal page's "Cancel". */
  left?: React.ReactNode;
  onBack?: () => void;
}): React.ReactElement {
  const middle = props.middle ?? (
    <Text className="flex-1 text-text text-base font-bold text-center" numberOfLines={1} accessibilityRole="header">{props.title ?? ''}</Text>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="bg-background">
      <TopBar onBack={props.onBack ?? goBack} {...(props.left ? { left: props.left } : {})} middle={middle}>
        {props.right ?? <Box style={SIDE} />}
      </TopBar>
    </SafeAreaView>
  );
}
