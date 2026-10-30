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
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Sheet } from '@/ui/kit/Sheet';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { hit } from '@/design';
import type { FeedCache } from '@/storage/types';
import type { QueueChoice, QueueSync } from '@/sync/queue';

const PILL = { minHeight: hit.min };

/** "3 episodes" and the first 3 titles (an episode this phone has never seen shows as "An episode"). */
export function listSummary(ids: readonly string[], feeds: Pick<FeedCache, 'getEpisode'>): { count: string; titles: string[] } {
  return { count: ids.length === 0 ? 'Empty' : plural(ids.length, 'episode'), titles: ids.slice(0, 3).map((id) => feeds.getEpisode(id)?.title ?? 'An episode') };
}

function ListCard(props: { heading: string; ids: readonly string[]; feeds: Pick<FeedCache, 'getEpisode'>; keepLabel: string; onKeep: () => void; busy: boolean }): React.ReactElement {
  const s = listSummary(props.ids, props.feeds);
  const more = props.ids.length - s.titles.length;
  return (
    <Box className="bg-surface border border-border rounded-row p-3 mb-row gap-1">
      <Eyebrow accent>{props.heading}</Eyebrow>
      <Text className="text-text text-title font-display">{s.count}</Text>
      {s.titles.map((t, i) => <Text key={`${i}-${t}`} className="text-muted text-meta" numberOfLines={1}>{`${i + 1}. ${t}`}</Text>)}
      {more > 0 ? <Text className="text-muted text-xs">{`and ${more} more`}</Text> : null}
      <Pressable
        onPress={props.busy ? undefined : props.onKeep}
        disabled={props.busy}
        accessibilityRole="button"
        accessibilityLabel={`${props.keepLabel}: ${s.count}`}
        accessibilityState={{ disabled: props.busy }}
        className="items-center justify-center rounded-pill bg-primary mt-2"
        style={PILL}
      >
        <Text className="text-onPrimary text-body font-bold">{props.keepLabel}</Text>
      </Pressable>
    </Box>
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
  const header = (
    <Box className="px-screen-x gap-1">
      <Text className="text-text text-display font-display" accessibilityRole="header">Which playlist do you want to keep?</Text>
      <Text className="text-muted text-meta">Your playlist changed on this phone and on another device. The one you keep is used on both; the other is saved in Playlist backups.</Text>
    </Box>
  );
  return (
    <Sheet open={props.open && c !== undefined} onClose={props.onClose} label="Which playlist do you want to keep?" header={header} snapPoints={[0.75, 0.92]}>
      {c !== undefined ? (
        <ScrollView className="w-full" contentContainerClassName="px-screen-x pt-row pb-section">
          <ListCard heading="This phone" ids={c.local} feeds={props.feeds} keepLabel="Keep this phone's" onKeep={() => props.onKeep('local')} busy={props.busy === true} />
          <ListCard heading={c.serverDevice !== null ? 'Your other device' : 'Your account'} ids={c.server} feeds={props.feeds} keepLabel="Keep the other one" onKeep={() => props.onKeep('server')} busy={props.busy === true} />
        </ScrollView>
      ) : null}
    </Sheet>
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
