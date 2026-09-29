/** M6 US1: Block / Unblock a listener, with a confirm. The block is local at once; the server hears later. */
import { Alert } from 'react-native';
import { Button, ButtonText } from './lib/button';
import { router } from 'expo-router';
import { announce, useSafety } from '../safety/context';

export function BlockButton(props: { listenerId: string; displayName: string; onChange?: (blocked: boolean) => void }): React.ReactElement {
  const { safety, version } = useSafety();
  void version;
  const blocked = safety.isBlocked(props.listenerId);
  function press() {
    if (blocked) {
      safety.unblock(props.listenerId);
      announce(`Unblocked ${props.displayName}.`);
      props.onChange?.(false);
      return;
    }
    Alert.alert(`Block ${props.displayName}?`, 'Nothing they write, clip or do will show for you. They will not be told.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => {
        const r = safety.block(props.listenerId, props.displayName);
        if (r === 'sign_in') { router.push('/auth/sign-in'); return; }
        if (r === 'self' || r === 'owner') { Alert.alert(r === 'self' ? "You can't block yourself." : "You can't block the app's owner — write to them instead."); return; }
        announce(`Blocked ${props.displayName}. Hidden for you.`);
        props.onChange?.(true);
      } },
    ]);
  }
  return (
    // M9 (T032): gluestack's Button, the quiet `ghost` kind — a peer of Report, not a shout.
    <Button variant="ghost" onPress={press} accessibilityRole="button" accessibilityLabel={blocked ? `Unblock ${props.displayName}` : `Block ${props.displayName}`} className="py-2 px-0 min-h-[44px] justify-center self-start">
      {/* FR-016: the word carries it, not the hue — Block and Unblock share one colour. Report beside it is
          muted for the same reason — neither of two peer actions should shout over the other. */}
      <ButtonText className="text-text text-[15px]">{blocked ? 'Unblock' : 'Block'}</ButtonText>
    </Button>
  );
}

