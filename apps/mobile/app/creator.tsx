// Creator centre: claim a show you publish with a code, then see its numbers.
/**
 * Creator centre (创作者中心, M10b US8). Nothing is uploaded — SocialNet never hosts audio
 * (Principle V). A creator claims the show they already publish: they get a code, put it
 * anywhere in their feed (the show description is easiest), and tap Verify; the server
 * re-reads the feed from the publisher and looks for it. Once proven, the page shows the
 * show's numbers and their comments carry a Host mark.
 *
 * Spec 039 (Hub template, `design/B-Me.dc.html`): the page is a `PageList` inside `KeyboardPage` (Back, "Creator centre", one 20 gutter, 24 between
 * the parts). Each claim is a card (`ClaimCard`: pending with the steps and the code, proven with the numbers). With no claim yet the page opens
 * with "Claim the show you publish" and today's explanation. After them: the section "Claim a show", a `Shelf` of the shows you subscribe to and have
 * not claimed (up to 5; cover, name, "Claim"), and the Creator academy card. The foot (`below`) keeps the feed field and Get my code — or, while a code
 * is waiting, Share code and Verify, which act on the waiting claim; type in the field and Get my code takes their place. The answer to a bad
 * address or a failed list sits in hot-text above the field; the answer to Verify sits inside the waiting card. Signed out: a card with "Sign in to
 * claim your show". Same calls, names and words.
 *
 * Not kept from the Pulse drawing: the glowing 48-bar curve on the stage (a picture with no data), the lane for the edge label, the page glow.
 * With more than one waiting code the other cards are tappable ("Use the code for …") to choose which one Share code and Verify act on.
 */

import { Icon } from '@/ui/kit/Icon';
import { Link } from '@/design/tailwind';
import { Artwork } from '@/ui/kit/Artwork';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { bars, colour, radius, spacing } from '@/design';
import type { CreatorClaim, ShowStats } from '@/social/api';
import { useSocial } from '@/social/context';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { PageList, Section, Shelf } from '@/ui/kit/layout';
import { useStores } from '@/ui/shell/providers';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { useSharePanel } from '@/ui/clips/ShareChooser';
import { KeyboardPage } from '@/ui/me/lists';
import { BackButton } from '@/ui/notifications/cards';
import { ClaimCard } from '@/ui/creator/parts';
import { CREATOR } from '@/ui/creator/measures';

/** The answer to Verify belongs to the claim that was checked; any other answer sits above the field. */
type Note = { text: string; claimId?: string };

