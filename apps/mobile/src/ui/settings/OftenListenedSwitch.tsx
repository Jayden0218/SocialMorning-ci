// Privacy switch: hide the "Often listened" row on your profile from other people.
/** M22 US17 item 6: read from your own profile, saved alone as `PUT /v1/me/privacy { hideOftenListened }`, put back if refused. */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { Card } from '@/ui/kit/Card';
import { Toggle } from '@/ui/kit/Toggle';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';

const TAP = { minHeight: hit.min };
const LABEL = 'Hide "Often listened"';

export function OftenListenedSwitch(): React.ReactElement | null {
  const { listener } = useSocial();
  const api = useM22DiscoverApi();
  const toast = useToast();
  const [hidden, setHidden] = useState<boolean | undefined>();
  const id = listener?.listenerId;
  useEffect(() => {
    if (id === undefined) return;
    let live = true;
    api.oftenListened(id).then((d) => { if (live) setHidden(d.hidden ?? false); }).catch(() => undefined);
    return () => { live = false; };
  }, [api, id]);
  if (id === undefined) return null;
  const change = (v: boolean) => {
    setHidden(v);
    api.setHideOftenListened(v).catch(() => { setHidden(!v); toast("Couldn't save that — try again when you're online."); });
  };
  return (
    <Card>
      <Box className="flex-row items-center gap-row py-row" style={TAP}>
        <Box className="flex-1">
          <Text className="text-text text-body font-semibold">{LABEL}</Text>
          <Text className="text-muted text-xs mt-0.5">Others do not see the shows you listened to most in the last 90 days</Text>
        </Box>
        <Toggle value={hidden ?? false} onChange={change} label={LABEL} disabled={hidden === undefined} />
      </Box>
    </Card>
  );
}
