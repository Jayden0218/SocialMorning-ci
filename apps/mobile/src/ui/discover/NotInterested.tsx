// The For You "⋯" sheet (not interested in this episode, or this show) and the "Hidden · Undo" line.
/**
 * M19 T021 (US2, FR-010–FR-012): a For You row's ⋯ opens this sheet — "Not interested in this
 * episode" or "Stop recommending this show", and Cancel. The choice is the caller's to send
 * (src/recs/dismissals.ts); the row leaves at once and `HiddenNotice` offers Undo for a while.
 * The app's toast has no button, so Undo is this small line under the section's title.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import type { EpisodeCard } from '@/social/api';
import type { DismissalKind } from '@/social/profile-api';
import { SheetRow } from '@/ui/kit/SheetRow';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';

const TAP = { minHeight: hit.min };

export function NotInterestedSheet(props: { card: EpisodeCard | undefined; onChoose: (kind: DismissalKind, card: EpisodeCard) => void; onClose: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { card } = props;
  return (
    <Actionsheet isOpen={card !== undefined} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        {card ? (
          <>
            <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{card.title}</Text>
            <SheetRow icon="eye-off-outline" iconColour={c.accent} label="Not interested in this episode" onPress={() => props.onChoose('episode', card)} />
            <SheetRow icon="remove-circle-outline" iconColour={c.accent} label="Stop recommending this show" detail={card.showTitle} accessibilityLabel={`Stop recommending ${card.showTitle}`} onPress={() => props.onChoose('show', card)} />
          </>
        ) : null}
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
          <Text className="text-accent text-sm font-bold">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}

/** "Hidden" with Undo, under For You's title while the last choice can still be taken back. */
export function HiddenNotice(props: { kind: DismissalKind; onUndo: () => void }): React.ReactElement {
  return (
    <Box className="mx-screen-x mb-gap flex-row items-center gap-row bg-surface border border-border rounded-row pl-section" accessibilityLiveRegion="polite">
      <Text className="flex-1 text-text text-body">{props.kind === 'show' ? 'Hidden. This show won’t be recommended.' : 'Hidden. We won’t recommend it again.'}</Text>
      <Pressable onPress={props.onUndo} accessibilityRole="button" accessibilityLabel="Undo" className="items-center justify-center px-section" style={TAP}>
        <Text className="text-accent text-body font-bold">Undo</Text>
      </Pressable>
    </Box>
  );
}
