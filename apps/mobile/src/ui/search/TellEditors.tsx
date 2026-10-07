// "Can't find it? Tell us": under an empty search, sends the search words to the editors.
/** M22 US17 item 3: `POST /v1/search-requests`, signed in or not; the owner reads them at /mod/search-requests. */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { useToast } from '@/ui/shell/providers';
import { useM22DiscoverApi } from '@/social/api-m22-discover';

const TAP = { minHeight: hit.min };

export function TellEditors(props: { q: string }): React.ReactElement | null {
  const api = useM22DiscoverApi();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  if (props.q.trim() === '') return null;
  if (state === 'sent') return <Text className="text-muted text-body text-center mt-section">Thanks — our editors will look for “{props.q.trim()}”.</Text>;
  const send = () => {
    setState('sending');
    api.tellEditors(props.q).then(() => setState('sent')).catch(() => { setState('idle'); toast("Couldn't send — try again when you're online."); });
  };
  return (
    <Box className="items-center mt-section">
      <Pressable onPress={send} disabled={state === 'sending'} accessibilityRole="button" accessibilityLabel={`Can't find it? Tell the editors you searched for ${props.q.trim()}`} accessibilityState={{ disabled: state === 'sending', busy: state === 'sending' }} className="px-section rounded-pill border border-border bg-surface justify-center" style={TAP}>
        <Text className="text-accent text-body font-semibold">Can't find it? Tell us</Text>
      </Pressable>
    </Box>
  );
}
