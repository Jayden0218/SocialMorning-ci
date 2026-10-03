// Sign out button that asks first.
/**
 * Sign out, asked first (iOS i16: one stray tap signed you out). Used on Me and on Account.
 * M9: the question is gluestack's AlertDialog.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Heading } from '@/ui/lib/heading';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '@/ui/lib/alert-dialog';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };

export function SignOut(props: { onSignOut: () => void; className?: string }): React.ReactElement {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Pressable onPress={() => setAsking(true)} accessibilityRole="button" accessibilityLabel="Sign out" className={props.className ?? 'justify-center'} style={TAP}>
        <Text className="text-accent text-sm">Sign out</Text>
      </Pressable>
      <AlertDialog isOpen={asking} onClose={() => setAsking(false)}>
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-background rounded-row p-section w-full gap-section border-0" accessibilityViewIsModal>
          <AlertDialogHeader><Heading className="text-text text-base font-bold" accessibilityRole="header">Sign out?</Heading></AlertDialogHeader>
          <AlertDialogBody><Text className="text-muted text-sm">Your downloads stay on this phone. Unsent comment drafts are cleared.</Text></AlertDialogBody>
          <AlertDialogFooter className="flex-row justify-end gap-section">
            <Pressable onPress={() => setAsking(false)} accessibilityRole="button" accessibilityLabel="Stay signed in" className="justify-center px-row" style={TAP}>
              <Text className="text-accent text-sm font-semibold">Stay signed in</Text>
            </Pressable>
            <Pressable onPress={() => { setAsking(false); props.onSignOut(); }} accessibilityRole="button" accessibilityLabel="Confirm sign out" className="justify-center px-row" style={TAP}>
              <Text className="text-accent text-sm font-semibold">Sign out</Text>
            </Pressable>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
