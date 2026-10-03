// A "Coming soon" box shown when you tap a feature not ready yet.
/**
 * M17 (FR-013, `ComingSoonWallet-B` / `ComingSoonSocialSignIn-B`): what a not-released feature
 * says when it is tapped — instead of a short toast or a control that does nothing. One dialog:
 * "Coming soon", the feature's name, one sentence on what it will do, and "Got it". An optional
 * second action goes somewhere real (e.g. "Continue with email"). Never a date, never a price.
 *
 *   const [comingSoon, dialog] = useComingSoon();
 *   comingSoon({ feature: 'Continue with Google', line: '…', second: { label: 'Continue with email', onPress } });
 *   return <>…{dialog}</>;
 */
import { useCallback, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/ui/lib/alert-dialog';
import { hit } from '@/design';
import { Eyebrow } from './Eyebrow';

const TAP = { minHeight: hit.min };

export type ComingSoonRequest = {
  /** The feature's name, e.g. "Continue with Google". */
  feature: string;
  /** One sentence on what it will do. */
  line: string;
  /** A second action that goes somewhere real. */
  second?: { label: string; onPress: () => void };
};

export function ComingSoonDialog(props: { request: ComingSoonRequest | undefined; onClose: () => void }): React.ReactElement {
  const r = props.request;
  return (
    <AlertDialog isOpen={r !== undefined} onClose={props.onClose}>
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-surface rounded-row p-section w-full gap-section border border-border" accessibilityViewIsModal>
        <AlertDialogHeader>
          <Box className="gap-1">
            <Eyebrow accent>{r?.feature ?? ''}</Eyebrow>
            <Text className="text-text text-hero font-display">Coming soon</Text>
          </Box>
        </AlertDialogHeader>
        <AlertDialogBody><Text className="text-muted text-body">{r?.line ?? ''}</Text></AlertDialogBody>
        <AlertDialogFooter className="flex-col items-stretch gap-row">
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Got it" className="justify-center items-center rounded-pill bg-primary" style={TAP}>
            <Text className="text-onPrimary text-body font-bold">Got it</Text>
          </Pressable>
          {r?.second ? (
            <Pressable onPress={() => { const go = r.second!.onPress; props.onClose(); go(); }} accessibilityRole="button" accessibilityLabel={r.second.label} className="justify-center items-center rounded-pill border border-border bg-surface" style={TAP}>
              <Text className="text-text text-body font-bold">{r.second.label}</Text>
            </Pressable>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useComingSoon(): [(request: ComingSoonRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ComingSoonRequest | undefined>();
  const ask = useCallback((next: ComingSoonRequest) => setRequest(next), []);
  const dialog = <ComingSoonDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
