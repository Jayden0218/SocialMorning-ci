// One Monday catch-up: up to 10 unplayed episodes from last week's subscriptions, each with ▶, and Queue all.
/**
 * M22 US15 (FR-045, FR-046; contracts/api.md "Weekly digest"). The Monday push opens
 * `/digest/<isoWeek>` (e.g. `/digest/2026-W41`). The list comes from GET /v1/me/digests (the last
 * 4 weeks are kept); newest show first, as the server stored it. ▶ plays the episode from the
 * publisher's own audio; "Queue all" adds every one to the end of the queue. A PLUS perk — the
 * server only makes digests for PLUS members with Settings › Push › Weekly digest on.
 */
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Artwork } from '@/ui/kit/Artwork';
import { BottomBar } from '@/ui/kit/BottomBar';
import { Button } from '@/ui/kit/Button';
import { Loader } from '@/ui/kit/Loader';
import { PlayIcon } from '@/ui/kit/Icon';
import { mmss } from '@/ui/kit/format';
import { hit } from '@/design';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { queueEpisode } from '@/settings/queue';
import { useSocial } from '@/social/context';
import { useM22Api, type Digest, type DigestEpisode } from '@/social/api-m22-server';

const PLAY = { width: hit.min, height: hit.min };

export default function DigestScreen(): React.ReactElement {
  const { week } = useLocalSearchParams<{ week: string }>();
  const api = useM22Api();
  const stores = useStores();
  const downloads = useDownloads();
  const toast = useToast();
  const player = usePlayer();
  const { listener } = useSocial();
  const [digest, setDigest] = useState<Digest | 'none' | 'error' | undefined>();

  useEffect(() => {
    if (!listener) { setDigest('none'); return undefined; }
    let live = true;
    api.digests().then(
      (items) => { if (live) setDigest(items.find((d) => d.isoWeek === week) ?? items[0] ?? 'none'); },
      () => { if (live) setDigest('error'); },
    );
    return () => { live = false; };
  }, [api, listener, week]);

  const play = (e: DigestEpisode): void => {
    const local = toPlayable(stores, e.id);
    player.load(local ?? {
      id: e.id, url: e.enclosureUrl, title: e.title, showTitle: e.showTitle ?? '', feedUrl: e.feedUrl,
      ...(e.imageUrl ? { artworkUrl: e.imageUrl } : {}), ...(e.durationMs ? { durationMs: e.durationMs } : {}),
    }, 'play');
  };
  const queueAll = (items: DigestEpisode[]): void => {
    let added = 0;
    for (const e of items) {
      const r = queueEpisode(stores, downloads, e.id, Date.now(), 'end');
      if (r.kind === 'full') { toast('The queue is full (300). Remove something first.'); break; }
      added++;
    }
    if (added > 0) toast(`Added ${added} to the queue`);
  };

  const ready = digest !== undefined && digest !== 'none' && digest !== 'error';
  return (
    <>
      <PageHeader title="Weekly catch-up" {...(ready ? { subtitle: `New last week · ${digest.episodes.length} unplayed` } : {})} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-gap">
        {digest === undefined ? <Box className="items-center mt-section"><Loader /></Box> : null}
        {digest === 'none' ? <Text className="text-muted text-body text-center mt-section">No catch-up here. PLUS members get one on Mondays when their shows had new episodes.</Text> : null}
        {digest === 'error' ? <Text className="text-muted text-body text-center mt-section">Couldn't load your catch-up. Try again later.</Text> : null}
        {ready ? digest.episodes.map((e) => (
          <Box key={e.id} className="flex-row items-center gap-row bg-surface border border-border rounded-row p-row">
            <Artwork url={e.imageUrl} size={56} name={e.showTitle ?? e.title} />
            <Box className="flex-1">
              <Text className="text-text text-sm font-bold" numberOfLines={2}>{e.title}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{[e.showTitle, e.durationMs ? mmss(e.durationMs) : undefined].filter(Boolean).join(' · ')}</Text>
            </Box>
            <Pressable onPress={() => play(e)} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} className="rounded-pill bg-primary items-center justify-center" style={PLAY}>
              <PlayIcon size={16} tint="onPrimary" />
            </Pressable>
          </Box>
        )) : null}
      </ScrollView>
      {ready && digest.episodes.length > 0 ? (
        <BottomBar tone="surface" line="border" className="flex-row items-center">
          <Button label="Queue all" onPress={() => queueAll(digest.episodes)} className="flex-1" />
        </BottomBar>
      ) : null}
    </>
  );
}
