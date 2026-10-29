// Listening badges: earned ones with their date, the rest with progress; tap one for its card, Share, help and Decorate.
/**
 * Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are.
 *
 * M21 US9 (T103): each earned card says the day it was earned when that is known (the hours
 * stickers from the server's listened days, the first moment from this phone), otherwise
 * "Earned". A tap opens the sticker's card in our own sheet: who gives it (SocialMorning), the
 * date, how it is earned, and Share. "You were #N" is left out: the server cannot tell (stickers
 * are worked out on each phone). The bar's ? opens the help page; "Decorate my profile" opens the
 * sticker canvas.
 *
 * M31 W4-A (T050; design-pulse2 social.html `stickers--screen`, `--signed-out`, `--none-earned`, `--card-sheet`, `--share-sheet`; layout
 * pattern Mosaic): a 2 x 2 hero tile — "STICKERS", "3 of 8 earned" in Unbounded 800 34, two of your stickers floating at its edge and the
 * light "Decorate my profile" button — then the stickers as 1 x 1 tiles under the edge label "Earned" ("Next up" when none is earned): a
 * disc 40 (hot ring when earned), the title 12/600, the day in mono 10; the ones still to earn follow, faint, with a 3 tall progress bar
 * and "6 of 10 h". The title bar is back, "Stickers" and the info circle ("How stickers are earned"). A tap on an earned tile opens its card
 * (a sheet: the disc 132 with a hot glow, the name in Unbounded 800 30, the day, "Given by SocialMorning · how", a light Share and a close
 * circle). Signed out: the hero says "Sign in to count your listening time.".
 *
 * Not as drawn: the hero's button and the info circle are 48 / 44 where the drawing has 44 / 44 (48 touch floor by hitSlop); the day on
 * a tile has the year ("3 Oct 2026") because the earned day is a full date.
 */
