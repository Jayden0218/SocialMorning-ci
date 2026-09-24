/**
 * M6 US3 (FR-019–FR-021): one component for every empty surface — a sentence on what
 * fills it and one action that leads there; a loading row after 1 s; an offline or error
 * state with Retry after 10 s. The copy lives in `packages/social-core/src/empty.ts`, so
 * the 13 surfaces are enumerable and testable.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { emptyState, type Surface } from '@socialmorning/social-core';
import { colour } from '../design';

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
};

export function EmptyState(props: EmptyStateProps): React.ReactElement | null {
  const view = emptyState(props.surface, {
    offline: props.offline ?? false,
    hasCache: props.hasCache ?? false,
    ...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {}),
    ...(props.failed !== undefined ? { failed: props.failed } : {}),
  });
  if (view.kind === 'quiet') return null;
  if (view.kind === 'loading') {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (view.kind === 'offline' || view.kind === 'error') {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <Text style={styles.sentence}>{view.sentence}</Text>
        {props.onRetry ? (
          <Pressable style={styles.btn} onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const action = props.action ?? { label: view.action.label, onPress: () => router.push(view.action.route as never) };
  return (
    <View style={styles.wrap}>
      <Text style={styles.sentence}>{view.sentence}</Text>
      <Pressable style={styles.btn} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
        <Text style={styles.link}>{action.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 16, gap: 6, alignItems: 'flex-start' },
  sentence: { color: colour.text, fontSize: 15 },
  btn: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  link: { color: colour.accent, fontSize: 16, fontWeight: '600' },
});
