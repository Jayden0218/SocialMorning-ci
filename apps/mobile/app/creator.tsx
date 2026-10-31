// Creator centre: claim a show you publish with a code, then see its numbers.
/**
 * Creator centre (创作者中心, M10b US8). Nothing is uploaded — SocialNet never hosts audio
 * (Principle V). A creator claims the show they already publish: they get a code, put it
 * anywhere in their feed (the show description is easiest), and tap Verify; the server
 * re-reads the feed from the publisher and looks for it. Once proven, the page shows the
 * show's numbers and their comments carry a Host mark.
 *
 * M17 T075 (`Creator-B`): the Editorial page — a small centred title in the bar; each claimed
 * show as a white card (large artwork, serif name, the steps, the code as a big serif, Share code
 * and Verify pills); the explanation; "Claim a show" as a serif heading over a row of show cards
 * that scrolls sideways (artwork, name, "Claim" in the accent); the feed address in a pill field;
 * Get my code; and the Creator academy link as a card at the end. Same actions, same handlers.
 *
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `creator--screen`, `--signed-out`, `--host-proven`, `--code-pending`, `--code-not-found`, `--share-code-panel`; layout Deck): a pushed
 * page, the violet-first glow. The stage is the glowing curve of 48 bars (a picture, no data), "Claim the show you publish" in Unbounded 800 26 and today's explanation (14, text-2);
 * under it the "Claim" deck — the shows you subscribe to and have not claimed, up to 5, cards 132 wide (cover, name 13, "Claim" in hot-text) sliding sideways from the 28 lane —
 * and the Creator academy card (62, light, a cap in the dark accent). A claim replaces the stage with its card (pending: the steps and the code; proven: the numbers). The foot is
 * the title bar ("Creator centre" at 26, back) with the feed field (48, globe) and, under it, Get my code (light) — or, while a code is waiting, Share code (ring) and Verify
 * (light), which act on the waiting claim; type in the field and Get my code takes their place. The answer to a bad address or a failed list sits in hot-text above the field; the
 * answer to Verify sits inside the waiting card. Signed out: a 120 mic tile and "Sign in to claim your show". Same calls, names and words.
 *
 * Not as drawn: the drawing's waiting-code page has no feed field in its foot; this one keeps it (a waiting claim never expires, so without it a creator could not claim another feed
 * by address); with more than one waiting code the other cards are tappable ("Use the code for …") to choose which one Share code and Verify act on; the deck follows a claim card 32
 * under it (the drawing places it at a fixed top).
 */

import { Icon } from '@/ui/kit/Icon';
import { Link } from '@/design/tailwind';
import { Artwork } from '@/ui/kit/Artwork';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { colour, hit } from '@/design';
import type { CreatorClaim, ShowStats } from '@/social/api';
import { useSocial } from '@/social/context';
import { Curve } from '@/ui/kit/Curve';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { drawnType } from '@/design/type-px';
import { useStores } from '@/ui/shell/providers';
import { useSharePanel } from '@/ui/clips/ShareChooser';
import { GlowTile } from '@/ui/me/lists';
import { ClaimCard } from '@/ui/creator/parts';
import { CREATOR, STAGE_CURVE } from '@/ui/creator/measures';
import { Big, Line } from '@/ui/wallet/stage';

/** The academy card's second line: Geist 500 12 / 16 at 75 % (a style object, not an array: it sits under `Link asChild`). */
const ACADEMY_NOTE = { ...drawnType.tileNote, opacity: 0.75 };

/** The answer to Verify belongs to the claim that was checked; any other answer sits above the field. */
type Note = { text: string; claimId?: string };

