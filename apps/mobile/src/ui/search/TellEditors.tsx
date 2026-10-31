// "Can't find it? Tell us": under an empty search, sends the search words to the editors.
/**
 * M22 US17 item 3: `POST /v1/search-requests`, signed in or not; the owner reads them at /mod/search-requests.
 * M31 T030 (design-pulse2 `search--empty`, `toast--tell-editors`): the button is the 48 ring button with the
 * send mark (`PulseButton` ring), centred under the empty block; once sent it reads "Thanks — our editors will
 * look for …" (Geist 400 15, text2). A failed send keeps the button and shows the toast "Couldn't send — try
 * again when you're online."
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useToast } from '@/ui/shell/providers';
import { useM22DiscoverApi } from '@/social/api-m22-discover';
import { PX } from '@/ui/discover/Deck';

export function TellEditors(props: { q: string }): React.ReactElement | null {
  const api = useM22DiscoverApi();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  if (props.q.trim() === '') return null;
  if (state === 'sent') return <Type step="body" className="text-text2 text-center" style={{ marginTop: spacing.row, paddingHorizontal: spacing.block }}>Thanks — our editors will look for “{props.q.trim()}”.</Type>;
  const send = () => {
    setState('sending');
    api.tellEditors(props.q).then(() => setState('sent')).catch(() => { setState('idle'); toast("Couldn't send — try again when you're online."); });
  };
  return (
    <Box className="items-center" style={{ marginTop: PX.fourteen + spacing.gap + 2 }}>
      <PulseButton
        label="Can't find it? Tell us"
        kind="ring"
        icon="paper-plane-outline"
        busy={state === 'sending'}
        onPress={send}
        accessibilityLabel={`Can't find it? Tell the editors you searched for ${props.q.trim()}`}
      />
    </Box>
  );
}
