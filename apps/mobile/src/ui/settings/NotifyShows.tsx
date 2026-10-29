// One "new episodes" alert switch for each show you follow.
/**
 * M12 FR-093: one "new episodes" switch per subscribed show, under the global one. The
 * server keeps them (`/v1/me/notify/shows`) so every device agrees; a switch flips at once
 * and flips back, with a note, if the server says no.
 *
 * M17 T094 (`SettingsPush-B`): a serif section title, then a 2-column grid of cards — the
 * show's artwork (its initial while there is none) beside the toggle, the name under them.
 *
 * M31 S-B (T060; design-pulse2 `settings-push--screen`): under the edge label SHOWS, "New episodes, show by show" (Geist 600 14), then the shows as
 * 2-column tiles (raise, radius 22, 12 of padding, 10 between): the cover 48 (radius 12) and the switch on top, the name in Geist 600 13 under
 * them; all off (dimmed) while New episodes is off. The section is part of this component, so a listener who follows nothing sees no label.
 */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { Section, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';
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
  if (error && shows === undefined) return <Section><Type step="caption" className="text-text2 font-normal">{error}</Type></Section>;
  if (shows === undefined || shows.length === 0) return null;
  // Two tiles a row; an odd last tile keeps its half width.
  const pairs: NotifyShow[][] = [];
  for (let i = 0; i < shows.length; i += 2) pairs.push(shows.slice(i, i + 2));
  const cell = (s: NotifyShow) => {
    const label = s.title || props.titleOf(s.feedUrl) || s.feedUrl;
    return (
      <Box key={s.feedUrl} style={{ flex: 1, minWidth: 0 }}>
        <Tile testID="show-tile" style={{ padding: SET.showPad, gap: SET.tileGap }}>
          <Box className="flex-row items-start justify-between">
            <Artwork url={props.artOf?.(s.feedUrl) ?? null} size={SET.showCover} rounded="row" name={label} />
            <Toggle value={s.enabled && !props.disabled} onChange={(v) => flip(s.feedUrl, v)} label={label} {...(props.disabled !== undefined ? { disabled: props.disabled } : {})} />
          </Box>
          <Type step="caption" className="text-text font-semibold" style={SET_TYPE.showName} numberOfLines={2}>{label}</Type>
        </Tile>
      </Box>
    );
  };
  return (
    <Section label="Shows" spoken="Shows, new episodes show by show">
      <Box style={{ gap: SET.gap - 4 }}>
        <Type step="compact" className="text-text" style={SET_TYPE.showsHead} accessibilityRole="header">New episodes, show by show</Type>
        {pairs.map((pair) => (
          <Box key={pair.map((s) => s.feedUrl).join('|')} className="flex-row" style={{ gap: SET.tilesGap }}>
            {pair.map(cell)}
            {pair.length === 1 ? <Box style={{ flex: 1 }} /> : null}
          </Box>
        ))}
        {error ? <Type step="caption" className="text-hotText font-normal">{error}</Type> : null}
      </Box>
    </Section>
  );
}
