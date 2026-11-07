// One playlist as a deck of numbered episode cards; Play all; yours can be renamed, reordered, made public or deleted.
/**
 * M19 T041 (US4, FR-030/031): a playlist (合集). Anyone opens a public one; someone else's
 * private one answers not found (the server's 404). "By <owner> · n episodes", then a light "Play all" pill: the first
 * episode plays now and the rest go next in the queue, in order (each episode is resolved through its show's feed first,
 * as Discover's cards are).
 *
 * Yours adds: a Public switch (the app's own Toggle), Rename, Delete (asks first, through the app's own confirm
 * dialog), and on every episode card Move up · Move down · Remove. No drag library (no new dependencies): the buttons are
 * 48 pt targets, and every change sends the whole ordered list (PUT …/items), so the order reaches your other phones (FR-032).
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `playlist--screen`, `playlist--rename`, `playlist--delete-dialog`,
 * `playlist--missing`, `toast--playlist`; layout pattern Deck, as the Queue): the Public switch and its line sit at the
 * top (14 under the status bar); the numbered cards — 290 × 330, the cover 46 % with its number on it, the show, the
 * episode in Unbounded 700 18 — snap one at a time with dots under them. A card's foot: ‹ and › (move up and down), × (remove),
 * and the 44 light play circle; tapping the card opens the episode. The title bar is low: the playlist's name (tap it to
 * rename), "By you · 12 episodes", a pencil (Rename playlist) and a bin (Delete playlist), the light "Play all 12
 * episodes" above it. Renaming turns the foot into the field (Unbounded 700 20, a hot ring) with Cancel and Save. Someone else's
 * playlist shows "By {name}" and none of the edit controls. Not found: the grey glow and today's words.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { useSocial } from '@/social/context';
import { ApiError, type EpisodeCard } from '@/social/api';
import { PLAYLIST_TITLE_MAX, useM19Api, type Playlist } from '@/social/m19-api';
import { goBack } from '@/ui/kit/PageHeader';
import { Fade } from '@/ui/kit/Fade';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Icon } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { useConfirm } from '@/ui/kit/confirm';
import { CoverBand } from '@/ui/discover/Deck';
import { useCardActions } from '@/discover/useDiscover';
import { resolveCard } from '@/discover/open';
import { refreshShow } from '@/feeds/fetch';
import { toPlayable } from '@/storage/playable';
import { queueEpisode } from '@/settings/queue';
import { usePlayer } from '@/playback/store';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';
import { ME_TYPE } from '@/ui/me/measures';
import { CardDeck, DRAWN, emptyTop, KeyboardPage, PageEmpty, round, slop } from '@/ui/me/lists';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ok'; playlist: Playlist; items: EpisodeCard[] };

/** The card: 290 × 330, radius 26, the cover 46 % of it; the foot's tools are 36 and the play circle 44. */
const CARD = { height: 330, radius: 26, coverShare: 0.46, tool: 36, play: 44 } as const;
const COVER = Math.round(CARD.height * CARD.coverShare);
/** The Public row sits 64 from the top of the drawn phone; the deck 100. */
const ROW_TOP = 64;
const DECK_TOP = 100;