export default function CreatorScreen(): React.ReactElement {
  const stores = useStores();
  const { api, listener } = useSocial();
  const { now } = useToastPlacement();
  const [claims, setClaims] = useState<CreatorClaim[] | undefined>();
  const [feedUrl, setFeedUrl] = useState('');
  const [note, setNote] = useState<Note | undefined>();
  const [stats, setStats] = useState<Record<string, ShowStats>>({});
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>();
  // The foot grows by the answer line above the field, so the list leaves what is measured.
  const [foot, setFoot] = useState<number>(bars.field + spacing.row + bars.field);
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
      <PageList title="Creator centre" leading={<BackButton />} now={now} safeBottom={0} data={[]} renderItem={() => null}
        ListEmptyComponent={
          <Box testID="creator-out-tile" className="bg-raise items-start" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row }}>
            <Icon name="mic-outline" size={spacing.region - spacing.gap} color={colour.hotText} />
            <Type step="heading" className="text-text" testID="creator-out-words">Sign in to claim your show</Type>
          </Box>
        }
      />
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
    <KeyboardPage>
    <PageList
      title="Creator centre"
      leading={<BackButton />}
      now={now}
      safeBottom={0}
      testID="creator-scroll"
      keyboardShouldPersistTaps="handled"
      data={claims ?? []}
      keyExtractor={(cl) => cl.id}
      ListHeaderComponent={hasClaims ? null : (
        <Box testID="creator-stage" style={{ gap: spacing.row }}>
          <Type step="heading" className="text-text">Claim the show you publish</Type>
          <Type step="body" className="text-text2">We never host your audio — you keep your own feed. Once you prove it is yours, you see your show’s numbers and your comments carry a Host mark.</Type>
        </Box>
      )}
      renderItem={({ item: cl }) => {
        const show = stores.feeds.getShow(cl.feedUrl);
        return (
          <ClaimCard
            status={cl.status === 'proven' ? 'proven' : 'pending'}
            title={show?.title ?? cl.feedUrl}
            imageUrl={show?.imageUrl}
            code={cl.code}
            note={note?.claimId === cl.id ? note.text : undefined}
            stats={stats[cl.feedUrl]}
            {...(waiting.length > 1 && cl.status === 'pending' ? { active: cl.id === active?.id, onUse: () => setActiveId(cl.id) } : {})}
          />
        );
      }}
      ListFooterComponent={
        <Box style={{ gap: spacing.block }}>
          {subscribed.length > 0 ? (
            <Box testID="creator-deck">
              <Section title="Claim a show">
                <Shelf>
                  {subscribed.map((s) => (
                    <Pressable key={s.feedUrl} onPress={() => void claim(s.feedUrl)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Claim ${s.title}`} style={{ width: CREATOR.deckCard, minHeight: bars.circle, gap: spacing.gap }}>
                      <Box className="overflow-hidden" style={{ width: CREATOR.deckCard, height: CREATOR.deckCard, borderRadius: radius.artwork }}><Artwork url={s.imageUrl} size={CREATOR.deckCard} name={s.title} /></Box>
                      <Type step="small" className="text-text font-semibold" numberOfLines={2}>{s.title}</Type>
                      <Type step="small" className="text-hotText font-bold">Claim</Type>
                    </Pressable>
                  ))}
                </Shelf>
              </Section>
            </Box>
          ) : null}
          {/* M12 FR-103: the Creator academy link — a card above the foot. */}
          <Link href="/academy" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="Creator academy: how claiming, numbers, comments, clips and the Studio work" testID="creator-academy" className="bg-raise flex-row items-center" style={{ minHeight: bars.circle + spacing.row, borderRadius: radius.card, padding: spacing.section, gap: spacing.row }}>
              <Icon name="school-outline" size={bars.titleShrunk + spacing.hair} color={colour.hotText} />
              <Box className="flex-1">
                <Type step="strong" className="text-text">Creator academy</Type>
                <Type step="small" className="text-text2">Claiming, numbers, comments, clips, the Studio</Type>
              </Box>
              <Icon name="chevron-forward" size={spacing.section} color={colour.text3} />
            </Pressable>
          </Link>
        </Box>
      }
      belowHeight={foot}
      below={(
        <Box testID="creator-foot" style={{ gap: spacing.row }} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h !== foot) setFoot(h); }}>
          {pageNote ? <Type step="small" className="text-hotText" accessibilityLiveRegion="polite">{pageNote}</Type> : null}
          <Input className="bg-raise2 flex-row items-center border border-line" style={{ height: bars.field, borderRadius: radius.input, paddingHorizontal: spacing.section, gap: spacing.row }}>
            <Icon name="globe-outline" size={bars.titleShrunk} color={colour.text3} />
            <InputField value={feedUrl} onChangeText={setFeedUrl} placeholder="Or paste your feed address (RSS)" placeholderTextColor={colour.text3}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url" style={{ minHeight: bars.field }} accessibilityLabel="Your feed address" className="flex-1 text-text font-medium text-pulse-body" />
          </Input>
          {active && !typing ? (
            <Box testID="creator-buttons" className="flex-row" style={{ gap: spacing.row }}>
              <PulseButton kind="ring" icon="share-outline" label="Share code" onPress={() => share({ heading: 'Share your code', more: { detail: 'other apps', run: () => void Share.share({ message: active.code }) } })} className="flex-1" />
              <PulseButton label="Verify" icon="checkmark" onPress={() => void verify(active)} disabled={busy} className="flex-1" />
            </Box>
          ) : (
            <PulseButton label="Get my code" onPress={() => void claim(feedUrl)} disabled={busy || !/^https?:\/\/\S+$/.test(feedUrl.trim())} full />
          )}
        </Box>
      )}
    />
    {sharePanel}
    </KeyboardPage>
  );
}
