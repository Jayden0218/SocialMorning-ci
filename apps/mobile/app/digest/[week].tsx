// One Monday catch-up: up to 10 unplayed episodes from last week's subscriptions, each with ▶, and Queue all.
/**
 * M22 US15 (FR-045, FR-046; contracts/api.md "Weekly digest"). The Monday push opens
 * `/digest/<isoWeek>` (e.g. `/digest/2026-W41`). The list comes from GET /v1/me/digests (the last
 * 4 weeks are kept); newest show first, as the server stored it. ▶ plays the episode from the
 * publisher's own audio; "Queue all" adds every one to the end of the queue. A PLUS perk — the
 * server only makes digests for PLUS members with Settings › Push › Weekly digest on.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `digest--screen`, `digest--none`, `toast--digest`, layout pattern Deck): a pushed page, the title bar low
 * ("Weekly catch-up", "New last week · 4 unplayed") with **Queue all** (hot, 48, full width) in the zone above it — the main action under
 * the thumb. Under the edge label UNPLAYED a Deck of cards 290 x 230: the cover (72), "Show · Mon" and the title (Unbounded 700 16), the
 * heat curve (40 bars, 26), the length in mono and Play (42). Under SHOWS the covers (56) of the shows they came from. None: the empty block
 * "No catch-up here." with PLUS's line, no Queue all. Error: "Couldn't load your catch-up. Try again later.".
 *
 * Not as drawn: the toast ("Added 4 to the queue") sits where a pushed page's toasts do, not 216 up over the Queue all zone — the toast's
 * lift is the shell's (`src/ui/shell/toastPlacement.ts`, not this lane's).
 */
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Curve } from '@/ui/kit/Curve';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { minutesLabel } from '@/ui/kit/format';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { queueEpisode } from '@/settings/queue';
import { useSocial } from '@/social/context';
import { useM22Api, type Digest, type DigestEpisode } from '@/social/api-m22-server';
import { ErrTile } from '@/ui/chat/blocks';
import { DECK, Deck, DeckCard, DeckSection, DiscPlay } from '@/ui/discover/Deck';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop } from '@/ui/discover/page-parts';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { DRAWN, emptyTop, PageEmpty } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';

const NO_HEAT: readonly number[] = new Array<number>(100).fill(0);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** The Queue all zone is the 48 button and the gap above the title row. */
const QUEUE_ZONE = hit.min + spacing.gap + 2;

function DigestCard(props: { e: DigestEpisode; onPlay: () => void }): React.ReactElement {
  const { e } = props;
  const heat = useEpisodeHeat(e.id, true);
  const day = e.publishedAt ? DAYS[new Date(e.publishedAt).getDay()] : undefined;
  const line = [e.showTitle, day].filter(Boolean).join(' · ');
  return (
    <DeckCard>
      <Box className="flex-row items-center" style={{ padding: DECK.pad, gap: PAGE.card.issue.pad }}>
        <Artwork url={e.imageUrl} size={PAGE.digest.cover} name={e.showTitle ?? e.title} />
        <Box className="flex-1 min-w-0">
          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{line}</Type>
          <Type step="lede" className="text-text" style={PAGE_TYPE.tile14} numberOfLines={2}>{e.title}</Type>
        </Box>
      </Box>
      <Box style={{ paddingHorizontal: DECK.pad }}><Curve data={heat.buckets ?? NO_HEAT} count={40} height={26} min={2} played={heat.buckets ? 1 : 0} flat={heat.buckets === undefined} /></Box>
      <Box className="flex-row items-center mt-auto" style={{ padding: DECK.pad, gap: 8 }}>
        <Type step="tag" className="text-text3 flex-1" style={PAGE_TYPE.mono11}>{e.durationMs ? minutesLabel(e.durationMs) : ''}</Type>
        <DiscPlay size={42} title={e.title} onPress={props.onPlay} />
      </Box>
    </DeckCard>
  );
}

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
  const episodes = ready ? digest.episodes : [];
  const shows = episodes.filter((e, i) => episodes.findIndex((x) => x.feedUrl === e.feedUrl) === i);
  const queueButton = ready && episodes.length > 0 ? <PulseButton kind="hot" full icon="list-outline" label="Queue all" onPress={() => queueAll(episodes)} /> : undefined;
  return (
    <PushedPage
      title="Weekly catch-up"
      {...(ready ? { subtitle: `New last week · ${episodes.length} unplayed` } : {})}
      {...(queueButton ? { extra: queueButton, extraAbove: QUEUE_ZONE } : {})}
    >
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: bodyTop(layout, PAGE.body70), paddingBottom: layout.reserve }}>
          {digest === undefined ? <Box className="items-center" style={{ marginTop: spacing.section }}><Loader /></Box> : null}
          {digest === 'none' ? <PageEmpty top={emptyTop(250) - (PAGE.body70 - DRAWN.listTop)} title="No catch-up here." line="PLUS members get one on Mondays when their shows had new episodes." /> : null}
          {digest === 'error' ? <ErrTile line="Couldn't load your catch-up. Try again later." /> : null}
          {ready && episodes.length > 0 ? (
            <>
              <DeckSection label="Unplayed">
                <Deck width={PAGE.digest.width} height={PAGE.digest.height} accessibilityLabel="Unplayed episodes">
                  {episodes.map((e) => <DigestCard key={e.id} e={e} onPlay={() => play(e)} />)}
                </Deck>
              </DeckSection>
              <DeckSection label="Shows">
                <Box testID="digest-shows" className="flex-row" style={{ marginLeft: ME_MOSAIC.lane, gap: PAGE.gap, flexWrap: 'wrap' }}>
                  {shows.map((e) => <Artwork key={e.feedUrl} url={e.imageUrl} size={56} name={e.showTitle ?? e.title} />)}
                </Box>
              </DeckSection>
            </>
          ) : null}
        </ScrollView>
      )}
    </PushedPage>
  );
}
