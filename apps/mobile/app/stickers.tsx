// Listening badges: earned ones with their date, the rest with progress; tap one for its card, Share, help and Decorate.
/**
 * Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are.
 *
 * M21 US9 (T103): each earned card says the day it was earned when that is known (the hours
 * stickers from the server's listened days, the first moment from this phone), otherwise
 * "Earned". A tap opens the sticker's card in our own sheet: who gives it (SocialMorning), the
 * date, how it is earned, and Share. "You were #N" is left out: the server cannot tell (stickers
 * are worked out on each phone). The title row's info circle opens the help page; "Decorate my profile" opens the
 * sticker canvas.
 *
 * Spec 039 (Hub template, `design/B-Me.dc.html`): the page is a `Page` (Back, "Stickers", the info circle, one 20 gutter, 24 between the parts).
 * A hero card: "STICKERS", "3 of 8 earned" in the number step, two of your stickers beside it and the light "Decorate my profile" button. Then a
 * `Section` "Earned" with the earned stickers in a `TileGrid` and a `Section` "Still to earn" with the rest, faint, each with a 3 tall progress bar and
 * "6 of 10 h" ("Next up" alone when none is earned). A tile is a card: the disc, the title, the day in mono ("3 Oct 2026"). A tap on an earned tile
 * opens its card (a sheet: the disc 132 with a hot glow, the name, the day, "Given by SocialMorning · how", a light Share and a close circle).
 * Signed out: the hero says "Sign in to count your listening time.". No edge label, no tile floating over the hero's edge.
 */
import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, radius, spacing } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { Page, Section, TileGrid } from '@/ui/kit/layout';
import { BackButton } from '@/ui/notifications/cards';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { earnedLine, STICKER_LOOK, stickerShareText, type Sticker } from '@/me/stickers';
import { earnedDays, myStickers } from '@/me/my-stickers';
import { useListeningApi } from '@/me/listening-api';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { StickerDisc } from '@/ui/profile/StickerDisc';
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

/** The two stickers beside the hero's words. */
const FLOAT = [PROFILE.heroFloatA, PROFILE.heroFloatB] as const;
/** The hero's fill: the premium tint, fading to raise by 70 % at 140 degrees. */
const HERO_FILL = [colour.hotSoft, colour.raise] as const;
const HERO_AT = [0, 0.7] as const;
const CARD = { borderRadius: radius.card, padding: spacing.section } as const;

