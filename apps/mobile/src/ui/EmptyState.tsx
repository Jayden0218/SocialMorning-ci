/**
 * M6 US3 (FR-019–FR-021): one component for every empty surface — a sentence on what
 * fills it and one action that leads there; a loading row after 1 s; an offline or error
 * state with Retry after 10 s. The copy lives in `packages/social-core/src/empty.ts`, so
 * the 13 surfaces are enumerable and testable.
 */
import { Pressable, Text, View } from 'react-native';
import { Loader } from './Loader';
import { router } from 'expo-router';
import { emptyState, type Surface } from '@socialmorning/social-core';

/** Kept as a style: font-scale asserts the action's tap target on the Pressable's own `style`. */
const TAP = { minHeight: 44 };

export type EmptyStateProps = {
  surface: Surface;
  offline?: boolean;
  hasCache?: boolean;
  /** How long the first load has been running; undefined = not loading. */
  loadingMs?: number;
  failed?: boolean;
  onRetry?: () => void;
  /** Overrides the table's action (e.g. "Comment at 14:32" on the episode page). */
  action?: { label: string; onPress: () => void };
  className?: string;
};

export function EmptyState(props: EmptyStateProps): React.ReactElement | null {
  const view = emptyState(props.surface, {
    offline: props.offline ?? false,
    hasCache: props.hasCache ?? false,
    ...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {}),
    ...(props.failed !== undefined ? { failed: props.failed } : {}),
  });
  if (view.kind === 'quiet') return null;
  const wrap = `py-4 gap-1.5 items-start ${props.className ?? ''}`;
  if (view.kind === 'loading') {
    return (
      <View className={wrap} accessibilityLiveRegion="polite">
        <Loader label="Loading" />
      </View>
    );
  }
  if (view.kind === 'offline' || view.kind === 'error') {
    return (
      <View className={wrap} accessibilityLiveRegion="polite">
        <Text className="text-text text-[15px]">{view.sentence}</Text>
        {props.onRetry ? (
          <Pressable className="py-2.5 justify-center" style={TAP} onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry">
            <Text className="text-accent text-sm font-semibold">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const action = props.action ?? { label: view.action.label, onPress: () => router.push(view.action.route as never) };
  return (
    <View className={wrap}>
      <Text className="text-text text-[15px]">{view.sentence}</Text>
      <Pressable className="py-2.5 justify-center" style={TAP} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
        <Text className="text-accent text-sm font-semibold">{action.label}</Text>
      </Pressable>
    </View>
  );
}
