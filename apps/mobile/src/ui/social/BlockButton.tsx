// Block or Unblock a person, asking first.
/**
 * M6 US1: Block / Unblock a listener, with a confirm. The block is local at once; the server hears later.
 * M31 W4-D (T053; design-pulse2 `profile--blocked`, `profile--block-dialog-from-blocked-page`, `profile--cannot-block-owner`, Blocked listeners'
 * "Unblock" pill): a quiet 48 pill. The default `pill` is the short "Block" / "Unblock" (a Blocked-listeners card); `bar` is the
 * blocked profile's bottom-zone pill, stretched, with the block glyph and the name: "Unblock Rui Costa". The question is the kit
 * dialog (`useConfirm`): Cancel quiet, Block hot; the owner and yourself get the lone light OK. Same words and handlers as before.
 */
import { PulseButton } from '@/ui/kit/PulseButton';
import { useConfirm } from '@/ui/kit/confirm';
import { router } from 'expo-router';
import { announce, useSafety } from '@/safety/context';

export function BlockButton(props: { listenerId: string; displayName: string; onChange?: (blocked: boolean) => void; /** `bar`: the profile's bottom-zone pill (glyph, the name, fills the row). */ look?: 'pill' | 'bar'; /** S-A: the pill sits on a raise tile (Blocked listeners' cards), so its fill is raise-2. */ onTile?: boolean }): React.ReactElement {
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
  const bar = props.look === 'bar';
  const word = blocked ? 'Unblock' : 'Block';
  return (
    <>
      {/* FR-016: the word carries it, not the hue — Block and Unblock share one look. */}
      <PulseButton
        kind={props.onTile === true ? 'quiet2' : 'quiet'}
        label={bar ? `${word} ${props.displayName}` : word}
        accessibilityLabel={`${word} ${props.displayName}`}
        {...(bar ? { icon: 'ban-outline' as const } : {})}
        {...(props.onTile === true ? { height: 40 } : {})}
        className={bar ? 'flex-1' : 'self-start'}
        onPress={press}
      />
      {dialog}
    </>
  );
}
