// The sheet that asks which playlist to keep when this phone and another changed it.
/**
 * M22 US4 (FR-015, spec scenario 2): "Which playlist do you want to keep?" with both lists —
 * the count and the first 3 titles of each — and one Keep button per list. The choice wins on
 * both devices (src/sync/queue.ts pushes or takes it); the other list is saved as a backup
 * (Settings › Playback › Playlist backups).
 *
 * Drawn once, at the root (src/ui/shell/providers.tsx), over every page. Closing it without a
 * choice keeps the question: it shows again the next time the app comes to the front, and the
 * queue does not sync until it is answered — nothing is chosen for the listener (SC-003).
 *
 * M31 W3-B (T041; design-pulse2 `queue--conflict-chooser`, "Layout: Mosaic"): the title (Unbounded 22), the line
 * (15, text2), two side-by-side tiles — `This phone` (the hot 1.5 outline: the default) and `Your other device` /
 * `Your account`: a mono label, the count in Unbounded 34, the first title and "and n more", three covers 30 wide
 * overlapping by 8 — then two pills at the thumb: "Keep this phone's: n" (light) and "Keep the other one: n"
 * (quiet). No close circle; the scrim, Back and the system's escape still leave the question open (above).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { plural } from '@socialmorning/social-core';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { colour, hit, radius } from '@/design';
import type { FeedCache } from '@/storage/types';
import type { QueueChoice, QueueSync } from '@/sync/queue';
import { CHOOSER, queueType } from './measures';

const LABEL = 'Which playlist do you want to keep?';
/** "3 episodes" and the first 3 titles (an episode this phone has never seen shows as "An episode"). */
export function listSummary(ids: readonly string[], feeds: Pick<FeedCache, 'getEpisode'>): { count: string; titles: string[] } {
  return { count: ids.length === 0 ? 'Empty' : plural(ids.length, 'episode'), titles: ids.slice(0, 3).map((id) => feeds.getEpisode(id)?.title ?? 'An episode') };
}

function ListTile(props: { heading: string; ids: readonly string[]; feeds: Pick<FeedCache, 'getEpisode'>; chosen: boolean }): React.ReactElement {
  const s = listSummary(props.ids, props.feeds);
  const more = props.ids.length - 1;
  const first = s.titles[0];
  const sub = first === undefined ? 'Nothing queued' : more > 0 ? `${first}, and ${more} more` : first;
  return (
    <Box testID="chooser-tile" className="flex-1 bg-raise" style={{ padding: CHOOSER.tilePad, gap: CHOOSER.partGap, borderRadius: radius.artworkLarge, ...(props.chosen ? { borderWidth: CHOOSER.outline, borderColor: colour.hot } : null) }}>
      <Type step="edge" className="text-text3" numberOfLines={1}>{props.heading.toUpperCase()}</Type>
      <Type step="figure" className="text-text">{String(props.ids.length)}</Type>
      <Type step="caption" className="text-text2" numberOfLines={3} style={queueType.sub}>{sub}</Type>
      <Box className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
        {props.ids.slice(0, 3).map((id, k) => {
          const e = props.feeds.getEpisode(id);
          return (
            <Box key={`${k}-${id}`} className="bg-raise overflow-hidden" style={{ marginLeft: k === 0 ? 0 : -CHOOSER.overlap, borderWidth: CHOOSER.coverLine, borderColor: colour.raise, borderRadius: CHOOSER.coverRadius + CHOOSER.coverLine }}>
              <Artwork url={e?.imageUrl} size={CHOOSER.cover} name={e?.title ?? 'An episode'} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function KeepPill(props: { keepLabel: string; ids: readonly string[]; feeds: Pick<FeedCache, 'getEpisode'>; kind: 'light' | 'quiet'; onKeep: () => void; busy: boolean }): React.ReactElement {
  const s = listSummary(props.ids, props.feeds);
  return (
    <Pressable
      onPress={props.busy ? undefined : props.onKeep}
      disabled={props.busy}
      accessibilityRole="button"
      accessibilityLabel={`${props.keepLabel}: ${s.count}`}
      accessibilityState={{ disabled: props.busy }}
      className={`items-center justify-center rounded-pill ${props.kind === 'light' ? 'bg-text' : 'bg-raise'} ${props.busy ? 'opacity-40' : ''}`}
      style={{ minHeight: hit.min }}
    >
      <Type step="row" className={props.kind === 'light' ? 'text-void' : 'text-text'}>{`${props.keepLabel}: ${props.ids.length}`}</Type>
    </Pressable>
  );
}

export function QueueChooser(props: {
  choice: QueueChoice | undefined;
  open: boolean;
  feeds: Pick<FeedCache, 'getEpisode'>;
  onKeep: (keep: 'local' | 'server') => void;
  onClose: () => void;
  busy?: boolean;
}): React.ReactElement | null {
  const c = props.choice;
  const busy = props.busy === true;
  return (
    <ActionSheet open={props.open && c !== undefined} onClose={props.onClose} label={LABEL}>
      {c !== undefined ? (
        <>
          <Type step="title" className="text-text" accessibilityRole="header">{LABEL}</Type>
          <Type step="body" className="text-text2">Your playlist changed on this phone and on another device. The one you keep is used on both; the other is saved in Playlist backups.</Type>
          <Box className="flex-row" style={{ gap: CHOOSER.tileGap }}>
            <ListTile heading="This phone" ids={c.local} feeds={props.feeds} chosen />
            <ListTile heading={c.serverDevice !== null ? 'Your other device' : 'Your account'} ids={c.server} feeds={props.feeds} chosen={false} />
          </Box>
          <KeepPill keepLabel="Keep this phone's" ids={c.local} feeds={props.feeds} kind="light" onKeep={() => props.onKeep('local')} busy={busy} />
          <KeepPill keepLabel="Keep the other one" ids={c.server} feeds={props.feeds} kind="quiet" onKeep={() => props.onKeep('server')} busy={busy} />
        </>
      ) : null}
    </ActionSheet>
  );
}

/** The root's copy: follows the sync's pending choice; reopens when the app comes back to the front. */
export function QueueChooserHost(props: { sync: QueueSync; feeds: Pick<FeedCache, 'getEpisode'>; onError?: (message: string) => void }): React.ReactElement | null {
  const { sync } = props;
  const choice = useSyncExternalStore(sync.subscribe, sync.pending, sync.pending);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setDismissed(false); });
    return () => sub.remove();
  }, []);
  useEffect(() => { if (choice === undefined) setDismissed(false); }, [choice]);
  const keep = (k: 'local' | 'server') => {
    setBusy(true);
    void sync.choose(k)
      .catch(() => props.onError?.("Couldn't save your playlist choice. It will ask again."))
      .finally(() => setBusy(false));
  };
  return <QueueChooser choice={choice} open={!dismissed} feeds={props.feeds} onKeep={keep} onClose={() => setDismissed(true)} busy={busy} />;
}
