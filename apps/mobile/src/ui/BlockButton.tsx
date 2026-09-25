/** M6 US1: Block / Unblock a listener, with a confirm. The block is local at once; the server hears later. */
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { announce, useSafety } from '../safety/context';
import { colour } from '../design';

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
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={blocked ? `Unblock ${props.displayName}` : `Block ${props.displayName}`} style={styles.btn}>
      <Text style={blocked ? styles.link : styles.danger}>{blocked ? 'Unblock' : 'Block'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  link: { color: colour.text, fontSize: 15 },
  // FR-016: the word carries it, not the hue. Report beside it is muted for the same
  // reason — neither of two peer actions should shout over the other.
  danger: { color: colour.text, fontSize: 15 },
});
