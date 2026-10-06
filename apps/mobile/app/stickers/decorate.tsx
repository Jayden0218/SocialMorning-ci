// Decorate my profile: place up to 10 earned stickers on your profile header, move, resize and turn them, then Save.
/**
 * M21 US9 (T104) — the sticker canvas is OUR OWN DESIGN (owner, 2026-10-06), not a copy of 小宇宙's.
 *
 * Top: the canvas (`src/ui/me/StickerCanvas.tsx`) — a copy of the top of your profile header with
 * your stickers on it; drag with one finger, pinch and turn with two. Under it, for the chosen
 * sticker, buttons that do the same moves one step at a time (move, bigger / smaller, turn, to the
 * front, remove) — the accessible way to decorate. Then your earned stickers: tap one to put it
 * in the middle (at most 10), or to choose it if it is already up. Save sends the whole layout
 * (`PUT /v1/me/stickers/placements`); positions are fractions of the canvas, so it looks the same
 * on every phone and on everyone's view of your profile.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { PageHeader, goBack } from '@/ui/kit/PageHeader';
import { Loader } from '@/ui/kit/Loader';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { StickerCanvas } from '@/ui/me/StickerCanvas';
import { Button } from '@/ui/kit/Button';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { myStickers } from '@/me/my-stickers';
import type { Sticker } from '@/me/stickers';
import { useListeningApi } from '@/me/listening-api';
import { MAX, addSticker, bringToFront, nudge, removeSticker, sameLayout, update, type Nudge, type Placement } from '@/me/sticker-layout';

const TAP = { minHeight: hit.min, minWidth: hit.min };

const MOVES: { how: Nudge; icon: IconName; label: string }[] = [
  { how: 'left', icon: 'arrow-back', label: 'Move left' },
  { how: 'up', icon: 'arrow-up', label: 'Move up' },
  { how: 'down', icon: 'arrow-down', label: 'Move down' },
  { how: 'right', icon: 'arrow-forward', label: 'Move right' },
  { how: 'smaller', icon: 'remove', label: 'Smaller' },
  { how: 'bigger', icon: 'add', label: 'Bigger' },
  { how: 'turnLeft', icon: 'arrow-undo', label: 'Turn left' },
  { how: 'turnRight', icon: 'arrow-redo', label: 'Turn right' },
];

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; name: string; avatarUrl?: string; earned: Sticker[] };

export default function DecorateScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  const stickersApi = useListeningApi();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [saved, setSaved] = useState<Placement[]>([]);
  const [list, setList] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(() => {
    if (!listener) return;
    let live = true;
    Promise.all([api.profile(listener.listenerId), stickersApi.placements()]).then(([p, items]) => {
      if (!live) return;
      setLoad({ kind: 'ok', name: p.displayName, ...(p.avatarUrl ? { avatarUrl: p.avatarUrl } : {}), earned: myStickers(stores, p).filter((s) => s.earned) });
      setSaved(items);
      setList(items);
    }).catch(() => { if (live) setLoad({ kind: 'error' }); });
    return () => { live = false; };
  }, [api, stickersApi, listener, stores]);
  useFocusEffect(fetchAll);

  const header = <PageHeader title="Decorate my profile" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to decorate your profile.</Text></Box></>;
  if (load.kind === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (load.kind === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load your stickers right now.</Text>
        <Pressable onPress={() => { setLoad({ kind: 'loading' }); fetchAll(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }

  const chosen = list.find((p) => p.stickerId === selected);
  const chosenTitle = load.earned.find((s) => s.id === selected)?.title ?? 'sticker';
  const changed = !sameLayout(list, saved);
  const tapSticker = (id: string) => {
    if (list.some((p) => p.stickerId === id)) { setSelected(id); return; }
    if (list.length >= MAX) { toast(`At most ${MAX} stickers. Remove one first.`); return; }
    setList(addSticker(list, id));
    setSelected(id);
  };
  const save = async () => {
    setSaving(true);
    try {
      await stickersApi.savePlacements(list);
      setSaved(list);
      toast('Saved. Your profile shows your stickers.');
      goBack();
    } catch {
      toast("Couldn't save — try again when you're online.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {header}
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section" scrollEnabled>
      <StickerCanvas placements={list} selected={selected} onSelect={setSelected} onMove={(next) => setList((l) => update(l, next))} name={load.name} {...(load.avatarUrl ? { avatarUrl: load.avatarUrl } : {})} />
      <Text className="text-muted text-xs">{`${list.length} of ${MAX} placed · drag to move, two fingers to resize and turn`}</Text>

      {chosen ? (
        <Box className="gap-row bg-surface border border-border rounded-row p-row">
          <Text className="text-text text-sm font-semibold">{`Chosen: ${chosenTitle}`}</Text>
          <Box className="flex-row flex-wrap gap-gap">
            {MOVES.map((m) => (
              <Pressable key={m.how} onPress={() => setList(update(list, nudge(chosen, m.how)))} accessibilityRole="button" accessibilityLabel={`${m.label}: ${chosenTitle}`} className="items-center justify-center rounded-pill border border-border bg-background" style={TAP}>
                <Icon name={m.icon} size={20} color={c.text} />
              </Pressable>
            ))}
          </Box>
          <Box className="flex-row gap-gap">
            <Pressable onPress={() => setList(bringToFront(list, chosen.stickerId))} accessibilityRole="button" accessibilityLabel={`Bring ${chosenTitle} to the front`} className="flex-1 items-center justify-center rounded-pill border border-border" style={TAP}>
              <Text className="text-text text-body">To the front</Text>
            </Pressable>
            <Pressable onPress={() => { setList(removeSticker(list, chosen.stickerId)); setSelected(undefined); }} accessibilityRole="button" accessibilityLabel={`Remove ${chosenTitle}`} className="flex-1 items-center justify-center rounded-pill border border-border" style={TAP}>
              <Text className="text-text text-body">Remove</Text>
            </Pressable>
          </Box>
        </Box>
      ) : null}

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Your stickers</Text>
        {load.earned.length === 0 ? <Text className="text-muted text-body">You have no stickers yet. Listen for an hour to earn the first.</Text> : null}
        <Box className="flex-row flex-wrap gap-gap">
          {load.earned.map((s) => {
            const placed = list.some((p) => p.stickerId === s.id);
            return (
              <Pressable key={s.id} onPress={() => tapSticker(s.id)} accessibilityRole="button" accessibilityLabel={placed ? `${s.title}, on your profile. Choose it` : `Put ${s.title} on your profile`} accessibilityState={{ selected: s.id === selected }} className={`flex-row items-center gap-1.5 px-row rounded-pill border ${s.id === selected ? 'border-accent bg-accentTint' : 'border-border bg-surface'}`} style={TAP}>
                <Icon name={placed ? 'checkmark-circle' : s.icon} size={18} color={placed ? c.accent : c.text} />
                <Text className="text-text text-sm">{s.title}</Text>
              </Pressable>
            );
          })}
        </Box>
      </Box>

      <Box className="flex-row gap-gap">
        <Button kind="secondary" label="Undo changes" disabled={!changed || saving} onPress={() => { setList(saved); setSelected(undefined); }} className="flex-1" />
        <Button label="Save" disabled={!changed} busy={saving} onPress={() => { void save(); }} className="flex-1" />
      </Box>
    </ScrollView>
    </>
  );
}
