// A listener's profile: name, host line, counts, listening time, recent activity, likes, Follow and a ⋯ sheet.
/**
 * A profile (M4 US3, FR-011): name, follower/following counts, stats (hidden when the
 * listener is private and it is not you), recent public activity, Follow.
 * M6: Report and Block; a listener you blocked shows "You blocked this listener · Unblock";
 * a suspended account says so; a profile you reported is hidden for you.
 * M10 (owner, 2026-09-27): the reference's layout; your own profile adds subscriptions,
 * stickers and what you played recently (this phone's positions).
 * M17 (`Profile-B`, constitution v3.0.0): the Editorial layout — a small centred "Profile" in
 * the bar, a centred 96 pt monogram, the name as a 32 pt serif, Follow (yellow pill) · Block
 * (outlined pill) · Report in one row, the numbers as white cards, listening time as a yellow
 * card, serif section titles and recent rows as cards. Every action and its data are unchanged.
 * M21 US6 (G-M21-6): Mute / Unmute beside Report — their comments, voice posts and likes leave
 * my pages only; they are never told.
 * M21 US8 (FR-074):
 * - Follow stays a pill; ⋯ opens a sheet holding Follow / Message / Block / Report / Mute (Block,
 *   Report and Mute were inline — moves recorded in m17/moves.json).
 * - "Host of 《show》" under the name, and a Podcasts row of the shows they host (`hostOf`).
 * - The header collapses: once the name scrolls away, the bar shows the small photo and name.
 * - Likes "View all" → /profile/<id>/likes; others' Subscriptions cell → /profile/<id>/subscriptions
 *   (it says Private when they keep them private).
 */
import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { SheetRow } from '@/ui/kit/SheetRow';
import { BarButton } from '@/ui/kit/TopBar';
import { useConfirm } from '@/ui/kit/confirm';
import { announce } from '@/safety/context';
import { useUs8Api } from '@/social/us8-api';
import { PlusBadge } from '@/ui/me/PlusCard';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, tabular } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Link } from '@/design/tailwind';
import { useSocial } from '@/social/context';
import { useSafety } from '@/safety/context';
import { FollowButton } from '@/ui/social/FollowButton';
import { BlockButton } from '@/ui/social/BlockButton';
import { hms } from '@/ui/social/StatsBlock';
import { Artwork } from '@/ui/kit/Artwork';
import { countryName } from '@/ui/me/country';
import { useStores, useToast } from '@/ui/shell/providers';
import { listeningHistory } from '@/me/history';
import { latestEarned } from '@/me/stickers';
import { myStickers, myTotals } from '@/me/my-stickers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { FeedItem } from '@/ui/social/FeedItem';
import { Placeholder } from '@/ui/comments/Placeholder';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { Pressable } from '@/ui/lib/pressable';
import { ApiError, type FeedItem as Item, type Profile } from '@/social/api';
import { EmptyState } from '@/ui/kit/EmptyState';
import { plural } from '@socialmorning/social-core';
import { ProfileStatRow, listenedLabel, type StatCell } from '@/ui/social/ProfileStatRow';
import { Avatar } from '@/ui/kit/Avatar';
import { LikeCard } from '@/ui/social/LikeCard';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { useM19Api, type Playlist } from '@/social/m19-api';
import { PlaylistCard } from '@/ui/me/PlaylistCard';
import { useCommentExtrasApi } from '@/social/comment-extras-api';
import { StickerLayer } from '@/ui/me/StickerLayer';
import { theirStickers } from '@/me/my-stickers';
import { OftenListened } from '@/ui/social/OftenListened';
import type { ProfileStickers } from '@/me/listening-api';

