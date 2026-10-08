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
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Input, InputField } from '@/ui/lib/input';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Card, CardDivider } from '@/ui/kit/Card';
import { useStores, useToast } from '@/ui/shell/providers';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import type { ApiClient, EpisodeCard } from '@/social/api';
import { pickCommentImage } from '@/social/comment-image';
import { listeningHistory } from '@/me/history';
import { STATUS_ITEMS_MAX, useM22SocialApi, type StatusItemIn } from '@/social/api-m22-social';

const TAP = { minHeight: hit.min };
const THUMB = { width: 64, height: 64, borderRadius: 12 };
const SHEET = { maxHeight: 520 };

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
    <Box className="gap-row">
      {props.items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-gap">
          {props.items.map((it, i) => (
            <Box key={it.kind === 'episode' ? it.card.id : it.imageKey} className="items-center gap-1" style={{ width: 72 }}>
              {it.kind === 'photo' ? <Image source={{ uri: it.uri }} style={THUMB} accessibilityLabel={`Photo ${i + 1}`} /> : <Artwork url={it.card.imageUrl ?? null} size={64} name={it.card.showTitle} />}
              <Text className="text-text text-xs" numberOfLines={1}>{it.kind === 'photo' ? 'Photo' : it.card.title}</Text>
              <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel={`Remove ${it.kind === 'photo' ? `photo ${i + 1}` : it.card.title}`} className="items-center justify-center" style={TAP}>
                <Text className="text-accent text-xs font-bold">Remove</Text>
              </Pressable>
            </Box>
          ))}
        </ScrollView>
      ) : null}
      <Box className="flex-row gap-gap">
        <Pressable onPress={() => (full ? toast('Up to 10 items.') : setPicking(true))} accessibilityRole="button" accessibilityLabel="Add episode" accessibilityState={{ disabled: full }} className={`flex-1 flex-row items-center justify-center gap-1 rounded-pill border border-border bg-surface ${full ? 'opacity-40' : ''}`} style={TAP}>
          <Icon name="albums-outline" size={18} color={props.colours.accent} />
          <Text className="text-text text-body font-semibold">Add episode</Text>
        </Pressable>
        <Pressable onPress={() => void addPhoto()} disabled={uploading} accessibilityRole="button" accessibilityLabel="Add photo" accessibilityState={{ disabled: full || uploading }} className={`flex-1 flex-row items-center justify-center gap-1 rounded-pill border border-border bg-surface ${full || uploading ? 'opacity-40' : ''}`} style={TAP}>
          <Icon name="image-outline" size={18} color={props.colours.accent} />
          <Text className="text-text text-body font-semibold">{uploading ? 'Adding…' : 'Add photo'}</Text>
        </Pressable>
      </Box>
      <Text className={full ? 'text-accent text-xs font-bold' : 'text-muted text-xs'}>{`${props.items.length} / ${STATUS_ITEMS_MAX} · Up to 10 items`}</Text>

      <Actionsheet isOpen={picking} onClose={() => setPicking(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <Text className="text-text text-sm font-bold py-row">Add an episode</Text>
          <Input className="bg-background border border-border rounded-pill h-auto px-0">
            <InputField value={q} onChangeText={setQ} placeholder="Search episodes" placeholderTextColor={props.colours.muted} accessibilityLabel="Search episodes" style={TAP} className="px-section text-body text-text" returnKeyType="search" />
          </Input>
          <Text className="text-muted text-xs pt-gap">{q.trim().length >= 2 ? 'Search results' : 'Your queue and recent listening'}</Text>
          <ScrollView style={SHEET} keyboardShouldPersistTaps="handled">
            {list.length === 0 ? <Text className="text-muted text-body py-row">{q.trim().length >= 2 ? 'Nothing found yet.' : 'Nothing in your queue or history yet — search above.'}</Text> : (
              <Card padded={false} className="border-0">
                {list.map((e, i) => (
                  <Box key={e.id}>
                    {i > 0 ? <CardDivider /> : null}
                    <Pressable onPress={() => add(e)} accessibilityRole="button" accessibilityLabel={`Add ${e.title}${e.showTitle ? `, ${e.showTitle}` : ''}`} className="flex-row items-center gap-row py-2" style={TAP}>
                      <Artwork url={e.imageUrl ?? null} size={40} name={e.showTitle} />
                      <Box className="flex-1">
                        <Text className="text-text text-body" numberOfLines={1}>{e.title}</Text>
                        {e.showTitle ? <Text className="text-muted text-xs" numberOfLines={1}>{e.showTitle}</Text> : null}
                      </Box>
                    </Pressable>
                  </Box>
                ))}
              </Card>
            )}
          </ScrollView>
          <Pressable onPress={() => setPicking(false)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-accent text-sm font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </Box>
  );
}
