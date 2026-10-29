// One curated issue: editor's intro, then numbered picks with the editor's notes.
/**
 * One curated issue (M12 FR-101): the editor's intro, then numbered picks, each with the
 * editor's note. From the same curation file as Editor's picks (`picks.json`). A pick the
 * server cannot name as an episode yet keeps its note and opens the show.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `issue--screen`, `issue--share`, layout pattern Thread): a pushed page, the title bar low (the
 * issue's title at 24, "Issue No. 12", a share circle = "Share this issue" once it has loaded). Above the thread the issue's "NO. 12 ·
 * TUESDAY, 27 OCTOBER" in hot-text mono and the intro (Geist 500 15/22, as paragraphs). The picks are a numbered Thread (36 rings on a 2 wide
 * spine at x 36): each card is raise, radius 20, with the episode (cover 64, the show, the title in Unbounded 700 15, Play 38), the editors' note
 * in italics (14/20), then "Open the show ›" in hot-text and Subscribe (light, 32) / Subscribed (quiet). A pick with no episode keeps the link,
 * the note and the button. Loading, Retry (the error tile "Couldn't load this issue."), the hidden-show filter and the pick order are unchanged.
 *
 * M21 T086 (FR-064): the issue's number ("No. 4", from the server: oldest = 1) over the title;
 * the intro as paragraphs (split at its line breaks); each pick shows its show's cover large, and
 * a Subscribe button for the show (the same local write and sync as the show page); Share (top
 * right) sends the issue's title, intro and picks as text.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useCardActions } from '@/discover/useDiscover';
import { dayTitle } from '@/discover/sections';
import { useSafety } from '@/safety/context';
import { useM12Api, type Issue } from '@/social/m12-api';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { DiscPlay } from '@/ui/discover/Deck';
import { RetryTile } from '@/ui/discover/Mosaic';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop, NumberedThread, ThreadRow } from '@/ui/discover/page-parts';
import { ME_MOSAIC } from '@/ui/me/mosaic';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; issue: Issue };
/** A card's rows are 12 of padding and 8 apart; the cards 16 apart. */
const CARD_GAP = 8;
const ROW_GAP = 16;

export default function IssueScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  const readSubscribed = useCallback(() => new Set(stores.subscriptions.list().map((s) => s.feedUrl)), [stores]);
  const [subscribed, setSubscribed] = useState<Set<string>>(readSubscribed);
  // The same store calls and push as the show page's Subscribe: local write first, then the sync.
  const toggleSubscription = (feedUrl: string): void => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubscribed(readSubscribed());
  };
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => m12.issue(String(id)).then((issue) => ({ issue })), [m12, id], 'issue.load');
  const items = state.kind === 'ok' ? [...state.issue.items].sort((a, b) => a.order - b.order).filter((i) => !hiddenFeeds.has(i.feedUrl)) : [];
  // M21: the issue's number comes from the server (not in the M12 type, so read with care).
  const number = state.kind === 'ok' ? (state.issue as Issue & { number?: number }).number : undefined;
  const paragraphs = state.kind === 'ok' ? state.issue.intro.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0) : [];
  const share = (): void => {
    if (state.kind !== 'ok') return;
    const lines = [number ? `No. ${number} · ${state.issue.title}` : state.issue.title, state.issue.intro, ...items.map((it, n) => `${n + 1}. ${it.episode ? `${it.episode.title} — ${it.episode.showTitle}` : it.feedUrl}`)];
    Share.share({ message: lines.join('\n\n') }).catch(() => { /* dismissed */ });
  };
  return (
    <PushedPage
      title={state.kind === 'ok' ? state.issue.title : 'Issue'}
      size={24}
      subtitle={number ? `Issue No. ${number}` : 'Issue'}
      actions={state.kind === 'ok' ? [{ icon: 'share-outline', label: 'Share this issue', onPress: share }] : []}
    >
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: bodyTop(layout), paddingBottom: layout.reserve }}>
          {state.kind === 'loading' ? <Loader className="my-section" /> : null}
          {state.kind === 'error' ? <RetryTile line="Couldn't load this issue." onRetry={load} /> : null}
          {state.kind === 'ok' ? (
            <Box testID="issue-head" style={{ paddingLeft: ME_MOSAIC.lane, paddingRight: PAGE.pad + 6, paddingBottom: PAGE.pad + 2, gap: 8 }}>
              <Type step="tag" className="text-hotText" style={PAGE_TYPE.mono11}>{`${number ? `NO. ${number} · ` : 'ISSUE · '}${dayTitle(state.issue.date).toUpperCase()}`}</Type>
              {paragraphs.map((p, k) => <Type key={k} step="body" className="text-quote font-medium">{p}</Type>)}
            </Box>
          ) : null}
          {items.length > 0 ? (
            <NumberedThread>
              {items.map((it, i) => {
                const card = it.episode;
                const on = subscribed.has(it.feedUrl);
                const name = card?.showTitle ?? 'this show';
                return (
                  <ThreadRow key={`${it.order}-${it.feedUrl}`} n={i + 1} gap={ROW_GAP}>
                    <Box className="bg-raise overflow-hidden" style={{ borderRadius: PAGE.card.issue.radius }}>
                      {card ? (
                        <Box className="flex-row items-center" style={{ padding: PAGE.card.issue.pad, gap: PAGE.card.issue.pad }}>
                          <Pressable onPress={() => void open(card)} accessibilityRole="button" accessibilityLabel={`${card.title}, ${card.showTitle}`} className="flex-1 flex-row items-center min-w-0" style={{ gap: PAGE.card.issue.pad }}>
                            <Artwork url={card.imageUrl} size={64} name={card.showTitle} />
                            <Box className="flex-1 min-w-0">
                              <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{card.showTitle}</Type>
                              <Type step="lede" className="text-text" style={PAGE_TYPE.note15} numberOfLines={2}>{card.title}</Type>
                            </Box>
                          </Pressable>
                          <DiscPlay size={38} title={card.title} onPress={() => void play(card)} />
                        </Box>
                      ) : null}
                      {it.note ? <Type step="note" className="text-quote italic" style={{ paddingHorizontal: PAGE.card.issue.pad, paddingBottom: CARD_GAP + 4, ...(card ? null : { paddingTop: PAGE.card.issue.pad }) }}>{`“${it.note}”`}</Type> : null}
                      <Box className="flex-row items-center" style={{ paddingHorizontal: PAGE.card.issue.pad, paddingBottom: PAGE.card.issue.pad, gap: CARD_GAP, ...(card || it.note ? null : { paddingTop: PAGE.card.issue.pad }) }}>
                        <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(it.feedUrl) } })} accessibilityRole="link" accessibilityLabel="Open the show" className="flex-1" hitSlop={PAGE.gap}>
                          <Type step="caption" className="text-hotText font-semibold">Open the show ›</Type>
                        </Pressable>
                        <PulseButton
                          kind={on ? 'quiet2' : 'light'}
                          height={32}
                          padX={PAGE.card.issue.pad}
                          label={on ? 'Subscribed' : 'Subscribe'}
                          accessibilityLabel={on ? `Unsubscribe from ${name}` : `Subscribe to ${name}`}
                          selected={on}
                          onPress={() => toggleSubscription(it.feedUrl)}
                        />
                      </Box>
                    </Box>
                  </ThreadRow>
                );
              })}
            </NumberedThread>
          ) : null}
        </ScrollView>
      )}
    </PushedPage>
  );
}
