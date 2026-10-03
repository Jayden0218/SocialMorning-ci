/**
 * M16a T003 (FR-013, owner 2026-10-02): the app asks its own questions — never the iOS native
 * alert. One helper on gluestack's AlertDialog, the look SignOut already has: a title, a line,
 * then Cancel and the action on the right, each a 48 pt target.
 *
 *   const [confirm, dialog] = useConfirm();
 *   confirm({ title: 'Block Bea?', message: '…', action: 'Block', onConfirm: () => … });
 *   return <>…{dialog}</>;
 *
 * The dialog is rendered by the caller (not a provider): gluestack portals it to
 * <GluestackUIProvider>, and the dialog needs nothing from the app's contexts. `cancel: null`
 * makes a one-button notice ("You can't block yourself.").
 *
 * M17 (`ConfirmDialog-B`, checked in T106–T111): B asks from a bottom sheet, not a centred card —
 * the warm page colour, a grab handle, a 30 pt serif title, the line in muted, then the action as
 * the full-width yellow pill and Cancel as a bold accent text button under it. Wave 0 had left it
 * a centred card with the buttons side by side. Now gluestack's Actionsheet (as the consent
 * sheet); the backdrop and a drag down still cancel. Same two buttons, same names and handlers.
 */
import { useCallback, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };
/** B's primary pill: 52 pt. */
const PILL = { minHeight: 52 };

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** The action's word, e.g. "Block". Defaults to "OK". */
  action?: string;
  /** The cancel word; `null` for a notice with one button. Defaults to "Cancel". */
  cancel?: string | null;
  onConfirm?: () => void;
};

export function ConfirmDialog(props: { request: ConfirmRequest | undefined; onClose: () => void }): React.ReactElement {
  const r = props.request;
  const action = r?.action ?? 'OK';
  const cancel = r?.cancel === undefined ? 'Cancel' : r.cancel;
  return (
    <Actionsheet isOpen={r !== undefined} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-artwork-lg px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-text font-display text-[30px] leading-[34px] mt-row" accessibilityRole="header">{r?.title ?? ''}</Text>
        {r?.message ? <Text className="text-muted text-[15px] leading-[22px] mt-gap">{r.message}</Text> : null}
        <Pressable onPress={() => { props.onClose(); r?.onConfirm?.(); }} accessibilityRole="button" accessibilityLabel={action} className="items-center justify-center rounded-pill bg-primary mt-screen-x" style={PILL}>
          <Text className="text-onPrimary text-[15px] font-bold">{action}</Text>
        </Pressable>
        {cancel !== null ? (
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel={cancel} className="items-center justify-center mt-1" style={TAP}>
            <Text className="text-accent text-body font-bold">{cancel}</Text>
          </Pressable>
        ) : null}
        <Box className="h-row" />
      </ActionsheetContent>
    </Actionsheet>
  );
}

export function useConfirm(): [(request: ConfirmRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ConfirmRequest | undefined>();
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const dialog = <ConfirmDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