export default function StickersScreen(): React.ReactElement {
  const stores = useStores();
  const { api, listener } = useSocial();
  const listening = useListeningApi();
  const { now } = useToastPlacement();
  // M16a bug 3: the same source as the profile card (src/me/my-stickers.ts) — this phone's totals
  // at once, then the larger of those and the server's once the profile arrives.
  const [list, setList] = useState<Sticker[]>(() => myStickers(stores, undefined));
  const [days, setDays] = useState<Record<string, string>>(() => earnedDays(undefined, stores.settings));
  const [open, setOpen] = useState<Sticker | undefined>();
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
    <Box testID="stickers-hero" className="overflow-hidden flex-row items-center" style={{ borderRadius: radius.card }}>
      <LinearGradient colors={HERO_FILL} locations={HERO_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
      <Box className="flex-1" style={{ padding: spacing.section }}>
        <Type step="tag" className="text-hotText">STICKERS</Type>
        <Type step="figure" className="text-text" style={{ marginTop: spacing.row }} accessibilityRole="header">{`${earned} of ${list.length}\nearned`}</Type>
        {!listener ? <Type step="small" className="text-text2" style={{ marginTop: spacing.gap }}>Sign in to count your listening time.</Type> : null}
        {/* M31 F14 (wave-7 defect 2): in the column under the figure and caption, not pinned to the foot where it covered the caption. */}
        <Box style={{ marginTop: spacing.row, alignSelf: 'flex-start' }}>
          <PulseButton label="Decorate my profile" accessibilityLabel="Decorate my profile with stickers" icon="medal-outline" kind="light" onPress={() => router.push('/stickers/decorate')} />
        </Box>
      </Box>
      <Box style={{ paddingRight: spacing.section, gap: spacing.row }}>
        {floating.map((s, k) => <StickerDisc key={s.id} icon={s.icon} size={FLOAT[k]!} on={!none} testID="hero-sticker" />)}
      </Box>
    </Box>
  );
  const share = () => { if (open) void Share.share({ message: stickerShareText(open, earnedLine(days[open.id])) }).catch(() => undefined); };
  const tile = (s: Sticker) => (s.earned ? (
    <Pressable key={s.id} onPress={() => setOpen(s)} accessibilityRole="button" accessibilityLabel={`${s.title}. ${earnedLine(days[s.id])}. Open its card`}>
      <StickerTile sticker={s} line={dayOnly(earnedLine(days[s.id]))} />
    </Pressable>
  ) : (
    <Box key={s.id} accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
      <StickerTile sticker={s} line={s.progress} />
    </Box>
  ));
  return (
    <>
      <Page title="Stickers" leading={<BackButton />} trailing={help} now={now}>
        {hero}
        {none ? null : <Section title="Earned"><TileGrid>{got.map(tile)}</TileGrid></Section>}
        {rest.length > 0 ? <Section title={none ? 'Next up' : 'Still to earn'}><TileGrid>{rest.map(tile)}</TileGrid></Section> : null}
      </Page>
      {/* M21 US9: one sticker's card — our own sheet, not the system's. */}
      <ActionSheet open={open !== undefined} onClose={() => setOpen(undefined)} label={open ? `${open.title} sticker` : 'Sticker'}>
        {open ? (
          <>
            <Box className="flex-row justify-end"><IconButton icon="close" label="Close" onPress={() => setOpen(undefined)} fill size={18} diameter={36} /></Box>
            <Box className="items-center" style={{ gap: spacing.row }}>
              <Box testID="sticker-card-disc" style={{ shadowColor: colour.hot, shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }}>
                <StickerDisc icon={open.icon} size={PROFILE.cardCircle} ring={PROFILE.cardRing} />
              </Box>
              <Type step="figure" className="text-text text-center" style={[PROFILE_TYPE.cardName, { marginTop: spacing.gap }]} accessibilityRole="header">{open.title}</Type>
              <Type step="body" className="text-text2 text-center">{earnedLine(days[open.id])}</Type>
              <Type step="caption" className="text-text3 text-center">{`Given by SocialMorning · ${STICKER_LOOK[open.id]?.how ?? ''}`}</Type>
            </Box>
            <PulseButton label="Share" accessibilityLabel={`Share the ${open.title} sticker`} icon="share-outline" kind="light" full onPress={() => { share(); }} />
          </>
        ) : null}
      </ActionSheet>
    </>
  );
}

/** One sticker's tile: the disc, its title and one mono line; a sticker not yet earned is faint with a progress bar at its foot. */
function StickerTile(props: { sticker: Sticker; line: string }): React.ReactElement {
  const s = props.sticker;
  const on = s.earned;
  return (
    <Box testID="sticker-tile" className="bg-raise" style={{ ...CARD, gap: spacing.row }}>
      <StickerDisc icon={s.icon} size={PROFILE.circle} on={on} ring={PROFILE.circleRing} />
      <Box>
        <Type step="strong" className={on ? 'text-text' : 'text-text2'} numberOfLines={3}>{s.title}</Type>
        <Type step="tag" className="text-text3" numberOfLines={2}>{props.line}</Type>
      </Box>
      {on ? null : (
        <Box testID="sticker-bar" className="bg-line" style={{ height: PROFILE.barHeight, borderRadius: radius.tick }}>
          <Box className="bg-hot" style={{ height: PROFILE.barHeight, borderRadius: radius.tick, width: `${Math.max(4, Math.round(fraction(s.progress) * 100))}%` as `${number}%` }} />
        </Box>
      )}
    </Box>
  );
}
