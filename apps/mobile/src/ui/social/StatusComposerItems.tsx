// Add up to 10 episode cards and photos to a new status, from history, the queue, search or the photo library.
/**
 * M22 US6 (FR-020, FR-021, T026). Under the status composer (voice and text):
 *  - "Add episode" opens our own sheet: the queue and recent history on this phone, and a search
 *    box (the app's search, GET /v1/search) once two letters are typed;
 *  - "Add photo" picks one picture and shrinks it like a comment image (≤ 1600 px, JPEG,
 *    ≤ 1 000 000 bytes — `pickCommentImage`), then uploads it at once (POST /v1/voice-posts/images)
 *    so Post only sends its key; the server deletes it with the status at 24 h;
 *  - at 10 items both buttons stop and say "Up to 10 items" (the server refuses an 11th too).
 * Before posting, `itemsForPost` registers each episode with the server (an episode found by
 * search may not be known there yet) and returns the list the post carries.
 *
 * M31 W4-B (T051; design-pulse2 `itemsRow`, `addEpSheet`, `status-text--add-episode-sheet`, `status-composer-items--toast`, `status-text--photo-picker`): the items
 * row is two chips with a 16 glyph (Add episode, Add photo) and "n / 10 · Up to 10 items" in mono 11 under them (hot at 10); added items stack under
 * it as raise rows (cover or photo 48, title, show, hot-text Remove). "Add an episode" is the kit sheet: the search field (48), the label
 * "Your queue and recent listening" or "Search results", a deck of 150 cards (cover 130, title, show) and a quiet Cancel. Same buttons, toasts and handlers.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { ScrollView } from '@/ui/lib/scroll-view';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Chip } from '@/ui/kit/Chip';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { SearchField } from '@/ui/me/lists';
import { useStores, useToast } from '@/ui/shell/providers';
import { spacing } from '@/design';
import { useSocial } from '@/social/context';
import type { ApiClient, EpisodeCard } from '@/social/api';
import { pickCommentImage } from '@/social/comment-image';
import { listeningHistory } from '@/me/history';
import { STATUS_ITEMS_MAX, useM22SocialApi, type StatusItemIn } from '@/social/api-m22-social';
import { ITEMS, TEXT_PAGE, statusType } from '@/ui/status/measures';

const REMOVE_SLOP = { top: 12, bottom: 12, left: 8, right: 8 } as const;
const DECK_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

export type ComposerItem =
  | { kind: 'episode'; card: EpisodeCard }
  | { kind: 'photo'; uri: string; imageKey: string };

/** Registers each episode with the server, then the list a post carries. Registration failures are left to the post to report. */
export async function itemsForPost(api: Pick<ApiClient, 'registerEpisode'>, items: readonly ComposerItem[]): Promise<StatusItemIn[]> {
  for (const it of items) {
    if (it.kind !== 'episode') continue;
    const e = it.card;
    await api.registerEpisode(e.id, {
      feedUrl: e.feedUrl, guid: e.guid, title: e.title, showTitle: e.showTitle, enclosureUrl: e.enclosureUrl,
      ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}), ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
    }).catch(() => undefined);
  }
  return items.map((it): StatusItemIn => (it.kind === 'episode' ? { kind: 'episode', episodeId: it.card.id } : { kind: 'photo', imageKey: it.imageKey }));
}

