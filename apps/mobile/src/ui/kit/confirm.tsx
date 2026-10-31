// An "Are you sure?" dialog with Cancel and the action (the kit Dialog).
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
 *
 * M31 W3-D (design-pulse2 `dialog`: listen.html `player--queue-clear-dialog`, `downloads--delete-dialog`,
 * `history--clear-dialog`, `playlist--delete-dialog`; social.html block / delete dialogs): the question is
 * the Pulse centred dialog (`kit/Dialog`), not a bottom sheet — Cancel on the left (quiet), the action on
 * the right (`hot` when it destroys: Delete, Clear, Remove, Block, Leave, Sign out…, else `light`), a
 * one-button notice is a lone light OK. Same two buttons, same names and handlers; the scrim, Back
 * and a screen reader's escape still cancel.
 */
import { useCallback, useState } from 'react';
import { Dialog } from './Dialog';

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** The action's word, e.g. "Block". Defaults to "OK". */
  action?: string;
  /** The cancel word; `null` for a notice with one button. Defaults to "Cancel". */
  cancel?: string | null;
  /** Force the action's colour: hot (true) or light (false). Left out, the action's word decides. */
  danger?: boolean;
  onConfirm?: () => void;
};

/** Words that destroy or remove something are drawn hot (design-pulse2); the word, not colour alone, says so. */
const DESTRUCTIVE = /^(delete|clear|remove|block|leave|discard|sign out|log out|unsubscribe|report|stop|reset|erase|close account)\b/i;

export function isDestructive(r: Pick<ConfirmRequest, 'action' | 'danger'>): boolean {
  return r.danger ?? DESTRUCTIVE.test(r.action ?? 'OK');
}

export function ConfirmDialog(props: { request: ConfirmRequest | undefined; onClose: () => void }): React.ReactElement | null {
  const r = props.request;
  const action = r?.action ?? 'OK';
  const cancel = r?.cancel === undefined ? 'Cancel' : r.cancel;
  return (
    <Dialog
      open={r !== undefined}
      title={r?.title ?? ''}
      body={r?.message}
      onClose={props.onClose}
      buttons={[
        ...(cancel !== null ? [{ label: cancel, kind: 'quiet' as const, onPress: props.onClose }] : []),
        { label: action, kind: r !== undefined && isDestructive(r) ? ('hot' as const) : ('light' as const), onPress: () => { props.onClose(); r?.onConfirm?.(); } },
      ]}
    />
  );
}

export function useConfirm(): [(request: ConfirmRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ConfirmRequest | undefined>();
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const dialog = <ConfirmDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