export default function CreatorScreen(): React.ReactElement {
  const stores = useStores();
  const { api, listener } = useSocial();
  const [claims, setClaims] = useState<CreatorClaim[] | undefined>();
  const [feedUrl, setFeedUrl] = useState('');
  const [note, setNote] = useState<Note | undefined>();
  const [stats, setStats] = useState<Record<string, ShowStats>>({});
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>();
  // The foot grows by the answer line above the field, so the title bar is lifted by what is measured.
  const [foot, setFoot] = useState<number>(CREATOR.field + CREATOR.footGap + hit.min);
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();

  const load = useCallback(() => {
    if (!listener) { setClaims([]); return () => undefined; }
    let live = true;
    api.creatorClaims().then((r) => {
      if (!live) return;
      setClaims(r);
      for (const cl of r.filter((x) => x.status === 'proven')) {
        void api.creatorStats(cl.feedUrl).then((s) => { if (live) setStats((cur) => ({ ...cur, [cl.feedUrl]: s })); }, () => undefined);
      }
    }, () => { if (live) { setClaims([]); setNote({ text: "Couldn't load your shows" }); } });
    return () => { live = false; };
  }, [api, listener]);
  useFocusEffect(load);

  if (!listener) {
    return (
      <PushedPage title="Creator centre" size={CREATOR.titleSize} tone="none">
        {(layout) => (
          <>
            <PageGlow flip top={CREATOR.outGlowTop} strength={CREATOR.glowStrength} />
            <Box testID="creator-out-tile" className="absolute left-0 right-0 items-center" pointerEvents="none" style={{ top: layout.top + CREATOR.outTileTop }}><GlowTile icon="mic-outline" size={CREATOR.outTile} rotate={-6} /></Box>
            <Box testID="creator-out-words" className="absolute" style={{ left: CREATOR.outSide, right: CREATOR.outSide, top: layout.top + CREATOR.outTextTop }}><Big size="big28">Sign in to claim your show</Big></Box>
          </>
        )}
      </PushedPage>
    );
  }

  const claim = async (url: string) => {
    setBusy(true); setNote(undefined);
    try {
      const made = await api.creatorClaim(url.trim());
      setClaims((cur) => [made, ...(cur ?? []).filter((x) => x.id !== made.id)]);
      setActiveId(made.id);
      setFeedUrl('');
    } catch { setNote({ text: 'That is not a feed address (it starts with https://).' }); }
    setBusy(false);
  };
  const verify = async (cl: CreatorClaim) => {
    setBusy(true); setNote(undefined);
    try {
      const r = await api.creatorVerify(cl.id);
      if (r === 'taken') setNote({ text: 'Someone else has already proven this show.', claimId: cl.id });
      else if (r.status === 'pending') setNote({ text: 'The code is not in your feed yet. Feeds can take a few minutes to update — try again soon.', claimId: cl.id });
      else load();
    } catch { setNote({ text: "Couldn't reach your feed. Try again.", claimId: cl.id }); }
    setBusy(false);
  };

  const subscribed = stores.subscriptions.list().map((s) => stores.feeds.getShow(s.feedUrl)).filter((s) => s !== undefined)
    .filter((s) => !(claims ?? []).some((cl) => cl.feedUrl === s.feedUrl)).slice(0, 5);
  const waiting = (claims ?? []).filter((cl) => cl.status === 'pending');
  const active = waiting.find((cl) => cl.id === activeId) ?? waiting[0];
  const typing = feedUrl.trim() !== '';
  const pageNote = note && note.claimId === undefined ? note.text : undefined;
  const hasClaims = (claims ?? []).length > 0;

  return (
    <>
    <PushedPage
      title="Creator centre"
      size={CREATOR.titleSize}
      tone="none"
      belowHeight={foot}
      below={(
        <Box testID="creator-foot" style={{ gap: CREATOR.footGap }} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== foot) setFoot(h); }}>
          {pageNote ? <Line size="line14" tone="hot" live>{pageNote}</Line> : null}
          <Input className="bg-raise2 flex-row items-center border border-line" style={{ height: CREATOR.field, borderRadius: CREATOR.fieldRadius, paddingHorizontal: CREATOR.fieldPad, gap: CREATOR.fieldGap }}>
            <Icon name="globe-outline" size={20} color={colour.text3} />
            <InputField value={feedUrl} onChangeText={setFeedUrl} placeholder="Or paste your feed address (RSS)" placeholderTextColor={colour.text3}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url" style={{ minHeight: hit.min }} accessibilityLabel="Your feed address" className="flex-1 text-text font-medium text-pulse-body" />
          </Input>
          {active && !typing ? (
            <Box testID="creator-buttons" className="flex-row" style={{ gap: CREATOR.footGap - 2 }}>
              <PulseButton kind="ring" icon="share-outline" label="Share code" onPress={() => share({ heading: 'Share your code', more: { detail: 'other apps', run: () => void Share.share({ message: active.code }) } })} className="flex-1" />
              <PulseButton label="Verify" icon="checkmark" onPress={() => void verify(active)} disabled={busy} className="flex-1" />
            </Box>
          ) : (
            <PulseButton label="Get my code" onPress={() => void claim(feedUrl)} disabled={busy || !/^https?:\/\/\S+$/.test(feedUrl.trim())} full />
          )}
        </Box>
      )}
    >
      {(layout) => (
        <>
          <PageGlow flip top={CREATOR.glowTop} strength={CREATOR.glowStrength} />
          <ScrollView testID="creator-scroll" className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: layout.top + CREATOR.top, paddingBottom: layout.reserve }}>
            {hasClaims ? (
              <Box testID="creator-claims" style={{ paddingHorizontal: CREATOR.side, gap: CREATOR.gap }}>
                {(claims ?? []).map((cl) => {
                  const show = stores.feeds.getShow(cl.feedUrl);
                  return (
                    <ClaimCard
                      key={cl.id}
                      status={cl.status === 'proven' ? 'proven' : 'pending'}
                      title={show?.title ?? cl.feedUrl}
                      imageUrl={show?.imageUrl}
                      code={cl.code}
                      note={note?.claimId === cl.id ? note.text : undefined}
                      stats={stats[cl.feedUrl]}
                      {...(waiting.length > 1 && cl.status === 'pending' ? { active: cl.id === active?.id, onUse: () => setActiveId(cl.id) } : {})}
                    />
                  );
                })}
              </Box>
            ) : (
              <Box testID="creator-stage" style={{ paddingHorizontal: CREATOR.side, gap: CREATOR.gap }}>
                <Box accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={STAGE_CURVE} count={CREATOR.curveBars} height={CREATOR.curveHeight} played={1} glow min={3} /></Box>
                <Big size="big26">Claim the show you publish</Big>
                <Line size="line14">We never host your audio — you keep your own feed. Once you prove it is yours, you see your show’s numbers and your comments carry a Host mark.</Line>
              </Box>
            )}

            {subscribed.length > 0 ? (
              <Box testID="creator-deck" className="relative" style={{ marginTop: hasClaims ? CREATOR.deckGapCard : CREATOR.deckGapStage }}>
                <EdgeLabel label="Claim" spoken="Claim a show" top={CREATOR.deckEdgeTop} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: CREATOR.lane, paddingRight: CREATOR.side, gap: CREATOR.deckGap }}>
                  {subscribed.map((s) => (
                    <Pressable key={s.feedUrl} onPress={() => void claim(s.feedUrl)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Claim ${s.title}`} style={{ width: CREATOR.deckCard, minHeight: hit.min, gap: CREATOR.deckNameGap }}>
                      <Box className="overflow-hidden" style={{ width: CREATOR.deckCard, height: CREATOR.deckCard, borderRadius: CREATOR.deckCardRadius }}><Artwork url={s.imageUrl} size={CREATOR.deckCard} name={s.title} /></Box>
                      <Type step="caption" className="text-text font-semibold" numberOfLines={2}>{s.title}</Type>
                      <Type step="chip" className="text-hotText font-bold">Claim</Type>
                    </Pressable>
                  ))}
                </ScrollView>
              </Box>
            ) : null}

            {/* M12 FR-103: the Creator academy link — a light card above the foot. */}
            <Box style={{ paddingHorizontal: CREATOR.side, marginTop: CREATOR.academyGap }}>
              <Link href="/academy" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel="Creator academy: how claiming, numbers, comments, clips and the Studio work" testID="creator-academy" className="bg-text flex-row items-center" style={{ minHeight: CREATOR.academyHeight, borderRadius: CREATOR.academyRadius, paddingHorizontal: CREATOR.academyPad, gap: CREATOR.academyGapInside }}>
                  <Icon name="school-outline" size={CREATOR.academyIcon} color={colour.toastAction} />
                  <Box className="flex-1">
                    <Text className="text-void font-display" style={drawnType.unbounded[15]}>Creator academy</Text>
                    <Type step="caption" className="text-void" style={ACADEMY_NOTE}>Claiming, numbers, comments, clips, the Studio</Type>
                  </Box>
                  <Icon name="chevron-forward" size={CREATOR.academyChevron} color={colour.void} />
                </Pressable>
              </Link>
            </Box>
          </ScrollView>
        </>
      )}
    </PushedPage>
    {sharePanel}
    </>
  );
}