export function StatusComposerItems(props: { items: ComposerItem[]; onChange: (next: ComposerItem[]) => void; colours: { accent: string; muted: string; text: string } }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const { api } = useSocial();
  const m22 = useM22SocialApi();
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<EpisodeCard[]>([]);
  const full = props.items.length >= STATUS_ITEMS_MAX;

  /** The queue first, then recent history, without repeats. */
  const nearby = useMemo((): EpisodeCard[] => {
    if (!picking) return [];
    const ids = [...stores.queue.list(), ...listeningHistory(stores, 30).map((r) => r.episode.id)];
    const seen = new Set<string>();
    const out: EpisodeCard[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const e = stores.feeds.getEpisode(id);
      if (!e) continue;
      out.push({ id: e.id, feedUrl: e.feedUrl, guid: e.guid, title: e.title, showTitle: stores.feeds.getShow(e.feedUrl)?.title ?? '', enclosureUrl: e.enclosureUrl, ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}), ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}) });
    }
    return out.slice(0, 30);
  }, [picking, stores]);

  // Search once two letters are typed, a moment after typing stops.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return undefined; }
    let live = true;
    const t = setTimeout(() => { api.search(term).then((r) => { if (live) setFound(r.episodes.slice(0, 20)); }, () => undefined); }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, api]);

  const add = (card: EpisodeCard) => {
    setPicking(false);
    setQ('');
    if (full) { toast('Up to 10 items.'); return; }
    if (props.items.some((x) => x.kind === 'episode' && x.card.id === card.id)) return;
    props.onChange([...props.items, { kind: 'episode', card }]);
  };
  const addPhoto = async () => {
    if (full) { toast('Up to 10 items.'); return; }
    const r = await pickCommentImage();
    if (r.kind === 'denied') { toast('Allow photo access in the phone’s settings to add a photo.'); return; }
    if (r.kind === 'too-big') { toast('That picture is too big — pick a smaller one.'); return; }
    if (r.kind !== 'ok') return;
    setUploading(true);
    try {
      const blob = await (await fetch(r.image.uri)).blob();
      const up = await m22.uploadPhoto(blob);
      props.onChange([...props.items, { kind: 'photo', uri: r.image.uri, imageKey: up.imageKey }]);
    } catch {
      toast("Couldn't add the photo — try again.");
    } finally { setUploading(false); }
  };
  const remove = (i: number) => props.onChange(props.items.filter((_, j) => j !== i));
  const list = q.trim().length >= 2 ? found : nearby;

  return (
    <Box testID="status-items" style={{ gap: TEXT_PAGE.gap }}>
      <Box style={{ gap: ITEMS.chipGap }}>
        <Box className="flex-row items-center" style={{ gap: ITEMS.chipGap }}>
          <Chip label="Add episode" icon="headset-outline" disabled={full} onPress={() => (full ? toast('Up to 10 items.') : setPicking(true))} />
          <Chip label={uploading ? 'Adding…' : 'Add photo'} accessibilityLabel="Add photo" icon="image-outline" disabled={full || uploading} onPress={() => { if (!uploading) void addPhoto(); }} />
        </Box>
        <Type step="tag" className={full ? 'text-hotText' : 'text-text3'}>{`${props.items.length} / ${STATUS_ITEMS_MAX} · Up to 10 items`}</Type>
      </Box>

      {props.items.map((it, i) => (
        <Box key={it.kind === 'episode' ? it.card.id : it.imageKey} testID="status-item-row" className="flex-row items-center bg-raise" style={{ gap: TEXT_PAGE.item.gap, padding: TEXT_PAGE.item.pad, borderRadius: TEXT_PAGE.item.radius }}>
          {it.kind === 'photo' ? <Image source={{ uri: it.uri }} style={{ width: TEXT_PAGE.item.cover, height: TEXT_PAGE.item.cover, borderRadius: spacing.row }} accessibilityLabel={`Photo ${i + 1}`} /> : <Artwork url={it.card.imageUrl ?? null} size={TEXT_PAGE.item.cover} name={it.card.showTitle} />}
          <Box className="flex-1">
            <Type step="compact" className="text-text" numberOfLines={2}>{it.kind === 'photo' ? 'Photo' : it.card.title}</Type>
            {it.kind === 'episode' && it.card.showTitle ? <Type step="tag" className="text-text3" numberOfLines={1}>{it.card.showTitle}</Type> : null}
          </Box>
          <Pressable onPress={() => remove(i)} hitSlop={REMOVE_SLOP} accessibilityRole="button" accessibilityLabel={`Remove ${it.kind === 'photo' ? `photo ${i + 1}` : it.card.title}`}>
            <Type step="caption" className="text-hotText font-semibold">Remove</Type>
          </Pressable>
        </Box>
      ))}

      <ActionSheet open={picking} onClose={() => setPicking(false)} label="Add an episode" title="Add an episode" keyboard>
        <SearchField value={q} onChange={setQ} placeholder="Search episodes" />
        <Type step="tag" className="text-text3">{q.trim().length >= 2 ? 'Search results' : 'Your queue and recent listening'}</Type>
        {list.length === 0 ? <Type step="note" className="text-text2">{q.trim().length >= 2 ? 'Nothing found yet.' : 'Nothing in your queue or history yet — search above.'}</Type> : (
          <ScrollView testID="status-deck" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: ITEMS.card.between }}>
            {list.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => add(e)}
                hitSlop={DECK_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Add ${e.title}${e.showTitle ? `, ${e.showTitle}` : ''}`}
                className="bg-raise"
                style={{ width: ITEMS.card.width, padding: ITEMS.card.pad, borderRadius: ITEMS.card.radius, gap: ITEMS.card.gap }}
              >
                <Artwork url={e.imageUrl ?? null} size={ITEMS.card.cover} name={e.showTitle} />
                <Type step="caption" className="text-text font-semibold" style={statusType.deckTitle} numberOfLines={2}>{e.title}</Type>
                {e.showTitle ? <Type step="tag" className="text-text3" style={statusType.deckShow} numberOfLines={1}>{e.showTitle}</Type> : null}
              </Pressable>
            ))}
          </ScrollView>
        )}
        <PulseButton label="Cancel" kind="quiet" full onPress={() => setPicking(false)} />
      </ActionSheet>
    </Box>
  );
}
