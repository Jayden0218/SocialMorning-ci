// Pull a list down to reload it, showing the app's own loading sign.
/**
 * Pull to refresh with SocialNet's own loading mark (owner, 2026-10-01: "a custom loading
 * for my app, not the general spinner"). The platform RefreshControl stays for the gesture;
 * its spinner is made invisible, and the Loader sits behind the list in the gap the pull
 * opens. It fades in with the pull, so it shows only while the page is pulled or held open.
 *
 * Android's pull does not open a gap, so there the Loader is drawn at the top of the list
 * (`inline`) while refreshing.
 *
 * Use: put `backdrop` as the first child of a `flex-1` wrapper with the page's background,
 * then the list, without its own background, with `onScroll`, `scrollEventThrottle` and
 * `refreshControl`.
 */
import { useMemo, useRef } from 'react';
import { Animated, Platform, RefreshControl } from 'react-native';
import { Loader } from './Loader';

const GAP = 64;

export function usePullRefresh(refreshing: boolean, onRefresh: () => void) {
  const y = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: false }), [y]);
  const opacity = useMemo(() => y.interpolate({ inputRange: [-GAP, -8], outputRange: [1, 0], extrapolate: 'clamp' }), [y]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="transparent"
      colors={['transparent']}
      progressBackgroundColor="transparent"
      style={{ backgroundColor: 'transparent' }}
    />
  );
  const backdrop = (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={!refreshing}
      importantForAccessibility={refreshing ? 'auto' : 'no-hide-descendants'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: GAP, alignItems: 'center', justifyContent: 'center', opacity }}
    >
      <Loader size={22} label="Refreshing" />
    </Animated.View>
  );
  const inline = Platform.OS === 'android' && refreshing ? <Loader size={22} label="Refreshing" className="my-row" /> : null;

  return { onScroll, scrollEventThrottle: 16, refreshControl, backdrop, inline };
}
