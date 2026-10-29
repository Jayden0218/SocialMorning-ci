// The Moments view: one hot moment per screen, swiped up and down, with its empty, loading and error states.
/**
 * M31 T025 (design-pulse2 `home--moments`: "Layout: Stage … Swipe up/down between moments, snap
 * 360 ms"). A vertical paging list; each page is a `MomentCard` as tall as the list. The page that is
 * more than 60 % in view is the active card (`activeCard`); it alone runs a muted preview. Everything
 * that must stop a preview lives here: Home no longer in front (a tab change, a page pushed over
 * it), the app leaving the front (backgrounding, the lock screen, a call — iOS makes the app
 * inactive), Reduce Motion, the web build. Sound the listener started from a card stops with them.
 * Previous = the card before; nothing plays from a scroll, so the mobile-data question never
 * appears from one.
 *
 * States, in the Pulse words: loading (the sound bars and a line), empty ("No hot moments yet" with
 * the way to Discover), error (a sentence, "Try again", "Open Discover").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBelow } from './useBelow';
import { Box } from '@/ui/lib/box';
import type { Discover } from '@/social/api';
import { usePlayer, usePlayerSelector } from '@/playback/store';
import { Dialog } from '@/ui/kit/Dialog';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import type { Moment } from '@/discover/moments-api';
import { MomentCard, type Ambient, type CardActions } from './MomentCard';
import { activeCard, momentKey } from './moments-logic';
import { useMomentActions } from './useMomentActions';
import type { MomentsList } from './useMoments';
import { SWITCH_HEIGHT, SWITCH_LIFT } from './HomeSwitch';

/** True while the app is in front: not backgrounded, not locked, not interrupted by a call. */
export function useAppActive(): boolean {
  // 'unknown' (the first moments of a launch) counts as in front; only background and inactive do not.
  const front = (s: string | null | undefined): boolean => s !== 'background' && s !== 'inactive';
  const [on, setOn] = useState(front(AppState.currentState));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setOn(front(s)));
    return () => sub.remove();
  }, []);
  return on;
}

/** The key of the moment whose sound is playing through the main player, or undefined. */
function usePlayingMomentKey(): string | undefined {
  const player = usePlayer();
  return usePlayerSelector((s) => {
    if (s.kind !== 'playing' && s.kind !== 'buffering') return undefined;
    const c = player.clip();
    return c !== undefined && c.episodeId === s.episodeId ? momentKey(c) : undefined;
  });
}

function Notice(props: { title: string; line: string; children?: React.ReactNode; busy?: boolean }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <Box className="flex-1 items-center justify-center" style={{ paddingHorizontal: gutter(width) + spacing.block, paddingBottom: SWITCH_HEIGHT + SWITCH_LIFT, gap: spacing.row }} accessibilityLiveRegion="polite">
      {props.busy ? <Loader label="Loading" /> : null}
      <Type step="lede" className="text-text text-center" accessibilityRole="header">{props.title}</Type>
      <Type step="note" className="text-text2 text-center">{props.line}</Type>
      {props.children ? <Box className="flex-row flex-wrap justify-center" style={{ gap: spacing.gap, marginTop: spacing.gap }}>{props.children}</Box> : null}
    </Box>
  );
}

export function MomentsFeed(props: {
  list: MomentsList;
  /** The Discover data, to find the episode of a chart moment. */
  body: Discover | undefined;
  /** Home is in front and the Moments view is chosen. */
  inFront: boolean;
  onDiscover: () => void;
}): React.ReactElement {
  const { list } = props;
  const insets = useSafeAreaInsets();
  const below = useBelow();
  const still = useReducedMotion();
  const appActive = useAppActive();
  const actions = useMomentActions(props.body);
  const playing = usePlayingMomentKey();
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [active, setActive] = useState<number | undefined>(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  };

  // The card facade the memoised cards hold: it never changes, and always calls the latest actions.
  const latest = useRef(actions);
  latest.current = actions;
  const facade = useMemo<CardActions>(() => ({
    playFull: (m) => latest.current.playFull(m),
    toggleSound: (m, on) => latest.current.toggleSound(m, on),
    comments: (m) => latest.current.comments(m),
    react: (m, d) => latest.current.react(m, d),
    share: (m) => latest.current.share(m),
  }), []);

  const ambient = useMemo<Ambient>(() => ({ focused: props.inFront, appActive, reduceMotion: still, web: Platform.OS === 'web' }), [props.inFront, appActive, still]);

  const items = list.items;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (!size) return;
    const next = activeCard(e.nativeEvent.contentOffset.y, size.height, itemsRef.current.length);
    if (next !== undefined) setActive((prev) => (prev === next ? prev : next));
  }, [size]);

  // The sound a card started stops when its card is left, Home leaves the front, or the app does.
  const stop = useRef(actions.stopSound);
  stop.current = actions.stopSound;
  const was = useRef<Moment | undefined>(undefined);
  const current = active === undefined ? undefined : items[active];
  useEffect(() => {
    const before = was.current;
    was.current = current;
    if (before !== undefined && before !== current) stop.current(before);
  }, [current]);
  useEffect(() => {
    if ((!props.inFront || !appActive) && current !== undefined) stop.current(current);
  }, [props.inFront, appActive, current]);
  // Leaving the Moments view (the switch) ends the sound too.
  useEffect(() => () => { if (was.current !== undefined) stop.current(was.current); }, []);

  const render = useCallback(({ item, index }: { item: Moment; index: number }) => (
    <MomentCard
      item={item}
      width={size?.width ?? 0}
      height={size?.height ?? 0}
      top={insets.top}
      below={below}
      active={index === active}
      near={active !== undefined && Math.abs(index - active) <= 1}
      ambient={ambient}
      soundOn={playing === momentKey(item)}
      actions={facade}
    />
  ), [size, insets.top, below, active, ambient, playing, facade]);

  if (list.status === 'loading') return <Notice busy title="Finding hot moments" line="The parts of episodes that people are reacting to right now." />;
  if (list.status === 'error') {
    return (
      <Notice title="Couldn't load moments" line="Check your connection and try again.">
        <PulseButton label="Try again" onPress={() => void list.refresh()} />
        <PulseButton label="Open Discover" kind="ring" onPress={props.onDiscover} />
      </Notice>
    );
  }
  if (items.length === 0) {
    return (
      <Notice title="No hot moments yet" line="A moment appears when many people react to the same part of an episode. Follow a few shows and check back soon.">
        <PulseButton label="Open Discover" onPress={props.onDiscover} />
        <PulseButton label="Refresh" kind="quiet" onPress={() => void list.refresh()} />
      </Notice>
    );
  }
  return (
    <Box className="flex-1" onLayout={onLayout}>
      {size && size.height > 0 ? (
        <FlatList
          data={items}
          keyExtractor={momentKey}
          renderItem={render}
          extraData={render}
          getItemLayout={(_d, i) => ({ length: size.height, offset: size.height * i, index: i })}
          pagingEnabled
          snapToInterval={size.height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onEndReachedThreshold={2}
          onEndReached={() => void list.loadMore()}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          accessibilityLabel="Moments"
        />
      ) : null}
      <Dialog
        open={actions.pendingSwitch !== undefined}
        title="Switch to this moment?"
        body="Something else is playing. This moment will play instead."
        onClose={actions.cancelSwitch}
        buttons={[
          { label: 'Cancel', kind: 'quiet', onPress: actions.cancelSwitch },
          { label: 'Switch', kind: 'light', onPress: actions.confirmSwitch },
        ]}
      />
    </Box>
  );
}
