// The line under the last row of a fetched list: "No more to fetch".
/**
 * Owner, 2026-10-05: every list that fetches — podcasts, episodes, comments, chats — ends with
 * this line, so the bottom of a list reads as the end and not as something still loading.
 */
import { Text } from '@/ui/lib/text';

export function EndOfList(props: { className?: string }): React.ReactElement {
  return (
    <Text className={`text-muted text-xs text-center my-section ${props.className ?? ''}`} accessibilityRole="text">
      No more to fetch
    </Text>
  );
}
