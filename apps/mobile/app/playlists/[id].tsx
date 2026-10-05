// One playlist: its episodes in order, Play all; yours can be renamed, reordered, made public or deleted.
/**
 * M19 T041 (US4, FR-030/031): a playlist (合集). Anyone opens a public one; someone else's
 * private one answers not found (the server's 404). The serif title, "By <owner> · n episodes",
 * then a yellow "Play all" pill: the first episode plays now and the rest go next in the queue,
 * in order (each episode is resolved through its show's feed first, as Discover's cards are).
 *
 * Yours adds: a Public switch (the app's own Toggle), Rename (an inline name box), Delete (asks
 * first, through the app's own confirm sheet), and on every episode row Move up · Move down ·
 * Remove. No drag library (no new dependencies): the arrows are 48 pt buttons, and every change
 * sends the whole ordered list (PUT …/items), so the order reaches your other phones (FR-032).
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import { ApiError, type EpisodeCard } from '@/social/api';
import { PLAYLIST_TITLE_MAX, useM19Api, type Playlist } from '@/social/m19-api';
import { goBack, PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Card } from '@/ui/kit/Card';
import { Toggle } from '@/ui/kit/Toggle';
import { useConfirm } from '@/ui/kit/confirm';
import { useColours } from '@/ui/kit/useColours';
import { useCardActions } from '@/discover/useDiscover';
import { resolveCard } from '@/discover/open';
import { refreshShow } from '@/feeds/fetch';
import { toPlayable } from '@/storage/playable';
import { queueEpisode } from '@/settings/queue';
import { usePlayer } from '@/playback/store';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
const ROUND = { minHeight: hit.min, minWidth: hit.min };
/** B's primary pill: 52 pt. */
const PILL = { minHeight: 52 };

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ok'; playlist: Playlist; items: EpisodeCard[] };

