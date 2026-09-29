/**
 * M12 FR-093: one "new episodes" switch per subscribed show, under the global one. The
 * server keeps them (`/v1/me/notify/shows`) so every device agrees; a switch flips at once
 * and flips back, with a note, if the server says no.
 */
import { useEffect, useState } from 'react';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { SwitchRow } from './rows';
import type { NotifyShow } from '../../social/m12-api';

export function NotifyShows(props: { load: () => Promise<NotifyShow[]>; save: (feedUrl: string, enabled: boolean) => Promise<void>; titleOf: (feedUrl: string) => string | undefined; disabled?: boolean }): React.ReactElement | null {
  const [shows, setShows] = useState<NotifyShow[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const { load } = props;
  useEffect(() => {
    let live = true;
    load().then((s) => { if (live) setShows(s); }, () => { if (live) setError("Couldn't load your shows right now."); });
    return () => { live = false; };
  }, [load]);
  const flip = (feedUrl: string, enabled: boolean) => {
    const set = (v: boolean) => setShows((s) => s?.map((x) => (x.feedUrl === feedUrl ? { ...x, enabled: v } : x)));
    set(enabled);
    setError(undefined);
    props.save(feedUrl, enabled).catch(() => { set(!enabled); setError("That didn't save — try again."); });
  };
  if (error && shows === undefined) return <Text className="text-muted text-xs mt-row">{error}</Text>;
  if (shows === undefined || shows.length === 0) return null;
  return (
    <Box className="mt-section">
      <Text className="text-muted text-xs mb-1" accessibilityRole="header">New episodes, show by show</Text>
      {shows.map((s) => (
        <SwitchRow key={s.feedUrl} icon="radio-outline" label={s.title || props.titleOf(s.feedUrl) || s.feedUrl} value={s.enabled && !props.disabled} disabled={props.disabled} onChange={(v) => flip(s.feedUrl, v)} />
      ))}
      {error ? <Text className="text-accent text-xs mt-row">{error}</Text> : null}
    </Box>
  );
}
