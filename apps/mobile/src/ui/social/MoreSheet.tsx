// A small "More" sheet: a title, a few rows (Report, Stop suggesting…) and Cancel.
/**
 * M24 US1/US17: the status viewer, a chat message and a shared list each offer a short list of
 * actions on someone else's content. Our own sheet (gluestack's Actionsheet, like the Subscriptions
 * row menu) — never a native action sheet. A row closes the sheet, then runs.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { SheetRow } from '@/ui/kit/SheetRow';
import type { IconName } from '@/ui/kit/Icon';
import { hit } from '@/design';

export type MoreRow = { icon: IconName; label: string; onPress: () => void };

export function MoreSheet(props: { open: boolean; title: string; rows: readonly MoreRow[]; iconColour: string; onClose: () => void }): React.ReactElement {
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{props.title}</Text>
        {props.rows.map((r) => (
          <SheetRow key={r.label} icon={r.icon} label={r.label} iconColour={props.iconColour} onPress={() => { props.onClose(); r.onPress(); }} />
        ))}
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={{ minHeight: hit.min }}>
          <Text className="text-accent text-sm font-bold">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}
