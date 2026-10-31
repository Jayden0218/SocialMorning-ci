// Sign out button that asks first.
/**
 * Sign out, asked first (iOS i16: one stray tap signed you out). Used on Account.
 * M31 S-A (T060; design-pulse2 `account--screen` "Sign out: ring pill at the foot", `account--sign-out-dialog`): the button is the kit's ring
 * pill (padding 30) centred at the foot of Settings; the question is the kit `Dialog` — "Sign out?", "Your downloads stay on this phone.
 * Unsent comment drafts are cleared.", **Stay signed in** (quiet) and **Sign out** (hot) side by side.
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Dialog } from '@/ui/kit/Dialog';
import { PulseButton } from '@/ui/kit/PulseButton';

export function SignOut(props: { onSignOut: () => void; className?: string }): React.ReactElement {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Box className={props.className ?? 'items-center'} style={{ paddingTop: 6 }}>
        <PulseButton label="Sign out" kind="ring" padX={30} onPress={() => setAsking(true)} />
      </Box>
      <Dialog
        open={asking}
        title="Sign out?"
        body="Your downloads stay on this phone. Unsent comment drafts are cleared."
        onClose={() => setAsking(false)}
        buttons={[
          { label: 'Stay signed in', kind: 'quiet', onPress: () => setAsking(false) },
          { label: 'Sign out', kind: 'hot', onPress: () => { setAsking(false); props.onSignOut(); } },
        ]}
      />
    </>
  );
}
