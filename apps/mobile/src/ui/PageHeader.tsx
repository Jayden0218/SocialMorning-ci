/**
 * M16a T001 (FR-012, owner 2026-10-02, said twice): every stack page draws the app's own top
 * bar — never the iOS native header with its "‹ Back" pill. Built on `TopBar`, so the back
 * button is the same one the show, episode and player pages already draw (the ← glyph, 48 pt),
 * and the title has the old native title's style: `fontSize.base`, bold, the text token,
 * centred. The bar sits on the app background and pads itself by the status bar (safe-area top).
 *
 * M17 (constitution v3.0.0, `Followers-B` / `SettingsMore-B`): the Editorial header — the back
 * row first, then the page's name under it as a 32 pt serif title (`font-display`), left-aligned,
 * with an optional `subtitle`. A page that passes its own `middle` (Favourites' two tabs) keeps
 * that in the bar and draws no big title.
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
  /** M17: one secondary line under the title. */
  subtitle?: string;
  /** Icon buttons on the right (use `BarButton`). */
  right?: React.ReactNode;
  /** Replaces the back button, e.g. a modal page's "Cancel". */
  left?: React.ReactNode;
  onBack?: () => void;
}): React.ReactElement {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="bg-background">
      <TopBar onBack={props.onBack ?? goBack} {...(props.left ? { left: props.left } : {})} {...(props.middle ? { middle: props.middle } : {})}>
        {props.right ?? <Box style={SIDE} />}
      </TopBar>
      {props.middle ? null : (
        <Box className="px-screen-x pb-row">
          <Text className="text-text text-display font-display" numberOfLines={2} accessibilityRole="header">{props.title ?? ''}</Text>
          {props.subtitle ? <Text className="text-muted text-meta mt-1">{props.subtitle}</Text> : null}
        </Box>
      )}
    </SafeAreaView>
  );
}
