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
 *
 * M31 W4-A (T050; design-pulse2 social.html `stickers-decorate--screen`, `--chosen`, `--signed-out`, `--empty`, `--toast`; layout pattern Stage + Deck):
 * the stage is a live preview of your profile head (raise, radius 28, the glow; photo 84, name, "preview of your profile", and the hint "drag to
 * move, two fingers to resize and turn" at its foot) with the placed stickers on it. When one is chosen ("Chosen: First hour") eight 38 buttons
 * nudge it (left, up, down, right, smaller, bigger, turn left, turn right) over "To the front" and "Remove". Under the edge label "Your
 * stickers" the Deck is 96 x 118 cards (the disc 48, the name 11); a placed card has a hot border and a hot check. The title bar is back,
 * "Decorate my profile" (20), "2 of 10 placed", an Undo circle (dimmed until changed) and the hot Save. Signed out: a lock disc and "Sign in to
 * decorate your profile." with a light Sign in; none yet: "You have no stickers yet. Listen for an hour to earn the first."
 * Not as drawn: the stage is 0.6 of its width tall (210 on a 390 phone), not 250 — a layout is saved as fractions of that box and the profile
 * draws it the same, so another height would move everyone's stickers; Save is 44 tall with a 48 touch.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter } from '@/design';
import { goBack } from '@/ui/kit/PageHeader';
import { PushedPage } from '@/ui/kit/PushedPage';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Loader } from '@/ui/kit/Loader';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { StickerCanvas } from '@/ui/me/StickerCanvas';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN } from '@/ui/me/lists';
import { CenterBlock, IconBlock } from '@/ui/profile/parts';
import { StickerDisc } from '@/ui/profile/StickerDisc';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';
import { useWindowDimensions } from 'react-native';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { myStickers } from '@/me/my-stickers';
import type { Sticker } from '@/me/stickers';
import { useListeningApi } from '@/me/listening-api';
import { MAX, addSticker, bringToFront, nudge, removeSticker, sameLayout, update, type Nudge, type Placement } from '@/me/sticker-layout';

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
  const { api, listener } = useSocial();
  const stickersApi = useListeningApi();
  const toast = useToast();
  const { width } = useWindowDimensions();
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

  const chosen = list.find((p) => p.stickerId === selected);
  const earned = load.kind === 'ok' ? load.earned : [];
  const chosenTitle = earned.find((s) => s.id === selected)?.title ?? 'sticker';
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

  const ready = listener !== undefined && load.kind === 'ok';
  const right = ready ? (
    <>
      <IconButton icon="repeat-outline" label="Undo changes" fill disabled={!changed || saving} onPress={() => { setList(saved); setSelected(undefined); }} />
      <PulseButton label="Save" kind="hot" height={44} disabled={!changed} busy={saving} onPress={() => { void save(); }} />
    </>
  ) : undefined;
  const side = gutter(width);

  return (
    <PushedPage title="Decorate my profile" size={20} {...(ready && earned.length > 0 ? { subtitle: `${list.length} of ${MAX} placed` } : {})} {...(right ? { right } : {})}>
      {(layout) => {
        const top = layout.top + (PROFILE.stageTop - DRAWN.status);
        if (!listener) {
          return <Box className="flex-1"><CenterBlock top={layout.top} drawn={250}><IconBlock icon="lock-closed-outline" line="Sign in to decorate your profile."><PulseButton label="Sign in" kind="light" onPress={() => router.push('/auth/sign-in')} full /></IconBlock></CenterBlock></Box>;
        }
        if (load.kind === 'loading') return <Box className="flex-1 items-center" style={{ paddingTop: top }}><Loader /></Box>;
        if (load.kind === 'error') {
          return <Box className="flex-1"><CenterBlock top={layout.top} drawn={250}><IconBlock icon="wifi" failure line="Couldn't load your stickers right now."><PulseButton label="Retry" kind="light" onPress={() => { setLoad({ kind: 'loading' }); fetchAll(); }} full /></IconBlock></CenterBlock></Box>;
        }
        return (
          <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve }} scrollEnabled>
            <Box style={{ marginHorizontal: side }}>
              <StickerCanvas placements={list} selected={selected} onSelect={setSelected} onMove={(next) => setList((l) => update(l, next))} name={load.name} {...(load.avatarUrl ? { avatarUrl: load.avatarUrl } : {})} />
            </Box>

            {chosen ? (
              <Box testID="sticker-controls" style={{ marginHorizontal: side, marginTop: PROFILE.deckGap + 2, gap: PROFILE.photoGap }}>
                <Type step="compact" className="text-text">{`Chosen: ${chosenTitle}`}</Type>
                <Box className="flex-row" style={{ gap: PROFILE.chipGap }}>
                  {MOVES.map((m) => (
                    <Pressable key={m.how} onPress={() => setList(update(list, nudge(chosen, m.how)))} accessibilityRole="button" accessibilityLabel={`${m.label}: ${chosenTitle}`} className="flex-1 items-center justify-center bg-raise border border-line" style={{ height: PROFILE.nudge, borderRadius: PROFILE.nudgeRadius }}>
                      <Icon name={m.icon} size={18} color={colour.text} />
                    </Pressable>
                  ))}
                </Box>
                <Box className="flex-row" style={{ gap: PROFILE.photoGap - 2 }}>
                  <Box className="flex-1"><PulseButton label="To the front" accessibilityLabel={`Bring ${chosenTitle} to the front`} kind="quiet" height={PROFILE.actionHeight} full onPress={() => setList(bringToFront(list, chosen.stickerId))} /></Box>
                  <Box className="flex-1"><PulseButton label="Remove" accessibilityLabel={`Remove ${chosenTitle}`} icon="trash-outline" kind="quiet" height={PROFILE.actionHeight} full onPress={() => { setList(removeSticker(list, chosen.stickerId)); setSelected(undefined); }} /></Box>
                </Box>
              </Box>
            ) : null}

            {earned.length === 0 ? (
              <Box style={{ marginHorizontal: side, marginTop: ME_MOSAIC.lane + PROFILE.deckGap }}>
                <Type step="body" className="text-text2 text-center">You have no stickers yet. Listen for an hour to earn the first.</Type>
              </Box>
            ) : (
              <Box testID="sticker-deck" style={{ marginTop: ME_MOSAIC.lane }}>
                <EdgeLabel label="Your stickers" top={PROFILE.labelTop + 2} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: ME_MOSAIC.lane, paddingRight: side, gap: PROFILE.deckGap }}>
                  {earned.map((s) => {
                    const placed = list.some((p) => p.stickerId === s.id);
                    return (
                      <Pressable key={s.id} onPress={() => tapSticker(s.id)} accessibilityRole="button" accessibilityLabel={placed ? `${s.title}, on your profile. Choose it` : `Put ${s.title} on your profile`} accessibilityState={{ selected: s.id === selected }} className={`bg-raise items-center justify-center border ${placed ? 'border-hot' : 'border-line'}`} style={{ width: PROFILE.deckCardW, height: PROFILE.deckCardH, borderRadius: ME_MOSAIC.radius, gap: PROFILE.photoGap - 2 }}>
                        <StickerDisc icon={s.icon} size={PROFILE.deckSticker} />
                        <Type step="chip" className="text-text text-center" style={PROFILE_TYPE.deckName} numberOfLines={2}>{s.title}</Type>
                        {placed ? (
                          <Box testID="placed-check" className="absolute bg-hot items-center justify-center" style={{ right: PROFILE.photoGap - 2, top: PROFILE.photoGap - 2, width: PROFILE.badge, height: PROFILE.badge, borderRadius: PROFILE.badge / 2 }}>
                            <Icon name="checkmark" size={12} color={colour.void} />
                          </Box>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Box>
            )}
          </ScrollView>
        );
      }}
    </PushedPage>
  );
}