export default function PlaylistScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
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
    return (
      <>
      <PageHeader title="Playlist" />
      <Box className="flex-1 bg-background px-screen-x gap-row">
        {state.kind === 'loading' ? <Box className="items-center p-4"><Loader /></Box> : null}
        {state.kind === 'missing' ? <Text className="text-muted text-body">This playlist was not found. It may be private, or deleted.</Text> : null}
        {state.kind === 'error' ? (
          <>
            <Text className="text-text text-body">Couldn't load this playlist right now.</Text>
            <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
          </>
        ) : null}
      </Box>
      </>
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
  return (
    <>
    <PageHeader title={playlist.title} subtitle={`${by}${plural(items.length, 'episode')}`} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Pressable onPress={() => void playAll()} disabled={busy || items.length === 0} accessibilityRole="button" accessibilityLabel={`Play all ${plural(items.length, 'episode')}`} accessibilityState={{ disabled: busy || items.length === 0 }} className={`flex-row gap-gap items-center justify-center rounded-pill bg-primary ${items.length === 0 ? 'opacity-40' : ''}`} style={PILL}>
        <Icon name="play" size={18} color={c.onPrimary} />
        <Text className="text-onPrimary text-body font-bold">Play all</Text>
      </Pressable>

      {mine ? (
        <Card className="py-row gap-row">
          <Box className="flex-row items-center gap-section" style={TAP}>
            <Box className="flex-1">
              <Text className="text-text text-body font-bold">Public</Text>
              <Text className="text-muted text-xs mt-0.5">{playlist.isPublic ? 'On your profile; anyone with the link can open it' : 'Only you can see it'}</Text>
            </Box>
            <Toggle value={playlist.isPublic} onChange={setPublic} label="Public playlist" />
          </Box>
          {renaming !== undefined ? (
            <Box className="flex-row items-center gap-gap">
              <Input className="flex-1 bg-background border border-border rounded-row h-auto px-0">
                <InputField value={renaming} onChangeText={setRenaming} maxLength={PLAYLIST_TITLE_MAX} placeholder="Playlist name" placeholderTextColor={c.muted} accessibilityLabel="Playlist name" returnKeyType="done" onSubmitEditing={rename} autoFocus className="p-row text-text text-body" />
              </Input>
              <Pressable onPress={() => setRenaming(undefined)} accessibilityRole="button" accessibilityLabel="Cancel rename" className="justify-center px-row" style={TAP}><Text className="text-accent text-body font-bold">Cancel</Text></Pressable>
              <Pressable onPress={rename} disabled={busy} accessibilityRole="button" accessibilityLabel="Save name" className="justify-center rounded-pill bg-primary px-section" style={TAP}><Text className="text-onPrimary text-body font-bold">Save</Text></Pressable>
            </Box>
          ) : (
            <Box className="flex-row gap-row">
              <Pressable onPress={() => setRenaming(playlist.title)} accessibilityRole="button" accessibilityLabel="Rename playlist" className="flex-1 flex-row gap-gap items-center justify-center rounded-pill border border-border bg-background" style={TAP}>
                <Icon name="create-outline" size={18} color={c.accent} />
                <Text className="text-text text-body font-semibold">Rename</Text>
              </Pressable>
              <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="Delete playlist" className="flex-1 flex-row gap-gap items-center justify-center rounded-pill border border-border bg-background" style={TAP}>
                <Icon name="trash-outline" size={18} color={c.accent} />
                <Text className="text-text text-body font-semibold">Delete</Text>
              </Pressable>
            </Box>
          )}
        </Card>
      ) : null}

      <Box className="gap-row">
        {items.length === 0 ? (
          <Text className="text-muted text-body">{mine ? 'No episodes yet. Use Add to playlist in any episode\'s menu.' : 'No episodes in this playlist yet.'}</Text>
        ) : items.map((e, i) => (
          <Box key={e.id} className="bg-surface border border-border rounded-row p-row gap-gap">
            <Box className="flex-row gap-row items-center">
              <Pressable onPress={() => void cards.open(e)} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${e.title}, ${e.showTitle}`} className="flex-1 flex-row gap-row items-center" style={TAP}>
                <Text className="text-muted text-meta font-bold w-6 text-center">{i + 1}</Text>
                <Artwork url={e.imageUrl} size={52} rounded="row" name={e.showTitle} />
                <Box className="flex-1 gap-0.5">
                  <Text className="text-text text-sm font-display" numberOfLines={2}>{e.title}</Text>
                  <Text className="text-muted text-xs" numberOfLines={1}>{e.showTitle}</Text>
                </Box>
              </Pressable>
              <Pressable onPress={() => void cards.play(e)} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} className="items-center justify-center rounded-pill bg-playDisc" style={ROUND}>
                <Icon name="play" size={18} color={c.playGlyph} />
              </Pressable>
            </Box>
            {mine ? (
              <Box className="flex-row justify-end gap-1">
                <Pressable onPress={() => move(i, i - 1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${e.title} up`} accessibilityState={{ disabled: i === 0 }} className={`items-center justify-center rounded-pill border border-border ${i === 0 ? 'opacity-40' : ''}`} style={ROUND}>
                  <Icon name="arrow-up" size={18} color={c.text} />
                </Pressable>
                <Pressable onPress={() => move(i, i + 1)} disabled={i === items.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${e.title} down`} accessibilityState={{ disabled: i === items.length - 1 }} className={`items-center justify-center rounded-pill border border-border ${i === items.length - 1 ? 'opacity-40' : ''}`} style={ROUND}>
                  <Icon name="arrow-down" size={18} color={c.text} />
                </Pressable>
                <Pressable onPress={() => saveOrder(items.filter((x) => x.id !== e.id))} accessibilityRole="button" accessibilityLabel={`Remove ${e.title} from the playlist`} className="items-center justify-center rounded-pill border border-border" style={ROUND}>
                  <Icon name="close" size={18} color={c.text} />
                </Pressable>
              </Box>
            ) : null}
          </Box>
        ))}
        {items.length > 0 ? <EndOfList /> : null}
      </Box>
    </ScrollView>
    {dialog}
    </>
  );
}