import { useEffect, useState } from 'react';
import { Share, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { earnedLine, STICKER_LOOK, stickerShareText, type Sticker } from '@/me/stickers';
import { earnedDays, myStickers } from '@/me/my-stickers';
import { useListeningApi } from '@/me/listening-api';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { StickerDisc } from '@/ui/profile/StickerDisc';
import { MosaicList } from '@/ui/profile/parts';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';

/** "17 of 42 h" → 17 / 42; anything else → 0. */
function fraction(progress: string): number {
  const m = /^(\d+) of (\d+)/.exec(progress);
  if (!m) return 0;
  const have = Number(m[1]);
  const need = Number(m[2]);
  return need > 0 ? Math.min(1, have / need) : 0;
}

/** "Earned 3 Oct 2026" → "3 Oct 2026"; "Earned" stays. The tile has room for the date alone. */
const dayOnly = (line: string): string => (line === 'Earned' ? line : line.replace(/^Earned /, ''));

const HERO_HEIGHT = ME_MOSAIC.row * 2 + ME_MOSAIC.gap;
/** The two stickers that float at the hero's edge: x from the left, y from the top, turn. */
const FLOAT = [{ x: 236, y: 26, turn: -10, size: PROFILE.heroFloatA }, { x: 262, y: 104, turn: 8, size: PROFILE.heroFloatB }] as const;
/** The hero's fill: the premium tint, fading to raise by 70 % at 140 degrees. */
const HERO_FILL = [colour.premiumTint, colour.raise] as const;
const HERO_AT = [0, 0.7] as const;

export default function StickersScreen(): React.ReactElement {
  const stores = useStores();
  const { api, listener } = useSocial();
  const listening = useListeningApi();
  const { width } = useWindowDimensions();
  // M16a bug 3: the same source as the profile card (src/me/my-stickers.ts) — this phone's totals
  // at once, then the larger of those and the server's once the profile arrives.
  const [list, setList] = useState<Sticker[]>(() => myStickers(stores, undefined));
  const [days, setDays] = useState<Record<string, string>>(() => earnedDays(undefined, stores.settings));
  const [open, setOpen] = useState<Sticker | undefined>();
  const [heroH, setHeroH] = useState(HERO_HEIGHT);
  useEffect(() => {
    if (!listener) return;
    let live = true;
    void api.profile(listener.listenerId).then((p) => {
      if (!live) return;
      setList(myStickers(stores, p));
    }, () => undefined);
    // M21 US9: the day each hours sticker was earned, from the server's listened days.
    void listening.listening('30d').then((l) => { if (live) setDays(earnedDays(l.earned, stores.settings)); }, () => undefined);
    return () => { live = false; };
  }, [api, listening, listener, stores]);
  const got = list.filter((s) => s.earned);
  const rest = list.filter((s) => !s.earned);
  const none = got.length === 0;
  const earned = got.length;
  const floating = (none ? list : got).slice(0, FLOAT.length);
  const help = <IconButton icon="information-circle-outline" label="How stickers are earned" onPress={() => router.push('/stickers/help')} fill />;
  const hero = (
    <Box testID="stickers-hero" className="overflow-hidden" onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))} style={{ minHeight: HERO_HEIGHT, borderRadius: ME_MOSAIC.radius }}>
      <LinearGradient colors={HERO_FILL} locations={HERO_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
      <Box style={{ padding: PROFILE.heroPad }}>
        <Type step="tag" className="text-hotText">STICKERS</Type>
        <Type step="figure" className="text-text" style={[PROFILE_TYPE.heroFigure, { marginTop: 12 }]} accessibilityRole="header">{`${earned} of ${list.length}\nearned`}</Type>
        {!listener ? <Type step="caption" className="text-text2" style={{ marginTop: 8 }}>Sign in to count your listening time.</Type> : null}
        {/* M31 F14 (wave-7 defect 2): in the column under the figure and caption, not pinned to the foot where it covered the caption. The hero grows (minHeight 178) to hold them. */}
        <Box style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <PulseButton label="Decorate my profile" accessibilityLabel="Decorate my profile with stickers" icon="medal-outline" kind="light" height={44} onPress={() => router.push('/stickers/decorate')} />
        </Box>
      </Box>
      {floating.map((s, k) => (
        <Box key={s.id} className="absolute" style={{ left: Math.min(FLOAT[k]!.x, Math.max(0, width - ME_MOSAIC.lane - ME_MOSAIC.right - FLOAT[k]!.size - 6)), top: FLOAT[k]!.y }}>
          <StickerDisc icon={s.icon} size={FLOAT[k]!.size} on={!none} rotate={FLOAT[k]!.turn} testID="hero-sticker" />
        </Box>
      ))}
    </Box>
  );
  const tiles = [...got, ...rest];
  const share = () => { if (open) void Share.share({ message: stickerShareText(open, earnedLine(days[open.id])) }).catch(() => undefined); };
  return (
    <PushedPage title="Stickers" right={help}>
      {(layout) => (
        <>
        <MosaicList
          data={tiles}
          keyOf={(s) => s.id}
          top={layout.top}
          reserve={layout.reserve}
          labels={[{ text: none ? 'Next up' : 'Earned', top: Math.max(HERO_HEIGHT, heroH) + ME_MOSAIC.gap + PROFILE.labelTop }]}
          header={hero}
          renderTile={(s) => {
            if (s.earned) {
              return (
                <Pressable onPress={() => setOpen(s)} accessibilityRole="button" accessibilityLabel={`${s.title}. ${earnedLine(days[s.id])}. Open its card`}>
                  <StickerTile sticker={s} line={dayOnly(earnedLine(days[s.id]))} />
                </Pressable>
              );
            }
            return (
              <Box accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
                <StickerTile sticker={s} line={s.progress} />
              </Box>
            );
          }}
        />
        {/* M21 US9: one sticker's card — our own sheet, not the system's. */}
      <ActionSheet open={open !== undefined} onClose={() => setOpen(undefined)} label={open ? `${open.title} sticker` : 'Sticker'}>
        {open ? (
          <>
            <Box className="flex-row justify-end"><IconButton icon="close" label="Close" onPress={() => setOpen(undefined)} fill size={18} diameter={36} /></Box>
            <Box className="items-center" style={{ gap: 10 }}>
              <Box testID="sticker-card-disc" style={{ shadowColor: colour.hot, shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }}>
                <StickerDisc icon={open.icon} size={PROFILE.cardCircle} ring={PROFILE.cardRing} />
              </Box>
              <Type step="figure" className="text-text text-center" style={[PROFILE_TYPE.cardName, { marginTop: 8 }]} accessibilityRole="header">{open.title}</Type>
              <Type step="body" className="text-text2 text-center">{earnedLine(days[open.id])}</Type>
              <Type step="caption" className="text-text3 text-center">{`Given by SocialMorning · ${STICKER_LOOK[open.id]?.how ?? ''}`}</Type>
            </Box>
            <PulseButton label="Share" accessibilityLabel={`Share the ${open.title} sticker`} icon="share-outline" kind="light" full onPress={() => { share(); }} />
          </>
        ) : null}
      </ActionSheet>
        </>
      )}
    </PushedPage>
  );
}

/** One sticker's tile: the disc, its title and one mono line; a sticker not yet earned is faint with a progress bar at its foot. */
function StickerTile(props: { sticker: Sticker; line: string }): React.ReactElement {
  const s = props.sticker;
  const on = s.earned;
  return (
    <Box testID="sticker-tile" className="bg-raise" style={{ minHeight: ME_MOSAIC.row, padding: ME_MOSAIC.pad, borderRadius: ME_MOSAIC.radius, paddingBottom: on ? ME_MOSAIC.pad : ME_MOSAIC.pad + PROFILE.barHeight }}>
      <Box className="flex-row items-center" style={{ gap: 10 }}>
        <StickerDisc icon={s.icon} size={PROFILE.circle} on={on} ring={PROFILE.circleRing} />
        <Box className="flex-1 min-w-0">
          <Type step="chip" className={on ? 'text-text' : 'text-text2'} style={PROFILE_TYPE.stickerTitle} numberOfLines={3}>{s.title}</Type>
          <Type step="tag" className="text-text3" style={PROFILE_TYPE.stickerDay} numberOfLines={2}>{props.line}</Type>
        </Box>
      </Box>
      {on ? null : (
        <Box testID="sticker-bar" className="absolute bg-line" style={{ left: ME_MOSAIC.pad, right: ME_MOSAIC.pad, bottom: 10, height: PROFILE.barHeight, borderRadius: 2 }}>
          <Box className="bg-hot" style={{ height: PROFILE.barHeight, borderRadius: 2, width: `${Math.max(4, Math.round(fraction(s.progress) * 100))}%` as `${number}%` }} />
        </Box>
      )}
    </Box>
  );
}
