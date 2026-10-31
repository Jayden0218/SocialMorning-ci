// Privacy switch: hide the "Often listened" row on your profile from other people.
/**
 * M22 US17 item 6: read from your own profile, saved alone as `PUT /v1/me/privacy { hideOftenListened }`, put back if refused.
 * M31 S-B (design-pulse2 `settings-privacy--screen`, `toast--often-listened-switch`): it is the fifth row of the "Others see" group, so it draws a
 * bare group row (label, line, switch) for the page to put inside `PanelGroup`; it was a card of its own.
 */
import { useEffect, useState } from 'react';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';
import { SwitchRow } from '@/ui/settings/panel';

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
  return <SwitchRow label={LABEL} line="Others do not see the shows you listened to most in the last 90 days" value={hidden ?? false} onChange={change} disabled={hidden === undefined} />;
}
