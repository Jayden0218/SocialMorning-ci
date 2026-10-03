/**
 * M12 FR-093: one "new episodes" switch per subscribed show, under the global one. The
 * server keeps them (`/v1/me/notify/shows`) so every device agrees; a switch flips at once
 * and flips back, with a note, if the server says no.
 *
 * M17 T094 (`SettingsPush-B`): a serif section title, then a 2-column grid of cards — the
 * show's artwork (its initial while there is none) beside the toggle, the name under them.
 */
import { useEffect, useState } from 'react';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Card } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { Toggle } from '@/ui/kit/Toggle';
import type { NotifyShow } from '@/social/m12-api';

export function NotifyShows(props: { load: () => Promise<NotifyShow[]>; save: (feedUrl: string, enabled: boolean) => Promise<void>; titleOf: (feedUrl: string) => string | undefined; artOf?: (feedUrl: string) => string | null | undefined; disabled?: boolean }): React.ReactElement | null {
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
  // Two cards a row; an odd last card keeps its half width.
  const pairs: NotifyShow[][] = [];
  for (let i = 0; i < shows.length; i += 2) pairs.push(shows.slice(i, i + 2));
  const cell = (s: NotifyShow) => {
    const label = s.title || props.titleOf(s.feedUrl) || s.feedUrl;
    return (
      <Card key={s.feedUrl} className="flex-1 py-row gap-gap">
        <Box className="flex-row items-center justify-between">
          <Artwork url={props.artOf?.(s.feedUrl) ?? null} size={48} rounded="row" name={label} />
          <Toggle value={s.enabled && !props.disabled} onChange={(v) => flip(s.feedUrl, v)} label={label} {...(props.disabled !== undefined ? { disabled: props.disabled } : {})} />
        </Box>
        <Text className="text-text text-body font-bold" numberOfLines={2}>{label}</Text>
      </Card>
    );
  };
  return (
    <Box className="mt-gap gap-row">
      <Text className="text-text text-base font-display" accessibilityRole="header">New episodes, show by show</Text>
      {pairs.map((pair) => (
        <Box key={pair.map((s) => s.feedUrl).join('|')} className="flex-row gap-row">
          {pair.map(cell)}
          {pair.length === 1 ? <Box className="flex-1" /> : null}
        </Box>
      ))}
      {error ? <Text className="text-accent text-xs mt-row">{error}</Text> : null}
    </Box>
  );
}