export default function PlaylistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { listener } = useSocial();
  const stores = useStores();
  const toast = useToast();
  const player = usePlayer();
  const downloads = useDownloads();
  const cards = useCardActions();
  const m19 = useM19Api();
  const [confirm, dialog] = useConfirm();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [renaming, setRenaming] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    m19.playlist(String(id))
      .then((p) => setState({ kind: 'ok', playlist: p, items: p.items ?? [] }))
      .catch((e) => setState((s) => (e instanceof ApiError && e.status === 404 ? { kind: 'missing' } : s.kind === 'ok' ? s : { kind: 'error' })));
  }, [m19, id]);
  useFocusEffect(load);

  if (state.kind !== 'ok') {
    const grey = state.kind === 'missing' || state.kind === 'error';
    return (
      <PushedPage title="Playlist" tone={grey ? 'grey' : 'hot'}>
        {(l) => (
          <Box className="flex-1 items-center" style={{ paddingTop: l.top + (DRAWN.listTop - DRAWN.status) }}>
            {state.kind === 'loading' ? <Box style={{ marginTop: emptyTop(260) }}><Loader /></Box> : null}
            {state.kind === 'missing' ? <PageEmpty top={emptyTop(260)} title="Not found" line="This playlist was not found. It may be private, or deleted." /> : null}
            {state.kind === 'error' ? <PageEmpty top={emptyTop(260)} title="Couldn't load" line="Couldn't load this playlist right now." action={{ label: 'Retry', onPress: () => { setState({ kind: 'loading' }); load(); } }} /> : null}
          </Box>
        )}
      </PushedPage>
    );
  }

  const { playlist, items } = state;
  const mine = listener !== undefined && playlist.owner?.id === listener.listenerId;
  const set = (next: Partial<Playlist>, nextItems: EpisodeCard[] = items) => setState({ kind: 'ok', playlist: { ...playlist, ...next }, items: nextItems });

  /** Save the whole order; on failure the old order comes back. */
  const saveOrder = (next: EpisodeCard[]) => {
    const before = items;
    set({ count: next.length }, next);
    m19.setPlaylistItems(playlist.id, next.map((e) => e.id))
      .catch(() => { set({ count: before.length }, before); toast("Couldn't save the change. Try again."); });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    if (it) next.splice(to, 0, it);
    saveOrder(next);
  };

  const setPublic = (v: boolean) => {
    set({ isPublic: v });
    m19.updatePlaylist(playlist.id, { isPublic: v }).catch(() => { set({ isPublic: !v }); toast("Couldn't save the change. Try again."); });
  };
  const rename = () => {
    const t = (renaming ?? '').trim();
    if (!t || busy) return;
    setBusy(true);
    m19.updatePlaylist(playlist.id, { title: t })
      .then(() => { set({ title: t }); setRenaming(undefined); })
      .catch(() => toast("Couldn't rename the playlist. Try again."))
      .finally(() => setBusy(false));
  };
  const remove = () => confirm({
    title: `Delete ${playlist.title}?`,
    message: 'The playlist goes from all your phones and your profile. The episodes stay where they are.',
    action: 'Delete',
    onConfirm: () => {
      m19.deletePlaylist(playlist.id).then(() => { toast('Playlist deleted.'); goBack(); }).catch(() => toast("Couldn't delete the playlist. Try again."));
    },
  });

  /** Play all: resolve each episode in order; the first plays, the rest play next, in order. */
  const playAll = async () => {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      const deps = { stores, refreshShow: (u: string) => refreshShow(u, stores.feeds, Date.now()) };
      const ids: string[] = [];
      for (const card of items) {
        const r = await resolveCard(deps, card);
        if (r.episodeId !== undefined) ids.push(r.episodeId);
      }
      const first = ids[0] !== undefined ? toPlayable(stores, ids[0]) : undefined;
      if (!first) { toast("Couldn't fetch these episodes right now."); return; }
      player.load(first, 'play');
      // 'front' puts an episode next; going through the rest backwards leaves them in order.
      for (const epId of ids.slice(1).reverse()) {
        if (queueEpisode(stores, downloads, epId, Date.now(), 'front').kind === 'full') break;
      }
      const skipped = items.length - ids.length;
      toast(`Playing ${playlist.title}${skipped > 0 ? ` · ${plural(skipped, 'episode')} could not be fetched` : ''}`);
      router.push('/player');
    } finally {
      setBusy(false);
    }
  };

  const by = playlist.owner ? `By ${mine ? 'you' : playlist.owner.displayName} · ` : '';
  const card = (i: number) => {
    const e = items[i]!;
    return (
      <Box testID="playlist-card" className="bg-raise border border-line overflow-hidden" style={{ height: CARD.height, borderRadius: CARD.radius }}>
        <Pressable onPress={() => void cards.open(e)} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${e.title}, ${e.showTitle}`} className="flex-1">
          <Box style={{ height: COVER }}>
            <CoverBand url={e.imageUrl} name={e.showTitle} height={COVER} />
            <Box className="absolute bg-glassDark" style={{ left: spacing.row, top: spacing.row, borderRadius: 6, paddingHorizontal: spacing.hair + 3, paddingVertical: 5 }} accessible={false}>
              <Type step="mono" className="text-text" style={ME_TYPE.mono11}>{String(i + 1)}</Type>
            </Box>
          </Box>
          <Box className="flex-1" style={{ padding: 14, gap: 7 }}>
            <Type step="caption" className="text-text2" style={ME_TYPE.node12} numberOfLines={1}>{e.showTitle}</Type>
            <Type step="lede" className="text-text" style={ME_TYPE.cardTitle18} numberOfLines={3}>{e.title}</Type>
          </Box>
        </Pressable>
        <Box className="flex-row items-center" style={{ gap: spacing.gap, paddingHorizontal: 14, paddingBottom: 14 }}>
          {mine ? (
            <>
              <Pressable onPress={() => move(i, i - 1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${e.title} up`} accessibilityState={{ disabled: i === 0 }} hitSlop={slop(CARD.tool)} className={`bg-raise2 items-center justify-center ${i === 0 ? 'opacity-40' : ''}`} style={round(CARD.tool)}>
                <Icon name="chevron-back" size={16} color={colour.text} />
              </Pressable>
              <Pressable onPress={() => move(i, i + 1)} disabled={i === items.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${e.title} down`} accessibilityState={{ disabled: i === items.length - 1 }} hitSlop={slop(CARD.tool)} className={`bg-raise2 items-center justify-center ${i === items.length - 1 ? 'opacity-40' : ''}`} style={round(CARD.tool)}>
                <Icon name="chevron-forward" size={16} color={colour.text} />
              </Pressable>
              <Pressable onPress={() => saveOrder(items.filter((x) => x.id !== e.id))} accessibilityRole="button" accessibilityLabel={`Remove ${e.title} from the playlist`} hitSlop={slop(CARD.tool)} className="bg-raise2 items-center justify-center" style={round(CARD.tool)}>
                <Icon name="close" size={16} color={colour.text} />
              </Pressable>
            </>
          ) : null}
          <Box className="flex-1" />
          <Pressable onPress={() => void cards.play(e)} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} hitSlop={slop(CARD.play)} className="bg-text items-center justify-center" style={[round(CARD.play), { paddingLeft: 2 }]}>
            <Icon name="play" size={18} color={colour.void} />
          </Pressable>
        </Box>
      </Box>
    );
  };

  return (
    <KeyboardPage>
      <PushedPage
        title={playlist.title}
        subtitle={`${by}${plural(items.length, 'episode')}`}
        bare={renaming !== undefined}
        {...(mine && renaming === undefined ? {
          onTitle: () => setRenaming(playlist.title),
          titleLabel: `${playlist.title}, rename`,
          actions: [
            { icon: 'pencil-outline' as const, label: 'Rename playlist', onPress: () => setRenaming(playlist.title) },
            { icon: 'trash-outline' as const, label: 'Delete playlist', onPress: remove },
          ],
        } : {})}
        extra={<PulseButton label={`Play all ${plural(items.length, 'episode')}`} accessibilityLabel={`Play all ${plural(items.length, 'episode')}`} icon="play" onPress={() => void playAll()} disabled={busy || items.length === 0} full />}
        extraAbove={48}
      >
        {(l) => (
          <Box className="flex-1">
            {mine ? (
              <Box testID="playlist-public" className="absolute flex-row items-center justify-between" style={{ left: spacing.screenX, right: spacing.screenX, top: l.top + (ROW_TOP - DRAWN.status), gap: spacing.row }}>
                <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
                  <Toggle value={playlist.isPublic} onChange={setPublic} label="Public playlist" />
                  <Type step="caption" className="text-text font-semibold">Public</Type>
                </Box>
                <Type step="caption" className="text-text2 flex-1 text-right" style={ME_TYPE.node12} numberOfLines={2}>{playlist.isPublic ? 'On your profile; anyone with the link can open it' : 'Only you can see it'}</Type>
              </Box>
            ) : null}
            <Box style={{ paddingTop: l.top + (DECK_TOP - DRAWN.status) }}>
              {items.length === 0 ? (
                <PageEmpty
                  top={emptyTop(260) - (DECK_TOP - DRAWN.listTop)}
                  title={mine ? 'No episodes yet' : 'No episodes in this playlist yet.'}
                  {...(mine ? { line: "Use Add to playlist in any episode's menu." } : {})}
                />
              ) : (
                <CardDeck count={items.length} height={CARD.height} label={playlist.title} card={card} />
              )}
            </Box>
            {renaming !== undefined ? (
              <>
                <Fade bottom={0} height={260} />
                <Box testID="playlist-rename" className="absolute" style={{ left: spacing.screenX, right: spacing.screenX, bottom: l.titleBottom, gap: spacing.row - 2, zIndex: 20 }}>
                  <Type step="mono" className="text-text3 uppercase" style={ME_TYPE.mono11}>Playlist name</Type>
                  <Input className="bg-raise2 border-hot h-auto" style={{ borderRadius: 18, borderWidth: 1.5, paddingHorizontal: 0 }}>
                    <InputField value={renaming} onChangeText={setRenaming} maxLength={PLAYLIST_TITLE_MAX} placeholder="Playlist name" placeholderTextColor={colour.text3} accessibilityLabel="Playlist name" returnKeyType="done" onSubmitEditing={rename} autoFocus className="text-text font-display font-bold" style={[ME_TYPE.rename20, { height: 48, paddingHorizontal: spacing.row + 2 }]} />
                  </Input>
                  <Box className="flex-row" style={{ gap: spacing.row - 2 }}>
                    <Pressable onPress={() => setRenaming(undefined)} accessibilityRole="button" accessibilityLabel="Cancel rename" className="flex-1 bg-raise items-center justify-center rounded-pill" style={{ height: 48 }}><Type step="row" className="text-text">Cancel</Type></Pressable>
                    <Pressable onPress={rename} disabled={busy} accessibilityRole="button" accessibilityLabel="Save name" className="flex-1 bg-text items-center justify-center rounded-pill" style={{ height: 48 }}><Type step="row" className="text-void">Save</Type></Pressable>
                  </Box>
                </Box>
              </>
            ) : null}
            {dialog}
          </Box>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
