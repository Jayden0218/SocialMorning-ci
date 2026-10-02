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
 */
import { useCallback, useState } from 'react';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Heading } from './lib/heading';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from './lib/alert-dialog';
import { hit } from '../design';

const TAP = { minHeight: hit.min };

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
    <AlertDialog isOpen={r !== undefined} onClose={props.onClose}>
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-background rounded-row p-section w-full gap-section border-0" accessibilityViewIsModal>
        <AlertDialogHeader><Heading className="text-text text-base font-bold" accessibilityRole="header">{r?.title ?? ''}</Heading></AlertDialogHeader>
        {r?.message ? <AlertDialogBody><Text className="text-muted text-sm">{r.message}</Text></AlertDialogBody> : null}
        <AlertDialogFooter className="flex-row justify-end gap-section">
          {cancel !== null ? (
            <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel={cancel} className="justify-center px-row" style={TAP}>
              <Text className="text-muted text-sm font-semibold">{cancel}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { props.onClose(); r?.onConfirm?.(); }} accessibilityRole="button" accessibilityLabel={action} className="justify-center px-row" style={TAP}>
            <Text className="text-accent text-sm font-semibold">{action}</Text>
          </Pressable>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirm(): [(request: ConfirmRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ConfirmRequest | undefined>();
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const dialog = <ConfirmDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