/** The eyebrow on the yellow card: spaced capitals (as `Eyebrow`, which only has muted/accent). */
const CAPS = { letterSpacing: 1.2, textTransform: 'uppercase' as const };
/** M21 US8: past this scroll (the photo and the name), the bar shows the name instead. */
const COLLAPSE_AT = 150;
const TAP = { minHeight: hit.min };
/** A hosted show in the Podcasts row: a 96 pt cover with its name under it. */
const POD = 96;
const POD_ITEM = { width: POD };

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const { safety, version, feed } = useSafety();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [profile, setProfile] = useState<Profile | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  // M19 T031: up to five of this account's likes (empty while they keep likes private).
  const profileApi = useProfileApi();
  const cards = useCardActions();
  const [likes, setLikes] = useState<LikeItem[]>([]);
  // M19 T041 (FR-031): this account's public playlists (all of yours on your own profile).
  const m19 = useM19Api();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  // M21 US6: whether I muted this listener (read from GET /v1/me/mutes while signed in).
  const extras = useCommentExtrasApi();
  const toast = useToast();
  const [muted, setMuted] = useState(false);
  // M21 US8: the ⋯ sheet, the collapsed bar, and others' subscriptions (count or private).
  const [more, setMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theirSubs, setTheirSubs] = useState<number | 'private' | undefined>();
  const us8 = useUs8Api();
  const [confirm, confirmDialog] = useConfirm();
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > COLLAPSE_AT;
    if (past !== collapsed) setCollapsed(past);
  };
  useFocusEffect(useCallback(() => {
    let live = true;
    if (listener) extras.mutes().then((items) => { if (live) setMuted(items.some((x) => x.id === String(id))); }).catch(() => undefined);
    return () => { live = false; };
  }, [extras, listener, id]));
  const toggleMute = async (name: string) => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    try {
      if (muted) await extras.unmute(String(id)); else await extras.mute(String(id));
      toast(muted ? `Unmuted ${name}.` : `Muted ${name}. Their comments are hidden for you.`);
      setMuted(!muted);
    } catch { toast("Couldn't save that — try again."); }
  };
  useFocusEffect(useCallback(() => {
    let live = true;
    api.profile(String(id)).then((p) => { if (live) { setProfile(p); setError(undefined); } }).catch((e) => { if (live) setError(e instanceof ApiError ? (e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e)); });
    profileApi.listenerLikes(String(id)).then((p) => { if (live) setLikes(p.items.slice(0, 5)); }).catch(() => undefined);
    m19.listenerPlaylists(String(id)).then((items) => { if (live) setPlaylists(items); }).catch(() => undefined);
    if (listener?.listenerId !== String(id)) {
      us8.listenerSubscriptions(String(id)).then((r) => { if (live) setTheirSubs(r.private ? 'private' : r.items.length); }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [api, profileApi, m19, us8, listener, id, version]));
  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id } });
  };
  // M17: the bar's small centred title; no big serif title — the name below is the page's head.
  // M21 US8: once the head scrolls away, the bar shows the small photo and name (collapsing header),
  // and ⋯ on someone else's profile opens the action sheet.
  const ownId = listener?.listenerId === String(id);
  const middle = collapsed && profile
    ? <Box className="flex-row items-center gap-2 flex-1 justify-center"><Avatar size={28} url={profile.avatarUrl} name={profile.displayName} /><Text className="text-text text-base font-bold" numberOfLines={1}>{profile.displayName}</Text></Box>
    : <Text className="text-text text-base font-bold text-center flex-1" accessibilityRole="header">Profile</Text>;
  const header = (
    <PageHeader
      middle={middle}
      {...(profile && !ownId && !profile.suspended ? { right: <BarButton label={`More for ${profile.displayName}`} onPress={() => setMore(true)}><Icon name="ellipsis-horizontal" size={22} color={c.text} /></BarButton> } : {})}
    />
  );
  if (error) return <>{header}<Box className="p-4 gap-3"><Text className="text-text">{error}</Text></Box></>;
  if (!profile) return <>{header}<Box className="p-4 items-center"><Loader /></Box></>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  if (profile.suspended) {
    return <>{header}<Box className="p-4 gap-3"><Text className="text-text text-lg font-display">{profile.displayName}</Text><Text className="text-muted text-body">This account is suspended.</Text></Box></>;
  }
  if (blocked || reported) {
    return (
      <>
      {header}
      <Box className="p-4 gap-3">
        <Text className="text-text text-lg font-display">{profile.displayName}</Text>
        {reported ? <Placeholder kind="reported" /> : <Text className="text-muted">You blocked this listener.</Text>}
        {blocked ? <BlockButton listenerId={profile.id} displayName={profile.displayName} /> : null}
      </Box>
      </>
    );
  }
  // M12 FR-006 (B6): your own totals are at least what this phone has recorded. M16a bug 3: the
  // Stickers page reads the same two functions (src/me/my-stickers.ts), so the numbers agree.
  const server = profile.stats?.all;
  const all = own && server ? { ...server, ...myTotals(stores, server) } : server;
  const history = own ? listeningHistory(stores, 5) : [];
  const earned = own ? myStickers(stores, profile) : [];
  const latest = latestEarned(earned);
  const subs = own ? stores.subscriptions.list().length : undefined;
  const hostOf = profile.hostOf ?? [];
  const theirPrivate = !own && (theirSubs === 'private' || profile.privateSubscriptions === true);
  const time = listenedLabel(profile.stats === null ? undefined : all?.listenedMs ?? 0);
  const statCells: StatCell[] = [
    { key: 'following', value: String(profile.following), label: 'Following', spoken: `${profile.following} following`, href: { pathname: '/profile/[id]/following', params: { id: profile.id, name: profile.displayName, count: String(profile.following) } } },
    { key: 'followers', value: String(profile.followers), label: 'Followers', spoken: plural(profile.followers, 'follower'), href: { pathname: '/profile/[id]/followers', params: { id: profile.id, name: profile.displayName, count: String(profile.followers) } } },
    ...(subs !== undefined ? [{ key: 'subs', value: String(subs), label: 'Subscriptions', spoken: plural(subs, 'subscription'), href: '/subscriptions' }] : []),
    // M21 US8: someone else's subscriptions — a link, or "Private" when they keep them private.
    ...(!own ? [theirPrivate
      ? { key: 'subs', value: 'Private', label: 'Subscriptions', spoken: 'Subscriptions are private' }
      : { key: 'subs', value: typeof theirSubs === 'number' ? String(theirSubs) : '›', label: 'Subscriptions', spoken: typeof theirSubs === 'number' ? plural(theirSubs, 'subscription') : 'Subscriptions', href: { pathname: '/profile/[id]/subscriptions', params: { id: profile.id, name: profile.displayName } } }] : []),
    // M21 US9: on your own profile the Listened card opens Listening data.
    { key: 'time', value: time.value, label: 'Listened', spoken: own ? `${time.spoken}. Open listening data` : time.spoken, ...(own ? { href: '/me/listening' } : {}) },
  ];
  // M21 US9: stickers placed on the header (every viewer), and someone else's sticker library unless they hide it.
  const deco = profile as Profile & ProfileStickers;
  const library = !own && !deco.stickersHidden ? theirStickers(profile) : [];
  const h = Math.floor((all?.listenedMs ?? 0) / 3_600_000);
  const m = Math.floor(((all?.listenedMs ?? 0) % 3_600_000) / 60_000);
  // M21 US8: the ⋯ sheet's actions (Block asks first, as the Block pill did).
  const name = profile.displayName;
  const follow = async (next: boolean) => {
    setMore(false);
    if (!listener) { router.push('/auth/sign-in'); return; }
    try {
      if (next) await api.follow(profile.id); else await api.unfollow(profile.id);
      setProfile({ ...profile, isFollowing: next, followers: profile.followers + (next ? 1 : -1) });
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Something went wrong.'); }
  };
  const block = () => {
    setMore(false);
    confirm({
      title: `Block ${name}?`,
      message: 'Nothing they write, clip or do will show for you. They will not be told.',
      action: 'Block',
      onConfirm: () => {
        const r = safety.block(profile.id, name);
        if (r === 'sign_in') { router.push('/auth/sign-in'); return; }
        if (r === 'self' || r === 'owner') { confirm({ title: r === 'self' ? "You can't block yourself." : "You can't block the app's owner — write to them instead.", cancel: null }); return; }
        announce(`Blocked ${name}. Hidden for you.`);
      },
    });
  };
  return (
    <>
    {header}
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section" onScroll={onScroll} scrollEventThrottle={32}>
      {/* M21 US9: sticker layer */}
      {/* M17 (Profile-B): centred head — monogram, serif name, the two small lines. */}
      <Box className="items-center gap-1.5">
        <StickerLayer placements={deco.stickers} />
        <Avatar size={96} url={profile.avatarUrl} name={profile.displayName} className="border-2 border-surface" />
        <Text className="text-text text-display font-display text-center mt-gap" accessibilityRole="header">{profile.displayName}</Text>
        {/* M20 US6 (FR-022): the PLUS badge, public like the name. */}
        {profile.plus ? <PlusBadge /> : null}
        {own ? <Text className="text-muted text-xs">This is you</Text> : null}
        {/* M21 US8: the host line — the first show they host, and how many more. */}
        {hostOf.length > 0 ? <Text className="text-accent text-meta font-semibold text-center">{`Host of 《${hostOf[0]!.title}》${hostOf.length > 1 ? ` and ${plural(hostOf.length - 1, 'more show')}` : ''}`}</Text> : null}
        {/* M10b US7: "IP location" — the country from the last sign-in, public (the privacy policy says so). */}
        {profile.country ? <Text className="text-muted text-xs">{`IP location: ${countryName(profile.country)}`}</Text> : null}
        {profile.bio ? <Text className="text-text text-body text-center mt-1">{profile.bio}</Text> : null}
        {/* M19 T013: Edit profile opens the profile editor (photo, name, bio); Settings stay on Me. */}
        {own ? <Link href="/profile/edit" className="text-accent text-body font-semibold py-row" accessibilityRole="link">Edit profile</Link> : null}
      </Box>

      {/* M17: the actions come before the numbers. M21 US8: Follow and Message stay; the rest are in ⋯. */}
      {!own ? (
        <Box className="flex-row gap-2.5 items-center">
          <FollowButton key={String(profile.isFollowing)} className="flex-1" listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
          {/* Chat (owner, 2026-10-04): the conversation says if you can send (you both follow each other). */}
          <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: profile.id, name: profile.displayName } })} accessibilityRole="button" accessibilityLabel={`Message ${profile.displayName}`} className="w-12 min-h-12 rounded-pill border border-border bg-surface items-center justify-center">
            <Icon name="chatbubble-outline" size={20} color={c.text} />
          </Pressable>
          <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel={`More actions for ${profile.displayName}`} className="w-12 min-h-12 rounded-pill border border-border bg-surface items-center justify-center">
            <Icon name="ellipsis-horizontal" size={20} color={c.text} />
          </Pressable>
        </Box>
      ) : null}

      {/* M12 FR-064: the numbers in one row — M17: each one a white card. */}
      <ProfileStatRow cells={statCells} />

      {/* M21 US8: the shows they host, as covers. */}
      {hostOf.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Podcasts</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row">
            {hostOf.map((s) => (
              <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, hosted by ${profile.displayName}`} style={POD_ITEM}>
                <Artwork url={stores.feeds.getShow(s.feedUrl)?.imageUrl} size={POD} rounded="row" name={s.title} />
                <Text className="text-text text-xs font-semibold mt-1" numberOfLines={2}>{s.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Box>
      ) : null}

      {/* M22 US17 item 6: the shows they listened to most in the last 90 days. */}
      <OftenListened listenerId={profile.id} name={profile.displayName} own={own} />

      {/* M6 (FR-019): the stats surface is the numbers, not the activity list below it.
          M17: a yellow card, the eyebrow and the total on the left, the two small facts right. */}
      {profile.stats === null || (all && all.listenedMs === 0 && all.finished === 0) ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Listening time</Text>
          {profile.stats === null
            ? <Text className="text-muted text-sm">{own ? 'Your listening is private.' : 'Listening is private.'}</Text>
            : <EmptyState surface="stats" />}
        </Box>
      ) : (
        <Box className="bg-primary rounded-row px-section py-section flex-row items-end justify-between gap-row" accessible accessibilityLabel={`Total listening time ${h} hours ${m} minutes`}>
          <Box className="flex-1">
            <Text className="text-onPrimary text-xs font-bold" style={CAPS} accessibilityRole="header">Listening time</Text>
            <Text className="text-onPrimary text-hero font-display mt-1" style={tabular}>{`${h} h ${m} min`}</Text>
          </Box>
          <Box className="items-end">
            <Text className="text-onPrimary text-xs">{`${all?.finished ?? 0} finished`}</Text>
            {profile.stats.last7.listenedMs > 0 ? <Text className="text-onPrimary text-xs text-right">This week: {hms(profile.stats.last7.listenedMs)}</Text> : null}
          </Box>
        </Box>
      )}

      {own ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">My stickers</Text>
          {/* M12 FR-065: the stickers themselves, not a count — earned ones in colour, the next
              ones faint, so there is something to see from the first day. */}
          <Link href="/stickers" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`My stickers: ${plural(earned.filter((x) => x.earned).length, 'sticker')} earned${latest ? `, latest ${latest.title}` : ''}. Open all stickers`} className="bg-surface border border-border rounded-row p-section">
              <Box className="flex-row gap-row">
                {[...earned.filter((x) => x.earned).reverse(), ...earned.filter((x) => !x.earned)].slice(0, 5).map((x) => (
                  <Box key={x.id} className="flex-1 items-center gap-1">
                    <Box className={`w-12 h-12 rounded-pill items-center justify-center ${x.earned ? 'bg-accentTint' : 'bg-background'}`}>
                      <Icon name={x.icon} size={24} color={x.earned ? c.accent : c.muted} />
                    </Box>
                    <Text className={x.earned ? 'text-text text-xs text-center' : 'text-muted text-xs text-center'} numberOfLines={2}>{x.title}</Text>
                  </Box>
                ))}
              </Box>
              <Text className="text-muted text-xs mt-row">{latest ? `Latest: ${latest.title} · all stickers ›` : 'Listen for an hour to earn the first · all stickers ›'}</Text>
            </Pressable>
          </Link>
        </Box>
      ) : null}

      {/* M21 US9: their sticker library (earned ones only), unless they hide it (US10). */}
      {library.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Stickers</Text>
          <Box className="flex-row flex-wrap gap-row bg-surface border border-border rounded-row p-section" accessible accessibilityLabel={`${profile.displayName}'s stickers: ${library.map((x) => x.title).join(', ')}`}>
            {library.map((x) => (
              <Box key={x.id} className="items-center gap-1" style={{ width: 72 }}>
                <Box className="w-12 h-12 rounded-pill items-center justify-center bg-accentTint">
                  <Icon name={x.icon} size={24} color={c.accent} />
                </Box>
                <Text className="text-text text-xs text-center" numberOfLines={2}>{x.title}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      <Box className="gap-row">
      <Text className="text-text text-base font-display" accessibilityRole="header">{own ? 'Recently played' : 'Recent'}</Text>
      {own
        ? (history.length === 0 ? <Text className="text-muted text-sm">Nothing played yet.</Text> : history.map((r) => (
            <Link key={r.episode.id} href={{ pathname: '/episode/[id]', params: { id: r.episode.id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={r.episode.title} className="flex-row gap-row p-row items-center bg-surface border border-border rounded-row">
                <Artwork url={r.episode.imageUrl ?? stores.feeds.getShow(r.episode.feedUrl)?.imageUrl} size={52} rounded="row" name={stores.feeds.getShow(r.episode.feedUrl)?.title} />
                <Box className="flex-1 gap-0.5">
                  <Text className="text-text text-sm font-display" numberOfLines={2}>{r.episode.title}</Text>
                  <Text className="text-muted text-xs" numberOfLines={1}>{stores.feeds.getShow(r.episode.feedUrl)?.title ?? ''}{r.finished ? ' · finished' : ''}</Text>
                </Box>
              </Pressable>
            </Link>
          )))
        : (profile.recent.length === 0 ? <Text className="text-muted text-sm">Nothing public yet.</Text> : feed(profile.recent).map((item) => <FeedItem key={item.id} item={item} onOpen={open} />))}
      </Box>
      {likes.length > 0 ? (
        <Box className="gap-row">
          <Box className="flex-row items-center justify-between">
            <Text className="text-text text-base font-display" accessibilityRole="header">{profile.likesCount !== undefined ? `Likes · ${profile.likesCount}` : 'Likes'}</Text>
            <Pressable onPress={() => router.push({ pathname: '/profile/[id]/likes', params: { id: profile.id, name: profile.displayName } })} accessibilityRole="link" accessibilityLabel={`View all of ${profile.displayName}'s likes`} className="justify-center px-1.5" style={TAP}>
              <Text className="text-accent text-meta font-semibold">View all ›</Text>
            </Pressable>
          </Box>
          {likes.map((l) => <LikeCard key={`${l.episode.id}|${l.createdAt}`} item={{ ...l, listener: undefined }} onOpen={(c) => void cards.open(c)} onPlay={(c) => void cards.play(c)} />)}
        </Box>
      ) : null}
      {playlists.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Playlists</Text>
          {playlists.map((p) => <PlaylistCard key={p.id} playlist={p} mutedColour={c.muted} />)}
        </Box>
      ) : null}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </ScrollView>
    {/* M21 US8: the ⋯ sheet — Follow, Message, Block, Report, Mute. */}
    {!own ? (
      <Actionsheet isOpen={more} onClose={() => setMore(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <Text className="text-sm font-bold text-text py-row" numberOfLines={1}>{name}</Text>
          <SheetRow icon={profile.isFollowing ? 'person-remove-outline' : 'person-add-outline'} label={profile.isFollowing ? 'Unfollow' : 'Follow'} iconColour={c.accent} onPress={() => void follow(!profile.isFollowing)} />
          <SheetRow icon="chatbubble-outline" label="Message" accessibilityLabel={`Message ${name}`} iconColour={c.accent} onPress={() => { setMore(false); router.push({ pathname: '/chat/[id]', params: { id: profile.id, name } }); }} />
          <SheetRow icon={muted ? 'volume-high-outline' : 'volume-mute-outline'} label={muted ? 'Unmute' : 'Mute'} accessibilityLabel={`${muted ? 'Unmute' : 'Mute'} ${name}`} detail="Only you" iconColour={c.muted} onPress={() => { setMore(false); void toggleMute(name); }} />
          <SheetRow icon="ban-outline" label="Block" accessibilityLabel={`Block ${name}`} iconColour={c.muted} onPress={block} />
          <SheetRow icon="flag-outline" label="Report" accessibilityLabel={`Report ${name}`} iconColour={c.muted} onPress={() => { setMore(false); setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' }); }} />
          <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-accent text-sm font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    ) : null}
    {confirmDialog}
    </>
  );
}
