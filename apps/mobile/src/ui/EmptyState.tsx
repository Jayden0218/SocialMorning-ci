/**
 * M6 US3 (FR-019–FR-021): one component for every empty surface — a sentence on what
 * fills it and one action that leads there; a loading row after 1 s; an offline or error
 * state with Retry after 10 s. The copy lives in `packages/social-core/src/empty.ts`, so
 * the 13 surfaces are enumerable and testable.
 */
import { Button, ButtonText } from './lib/button';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Loader } from './Loader';
import { router } from 'expo-router';
import { emptyState, type Surface } from '@socialmorning/social-core';

/** Kept as a style: font-scale asserts the action's tap target on the button's own `style`. M9 (T033): the actions are gluestack Buttons. */
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
  /**
   * M12 FR-056 (B9): the empty state fills a whole page — centre the sentence and its action,
   * as the picture empty states do. Inline uses (the episode page's comments) stay left.
   */
  page?: boolean;
};

export function EmptyState(props: EmptyStateProps): React.ReactElement | null {
  const view = emptyState(props.surface, {
    offline: props.offline ?? false,
    hasCache: props.hasCache ?? false,
    ...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {}),
    ...(props.failed !== undefined ? { failed: props.failed } : {}),
  });
  if (view.kind === 'quiet') return null;
  const wrap = `py-4 gap-1.5 ${props.page ? 'items-center px-screen-x' : 'items-start'} ${props.className ?? ''}`;
  const align = props.page ? 'text-center' : '';
  const self = props.page ? 'self-center' : 'self-start';
  if (view.kind === 'loading') {
    return (
      <Box className={wrap} accessibilityLiveRegion="polite">
        <Loader label="Loading" />
      </Box>
    );
  }
  if (view.kind === 'offline' || view.kind === 'error') {
    return (
      <Box className={wrap} accessibilityLiveRegion="polite">
        <Text className={`text-text text-[15px] ${align}`}>{view.sentence}</Text>
        {props.onRetry ? (
          <Button variant="link" className={`py-2.5 px-0 justify-center ${self}`} style={TAP} onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry">
            <ButtonText className="text-accent text-sm font-semibold">Retry</ButtonText>
          </Button>
        ) : null}
      </Box>
    );
  }
  const action = props.action ?? { label: view.action.label, onPress: () => router.push(view.action.route as never) };
  return (
    <Box className={wrap}>
      <Text className={`text-text text-[15px] ${align}`}>{view.sentence}</Text>
      <Button variant="link" className={`py-2.5 px-0 justify-center ${self}`} style={TAP} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
        <ButtonText className="text-accent text-sm font-semibold">{action.label}</ButtonText>
      </Button>
    </Box>
  );
}
