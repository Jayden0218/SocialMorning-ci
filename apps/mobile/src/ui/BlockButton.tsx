/**
 * M6 US1: Block / Unblock a listener, with a confirm. The block is local at once; the server hears later.
 * M17 (`Profile-B`): the white outlined pill beside Follow. Same confirm, same words.
 */
import { Button, ButtonText } from './lib/button';
import { hit } from '../design';

const TAP = { minHeight: hit.min };
import { useConfirm } from './confirm';
import { router } from 'expo-router';
import { announce, useSafety } from '../safety/context';

export function BlockButton(props: { listenerId: string; displayName: string; onChange?: (blocked: boolean) => void }): React.ReactElement {
  const { safety, version } = useSafety();
  void version;
  const blocked = safety.isBlocked(props.listenerId);
  // M16a T003 (FR-013): the app's own dialog, not the iOS alert.
  const [confirm, dialog] = useConfirm();
  function press() {
    if (blocked) {
      safety.unblock(props.listenerId);
      announce(`Unblocked ${props.displayName}.`);
      props.onChange?.(false);
      return;
    }
    confirm({
      title: `Block ${props.displayName}?`,
      message: 'Nothing they write, clip or do will show for you. They will not be told.',
      action: 'Block',
      onConfirm: () => {
        const r = safety.block(props.listenerId, props.displayName);
        if (r === 'sign_in') { router.push('/auth/sign-in'); return; }
        if (r === 'self' || r === 'owner') { confirm({ title: r === 'self' ? "You can't block yourself." : "You can't block the app's owner — write to them instead.", cancel: null }); return; }
        announce(`Blocked ${props.displayName}. Hidden for you.`);
        props.onChange?.(true);
      },
    });
  }
  return (
    <>
    {/* M9 (T032): gluestack's Button. M17: an outlined pill — a peer of Report, not a shout. */}
    <Button variant="outline" onPress={press} accessibilityRole="button" accessibilityLabel={blocked ? `Unblock ${props.displayName}` : `Block ${props.displayName}`} className="px-section rounded-pill border border-border bg-surface justify-center items-center self-start" style={TAP}>
      {/* FR-016: the word carries it, not the hue — Block and Unblock share one colour. Report beside it is
          muted for the same reason — neither of two peer actions should shout over the other. */}
      <ButtonText className="text-text text-body font-semibold">{blocked ? 'Unblock' : 'Block'}</ButtonText>
    </Button>
    {dialog}
    </>
  );
}

