// Listening badges: earned ones with their date, the rest with progress; tap one for its card, Share, help and Decorate.
/**
 * Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are.
 *
 * M17 (`Stickers-B`, constitution v3.0.0): the page's name moves into the bar, small and
 * centred; the count leads as a progress ring with the earned number in the serif and
 * "N of M earned" beside it; earned stickers are a two-column grid of white cards (yellow disc,
 * icon, title); the rest are "Next up" rows with their progress line and a bar. The bar's length
 * is read from the sticker's own progress words ("17 of 42 h"), so nothing new is computed.
 *
 * M21 US9 (T103): each earned card says the day it was earned when that is known (the hours
 * stickers from the server's listened days, the first moment from this phone), otherwise
 * "Earned". A tap opens the sticker's card in our own sheet: who gives it (SocialMorning), the
 * date, how it is earned, and Share. "You were #N" is left out: the server cannot tell (stickers
 * are worked out on each phone). The bar's ? opens the help page; "Decorate my profile" opens the
 * sticker canvas.
 */
import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { ProgressRing } from '@/ui/kit/ProgressRing';
import { BarButton } from '@/ui/kit/TopBar';
import { earnedLine, STICKER_LOOK, stickerShareText, type Sticker } from '@/me/stickers';
import { earnedDays, myStickers } from '@/me/my-stickers';
import { useListeningApi } from '@/me/listening-api';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';

/** An earned card is 72 pt tall in `Stickers-B`, and grows with the text size. */
const CARD = { minHeight: 72 };
const TAP = { minHeight: hit.min };
/** B's primary pill: 52 pt. */
const PILL = { minHeight: 52 };

/** "17 of 42 h" → 17 / 42; anything else → 0. */
function fraction(progress: string): number {
  const m = /^(\d+) of (\d+)/.exec(progress);
  if (!m) return 0;
  const have = Number(m[1]);
  const need = Number(m[2]);
  return need > 0 ? Math.min(1, have / need) : 0;
}

/** Pairs for the two-column grid. */
function pairs<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

export default function StickersScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  const listening = useListeningApi();
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
  const earned = got.length;
  const help = (
    <BarButton label="How stickers are earned" onPress={() => router.push('/stickers/help')}>
      <Icon name="help-circle-outline" size={22} color={c.text} />
    </BarButton>
  );
  return (
    <>
    {/* M24 US20 (`Stickers-B`): the name small and centred in the bar (14 pt bold muted), no big title. */}
    <PageHeader middle={<Text className="flex-1 text-center text-muted text-body font-bold" accessibilityRole="header" numberOfLines={1}>Stickers</Text>} right={help} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Box className="flex-row items-center gap-section">
        <ProgressRing progress={list.length > 0 ? earned / list.length : 0} size={96} stroke={8} colour="primary">
          <Text className="text-text text-hero font-display">{earned}</Text>
        </ProgressRing>
        <Text className="flex-1 text-text text-hero font-display" accessibilityRole="header">{earned} of {list.length} earned</Text>
      </Box>
      {!listener ? <Text className="text-muted text-sm">Sign in to count your listening time.</Text> : null}
      {listener && got.length > 0 ? (
        <Pressable onPress={() => router.push('/stickers/decorate')} accessibilityRole="button" accessibilityLabel="Decorate my profile with stickers" className="flex-row gap-gap items-center justify-center rounded-pill bg-primary" style={PILL}>
          <Icon name="color-wand-outline" size={18} color={c.onPrimary} />
          <Text className="text-onPrimary text-body font-bold">Decorate my profile</Text>
        </Pressable>
      ) : null}
      {got.length > 0 ? (
        <Box className="gap-gap">
          <Text className="text-text text-base font-display mb-1" accessibilityRole="header">Earned</Text>
          {pairs(got).map((row) => (
            <Box key={row.map((s) => s.id).join('+')} className="flex-row gap-gap">
              {row.map((s) => (
                <Pressable key={s.id} onPress={() => setOpen(s)} accessibilityRole="button" accessibilityLabel={`${s.title}. ${earnedLine(days[s.id])}. Open its card`} className="flex-1 flex-row items-center gap-row bg-surface border border-border rounded-row p-row" style={CARD}>
                  <Box className="w-10 h-10 rounded-pill bg-primary items-center justify-center"><Icon name={s.icon} size={20} color={c.onPrimary} /></Box>
                  <Box className="flex-1 gap-0.5">
                    <Text className="text-text text-meta font-semibold" numberOfLines={3}>{s.title}</Text>
                    <Text className="text-muted text-xs" numberOfLines={1}>{earnedLine(days[s.id])}</Text>
                  </Box>
                </Pressable>
              ))}
              {row.length === 1 ? <Box className="flex-1" /> : null}
            </Box>
          ))}
        </Box>
      ) : null}
      {rest.length > 0 ? (
        <Box>
          <Text className="text-text text-base font-display mb-1" accessibilityRole="header">Next up</Text>
          {rest.map((s) => (
            <Box key={s.id} className="flex-row items-center gap-row py-row border-b-hairline border-separator" accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
              <Icon name={s.icon} size={20} color={c.muted} />
              <Box className="flex-1 gap-1.5">
                <Box className="flex-row items-center gap-gap">
                  <Text className="flex-1 text-text text-meta font-semibold" numberOfLines={2}>{s.title}</Text>
                  <Text className="text-muted text-xs">{s.progress}</Text>
                </Box>
                <Box className="h-1 rounded-pill bg-track overflow-hidden">
                  <Box className="h-1 rounded-pill bg-accent" style={{ width: `${Math.round(fraction(s.progress) * 100)}%` as `${number}%` }} />
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScrollView>

    {/* M21 US9: one sticker's card — our own sheet, not the system's. */}
    <Actionsheet isOpen={open !== undefined} onClose={() => setOpen(undefined)}>
      <ActionsheetBackdrop />
      <ActionsheetContent className="px-screen-x items-stretch">
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        <Box className="flex-row justify-end">
          <Pressable onPress={() => setOpen(undefined)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={22} color={c.muted} />
          </Pressable>
        </Box>
        {open ? (
          <Box className="items-center gap-row">
            <Box className="w-24 h-24 rounded-pill bg-primary items-center justify-center"><Icon name={open.icon} size={48} color={c.onPrimary} /></Box>
            <Text className="text-text text-hero font-display text-center" accessibilityRole="header">{open.title}</Text>
            <Text className="text-muted text-body text-center">{earnedLine(days[open.id])}</Text>
            <Text className="text-muted text-sm text-center">{`Given by SocialMorning · ${STICKER_LOOK[open.id]?.how ?? ''}`}</Text>
            <Pressable onPress={() => { void Share.share({ message: stickerShareText(open, earnedLine(days[open.id])) }).catch(() => undefined); }} accessibilityRole="button" accessibilityLabel={`Share the ${open.title} sticker`} className="self-stretch flex-row gap-gap items-center justify-center rounded-pill bg-primary mt-gap" style={PILL}>
              <Icon name="share-outline" size={18} color={c.onPrimary} />
              <Text className="text-onPrimary text-body font-bold">Share</Text>
            </Pressable>
          </Box>
        ) : null}
      </ActionsheetContent>
    </Actionsheet>
    </>
  );
}
