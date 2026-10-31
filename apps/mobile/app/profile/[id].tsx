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
 * M24 US20: someone else's recent rows are `RecentCard`s (52 pt show cover, "commented at 42:15 ·
 * Oct 1"); the avatar sits in a 3 pt white ring.
 * M21 US6 (G-M21-6): Mute / Unmute beside Report — their comments, voice posts and likes leave
 * my pages only; they are never told.
 * M21 US8 (FR-074):
 * - Follow stays a pill; ⋯ opens a sheet holding Follow / Message / Block / Report / Mute (Block,
 *   Report and Mute were inline — moves recorded in __tests__/fixtures/m17/moves.json).
 * - "Host of 《show》" under the name, and a Podcasts row of the shows they host (`hostOf`).
 * - The header collapses: once the name scrolls away, the bar shows the small photo and name.
 * - Likes "View all" → /profile/<id>/likes; others' Subscriptions cell → /profile/<id>/subscriptions
 *   (it says Private when they keep them private).
 *
 * M31 D-C (design-pulse2 `social.html` `profile--screen`, `--own`, `--host`, `--signed-out`, `--stats-empty`, `--suspended`, `--load-failed`,
 * `--more-sheet`, `--block-dialog`, `--blocked`; layout pattern Stage, then a Mosaic): the Stage (glow, the person's stickers, the photo in
 * a light ring, the name, their lines), then under the edge label "Numbers" the four number tiles, Listening time as a hot-tinted 2 x 1
 * tile and "Often listened" as a 2 x 2 tile of covers; below, edge labels Stickers, Recent (a Thread), Likes · n (a Thread, "View all ›") and
 * Playlists (a Deck). The bottom zone holds back and — on someone else's page — Follow (hot pill), Message and More (48 circles); on your own
 * page back and the light Edit profile pill; on a blocked page the quiet "Unblock <name>" pill. The ⋯ sheet is the kit sheet with the
 * name as its head, Block and Report under a rule in hot-text. The header ⋯ left for the More circle (same sheet); the collapsed name
 * (photo 28 + name) joins the status-bar strip once the head scrolls away. The page's pieces are in `src/ui/profile/ProfilePage.tsx`.
 * Reads stay in the `mine` memo and the `showOf` cache (034, C2); nothing here reads the local database in the render body.
 */
import { useCallback, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { MenuRow, MenuRule } from '@/ui/comments/MenuRows';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { useConfirm } from '@/ui/kit/confirm';
import { announce } from '@/safety/context';
import { useUs8Api } from '@/social/us8-api';
import { PlusBadge } from '@/ui/me/PlusCard';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
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
import { PushedPage } from '@/ui/kit/PushedPage';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { RecentCard } from '@/ui/social/RecentCard';
import { Placeholder } from '@/ui/comments/Placeholder';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { Pressable } from '@/ui/lib/pressable';
import { ApiError, type FeedItem as Item, type Profile } from '@/social/api';
import { plural } from '@socialmorning/social-core';
import { ProfileStatRow, listenedLabel, type StatCell } from '@/ui/social/ProfileStatRow';
import { LikeCard } from '@/ui/social/LikeCard';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { useM19Api, type Playlist } from '@/social/m19-api';
import { PlaylistCard } from '@/ui/me/PlaylistCard';
import { useCommentExtrasApi } from '@/social/comment-extras-api';
import { StickerLayer } from '@/ui/me/StickerLayer';
import { theirStickers } from '@/me/my-stickers';
import { OftenListened } from '@/ui/social/OftenListened';
import { compactCount } from '@/ui/social/FollowList';
import type { ProfileStickers } from '@/me/listening-api';
import { Deck } from '@/ui/discover/Deck';
import { EmptyState } from '@/ui/kit/EmptyState';
import { ageLabel, LIST, ThreadNode } from '@/ui/me/lists';
import { SpineLine, Tick } from '@/ui/comments/Spine';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { CenterBlock, IconBlock } from '@/ui/profile/parts';
import { StickerDisc } from '@/ui/profile/StickerDisc';
import { PROFILE_PAGE } from '@/ui/profile/measures';
import { CollapsedName, LANE, ListeningNote, ListeningTile, ProfileFoot, ProfileGlow, ProfileSection, ProfileStage, ProfileTile, TileLabel } from '@/ui/profile/ProfilePage';

/** A hosted show or a played episode in a tile: a 92 cover with its name under it (the tile scrolls sideways when there are more than fit). */
const POD_ITEM = { width: PROFILE_PAGE.podCover };
const SHOWN_LIKES = 5;

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const { safety, version, feed } = useSafety();
  const stores = useStores();
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
    const past = e.nativeEvent.contentOffset.y > PROFILE_PAGE.collapsedAt;
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
  // C2 (T032): the local-database reads are synchronous, so they run here once per profile load
  // (and when the blocklist version moves), not on every render a scroll or a toggle causes.
  const ownProfile = profile !== undefined && listener?.listenerId === profile.id;
  const mine = useMemo(() => {
    if (!ownProfile || !profile) return undefined;
    const server = profile.stats?.all;
    return {
      totals: server ? myTotals(stores, server) : undefined,
      history: listeningHistory(stores, 5),
      earned: myStickers(stores, profile),
      subs: stores.subscriptions.list().length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownProfile, profile, stores, version]);
  const showOf = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof stores.feeds.getShow>>();
    return (feedUrl: string) => {
      if (!seen.has(feedUrl)) seen.set(feedUrl, stores.feeds.getShow(feedUrl));
      return seen.get(feedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, profile, version]);
  // Loading and a failed load: the title bar says "Profile" (design-pulse2 `profile--load-failed`: back and "Profile" in the bottom zone).
  if (error) {
    return (
      <PushedPage title="Profile" tone="grey">
        {(l) => <CenterBlock top={l.top} drawn={280}><IconBlock icon="wifi" failure line={error} /></CenterBlock>}
      </PushedPage>
    );
  }
  if (!profile) return <PushedPage title="Profile">{() => <Box className="items-center p-block"><Loader /></Box>}</PushedPage>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  const name = profile.displayName;
  const hostOf = profile.hostOf ?? [];
  const isHost = hostOf.length > 0;
  const back = <IconButton icon="chevron-back" label="Back" onPress={goBack} fill size={22} />;
  // A suspended account, a blocked one and a reported one: the name and one line, back in the bottom zone (Unblock when blocked).
  if (profile.suspended || blocked || reported) {
    const look = profile.suspended ? 'suspended' : 'blocked';
    return (
      <PushedPage title="Profile" bare tone="none">
        {(l) => (
          <Box className="flex-1">
            <ProfileGlow look={look} />
            <ProfileStage
              top={l.top}
              name={name}
              avatarUrl={profile.avatarUrl}
              look={look}
              quiet={profile.suspended
                ? <Type step="body" className="text-text2 text-center">This account is suspended.</Type>
                : reported ? <Placeholder kind="reported" /> : <Type step="body" className="text-text2 text-center">You blocked this listener.</Type>}
            />
            <ProfileFoot bottom={l.titleBottom}>
              {back}
              {blocked && !profile.suspended ? <BlockButton listenerId={profile.id} displayName={name} look="bar" /> : null}
            </ProfileFoot>
          </Box>
        )}
      </PushedPage>
    );
  }
  // M12 FR-006 (B6): your own totals are at least what this phone has recorded. M16a bug 3: the
  // Stickers page reads the same two functions (src/me/my-stickers.ts), so the numbers agree.
  const server = profile.stats?.all;
  const all = own && server && mine?.totals ? { ...server, ...mine.totals } : server;
  const history = own ? mine?.history ?? [] : [];
  const earned = own ? mine?.earned ?? [] : [];
  const latest = latestEarned(earned);
  const subs = own ? mine?.subs : undefined;
  const theirPrivate = !own && (theirSubs === 'private' || profile.privateSubscriptions === true);
  const time = listenedLabel(profile.stats === null ? undefined : all?.listenedMs ?? 0);
  const statCells: StatCell[] = [
    { key: 'following', value: compactCount(profile.following), label: 'Following', spoken: `${profile.following} following`, href: { pathname: '/profile/[id]/following', params: { id: profile.id, name: profile.displayName, count: String(profile.following) } } },
    { key: 'followers', value: compactCount(profile.followers), label: 'Followers', spoken: plural(profile.followers, 'follower'), href: { pathname: '/profile/[id]/followers', params: { id: profile.id, name: profile.displayName, count: String(profile.followers) } } },
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
  const nowMs = Date.now();
  const recent = own ? [] : feed(profile.recent);
  const emptyStats = profile.stats !== null && all !== undefined && all.listenedMs === 0 && all.finished === 0;
  return (
    <>
    <PushedPage title="Profile" bare tone="none">
      {(l) => (
        <Box className="flex-1">
          <ProfileGlow host={isHost} />
          {collapsed ? <CollapsedName top={l.top} name={name} avatarUrl={profile.avatarUrl} /> : null}
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: l.reserve }} onScroll={onScroll} scrollEventThrottle={32}>
            {/* The Stage: the stickers float over it, the photo sits in a light ring, then the name and their lines. */}
            <ProfileStage
              top={l.top}
              name={name}
              avatarUrl={profile.avatarUrl}
              stickers={<StickerLayer placements={deco.stickers} />}
              /* M20 US6 (FR-022): the PLUS badge, public like the name. */
              badge={profile.plus ? <PlusBadge /> : null}
              lines={(
                <>
                  {own ? <Type step="mono" className="text-text3" style={ME_TYPE.node12}>This is you</Type> : null}
                  {/* M21 US8: the host line — the first show they host, and how many more. */}
                  {isHost ? <Type step="caption" className="text-hotText text-center" style={ME_TYPE.name13}>{`Host of 《${hostOf[0]!.title}》${hostOf.length > 1 ? ` and ${plural(hostOf.length - 1, 'more show')}` : ''}`}</Type> : null}
                  {/* M10b US7: "IP location" — the country from the last sign-in, public (the privacy policy says so). */}
                  {profile.country ? <Type step="tag" className="text-text3" style={ME_TYPE.mono11}>{`IP location: ${countryName(profile.country)}`}</Type> : null}
                  {profile.bio ? <Type step="quote" className="text-text2 text-center">{profile.bio}</Type> : null}
                </>
              )}
            />
            <Box style={{ height: PROFILE_PAGE.gridGap }} />

            {/* Numbers: the four tiles, Listening time, then covers. */}
            <ProfileSection label="Numbers" edgeTop={20}>
              <Box style={[LANE, { gap: ME_MOSAIC.gap }]}>
                {/* M12 FR-064: the numbers in one row. */}
                <ProfileStatRow cells={statCells} />

                {/* M21 US8: the shows they host, as covers (drawn as a 2 x 2 tile in place of Listening time). */}
                {isHost ? (
                  <ProfileTile rows={2} testID="podcasts-tile">
                    <TileLabel text="PODCASTS" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ME_MOSAIC.gap, marginTop: PROFILE_PAGE.tileLabelGap + 2 }}>
                      {hostOf.map((s) => (
                        <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, hosted by ${profile.displayName}`} style={POD_ITEM}>
                          <Box style={{ width: PROFILE_PAGE.podCover, height: PROFILE_PAGE.podCover, borderRadius: PROFILE_PAGE.podRadius, overflow: 'hidden' }}>
                            <Artwork url={showOf(s.feedUrl)?.imageUrl} size={PROFILE_PAGE.podCover} name={s.title} />
                          </Box>
                          <Type step="chip" className="text-text" style={{ marginTop: 6 }} numberOfLines={2}>{s.title}</Type>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </ProfileTile>
                ) : null}

                {/* M6 (FR-019): the stats surface is the numbers, not the activity list below it. */}
                {profile.stats === null ? (
                  <ListeningNote line={own ? 'Your listening is private.' : 'Listening is private.'} />
                ) : emptyStats ? (
                  <ProfileTile testID="listening-note">
                    <TileLabel text="LISTENING TIME" />
                    <Box style={{ marginTop: PROFILE_PAGE.tileLabelGap }}><EmptyState surface="stats" tile /></Box>
                  </ProfileTile>
                ) : (
                  <ListeningTile
                    total={`${h} h ${m} min`}
                    finished={all?.finished ?? 0}
                    {...(profile.stats.last7.listenedMs > 0 ? { week: hms(profile.stats.last7.listenedMs) } : {})}
                    spoken={`Total listening time ${h} hours ${m} minutes`}
                  />
                )}

                {own ? (
                  /* M12 FR-065: the stickers themselves, not a count — earned ones in colour, the next ones faint. */
                  <Link href="/stickers" asChild>
                    <Pressable accessibilityRole="button" accessibilityLabel={`My stickers: ${plural(earned.filter((x) => x.earned).length, 'sticker')} earned${latest ? `, latest ${latest.title}` : ''}. Open all stickers`}>
                      <ProfileTile testID="my-stickers-tile">
                        <TileLabel text={`MY STICKERS · ${earned.filter((x) => x.earned).length} EARNED`} />
                        <Box className="flex-row items-center" style={{ marginTop: PROFILE_PAGE.tileLabelGap, gap: ME_MOSAIC.gap }}>
                          {[...earned.filter((x) => x.earned).reverse(), ...earned.filter((x) => !x.earned)].slice(0, 5).map((x) => (
                            <StickerDisc key={x.id} icon={x.icon} size={PROFILE_PAGE.stickerCircle} on={x.earned} ring={0} />
                          ))}
                          <Type step="caption" className="text-text2 ml-auto" style={ME_TYPE.node12}>all ›</Type>
                        </Box>
                      </ProfileTile>
                    </Pressable>
                  </Link>
                ) : null}

                {/* M22 US17 item 6: the shows they listened to most in the last 90 days. */}
                <OftenListened listenerId={profile.id} name={name} own={own} />

                {own ? (
                  <ProfileTile rows={2} testID="recently-played-tile">
                    <TileLabel text="RECENTLY PLAYED" />
                    {history.length === 0 ? (
                      <Type step="note" className="text-text2" style={{ marginTop: PROFILE_PAGE.tileLabelGap }}>Nothing played yet.</Type>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ME_MOSAIC.gap, marginTop: PROFILE_PAGE.tileLabelGap + 2 }}>
                        {history.map((r) => (
                          <Link key={r.episode.id} href={{ pathname: '/episode/[id]', params: { id: r.episode.id } }} asChild>
                            <Pressable accessibilityRole="button" accessibilityLabel={r.episode.title} style={POD_ITEM}>
                              <Box style={{ width: PROFILE_PAGE.podCover, height: PROFILE_PAGE.podCover, borderRadius: PROFILE_PAGE.podRadius, overflow: 'hidden' }}>
                                <Artwork url={r.episode.imageUrl ?? showOf(r.episode.feedUrl)?.imageUrl} size={PROFILE_PAGE.podCover} name={showOf(r.episode.feedUrl)?.title} />
                              </Box>
<Type step="chip" className="text-text" style={{ marginTop: 6 }} numberOfLines={2}>{r.episode.title}</Type>
                              {r.finished ? <Type step="tag" className="text-text3" style={ME_TYPE.mono11}>finished</Type> : null}
                            </Pressable>
                          </Link>
                        ))}
                      </ScrollView>
                    )}
                  </ProfileTile>
                ) : null}
              </Box>
            </ProfileSection>

            {/* M21 US9: their sticker library (earned ones only), unless they hide it (US10). */}
            {library.length > 0 ? (
              <ProfileSection label="Stickers" testID="stickers-section">
                <Box style={LANE}>
                  <ProfileTile testID="library-tile">
                    <Box className="flex-row flex-wrap" style={{ gap: ME_MOSAIC.gap }} accessible accessibilityLabel={`${profile.displayName}'s stickers: ${library.map((x) => x.title).join(', ')}`}>
                      {library.map((x) => (
                        <Box key={x.id} className="items-center" style={{ width: PROFILE_PAGE.libraryCell, gap: 4 }}>
                          <StickerDisc icon={x.icon} size={40} />
                          <Type step="caption" className="text-text text-center" style={ME_TYPE.node12} numberOfLines={2}>{x.title}</Type>
                        </Box>
                      ))}
                    </Box>
                  </ProfileTile>
                </Box>
              </ProfileSection>
            ) : null}

            {/* Recent: a Thread of what they did. Your own page shows what you played, in the tile above. */}
            {!own ? (
              <ProfileSection label="Recent" testID="recent-section">
                {recent.length === 0 ? (
                  <Type step="caption" className="text-text2" style={LANE}>Nothing public yet.</Type>
                ) : (
                  <Box>
                    <SpineLine />
                    <Box style={{ paddingTop: LIST.top, paddingLeft: LIST.left, paddingRight: LIST.right, gap: LIST.nodeGap }}>
                      {recent.map((item) => (
                        <ThreadNode key={item.id} lead={<Tick text={ageLabel(Date.parse(item.createdAt), nowMs)} />}>
                          <RecentCard item={item} onOpen={open} />
                        </ThreadNode>
                      ))}
                    </Box>
                  </Box>
                )}
              </ProfileSection>
            ) : null}

            {likes.length > 0 ? (
              <ProfileSection label={profile.likesCount !== undefined ? `Likes · ${profile.likesCount}` : 'Likes'} spoken="Likes" testID="likes-section">
                <Box>
                  <SpineLine />
                  <Box style={{ paddingTop: LIST.top, paddingLeft: LIST.left, paddingRight: LIST.right, gap: LIST.nodeGap }}>
                    {likes.slice(0, SHOWN_LIKES).map((l2) => (
                      <ThreadNode key={`${l2.episode.id}|${l2.createdAt}`} lead={<Tick text={ageLabel(Date.parse(l2.createdAt), nowMs)} />}>
                        <LikeCard item={{ ...l2, listener: undefined }} onOpen={(c2) => void cards.open(c2)} onPlay={(c2) => void cards.play(c2)} />
                      </ThreadNode>
                    ))}
                  </Box>
                </Box>
                <Pressable onPress={() => router.push({ pathname: '/profile/[id]/likes', params: { id: profile.id, name: profile.displayName } })} accessibilityRole="link" accessibilityLabel={`View all of ${profile.displayName}'s likes`} hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} className="self-start" style={{ marginTop: 10, marginLeft: ME_MOSAIC.lane }}>
                  <Type step="caption" className="text-hotText font-semibold">View all ›</Type>
                </Pressable>
              </ProfileSection>
            ) : null}

            {playlists.length > 0 ? (
              <ProfileSection label="Playlists" testID="playlists-section">
                <Deck width={PROFILE_PAGE.playlistWidth} height={PROFILE_PAGE.playlistHeight}>
                  {playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
                </Deck>
              </ProfileSection>
            ) : null}
            <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
          </ScrollView>

          {/* The bottom zone: back, then Follow · Message · More (someone else) or Edit profile (you). */}
          <ProfileFoot bottom={l.titleBottom}>
            {back}
            {own ? (
              <Link href="/profile/edit" asChild>
                <PulseButton label="Edit profile" kind="light" icon="create-outline" className="flex-1" onPress={() => undefined} />
              </Link>
            ) : (
              <>
                <FollowButton key={String(profile.isFollowing)} className="flex-1" listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
                {/* Chat (owner, 2026-10-04): the conversation says if you can send (you both follow each other). */}
                <IconButton icon="chatbubble-outline" label={`Message ${profile.displayName}`} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: profile.id, name: profile.displayName } })} fill size={22} diameter={PROFILE_PAGE.barCircle} />
                <IconButton icon="ellipsis-horizontal" label={`More actions for ${profile.displayName}`} onPress={() => setMore(true)} fill size={22} diameter={PROFILE_PAGE.barCircle} />
              </>
            )}
          </ProfileFoot>
        </Box>
      )}
    </PushedPage>
    {/* M21 US8: the ⋯ sheet — Follow, Message, Mute, then Block and Report under a rule. */}
    {!own ? (
      <ActionSheet open={more} onClose={() => setMore(false)} label={`More for ${name}`}>
        <Type step="lede" className="text-text" accessibilityRole="header" numberOfLines={1}>{name}</Type>
        <Box>
          <MenuRow icon={profile.isFollowing ? 'person-remove-outline' : 'person-add-outline'} label={profile.isFollowing ? 'Unfollow' : 'Follow'} onPress={() => void follow(!profile.isFollowing)} />
          <MenuRow icon="chatbubble-outline" label="Message" accessibilityLabel={`Message ${name}`} onPress={() => { setMore(false); router.push({ pathname: '/chat/[id]', params: { id: profile.id, name } }); }} />
          <MenuRow icon={muted ? 'volume-high-outline' : 'volume-mute-outline'} label={muted ? 'Unmute' : 'Mute'} accessibilityLabel={`${muted ? 'Unmute' : 'Mute'} ${name}`} detail="Only you" onPress={() => { setMore(false); void toggleMute(name); }} />
          <MenuRule />
          <MenuRow icon="ban-outline" label="Block" accessibilityLabel={`Block ${name}`} danger onPress={block} />
          <MenuRow icon="flag-outline" label="Report" accessibilityLabel={`Report ${name}`} danger onPress={() => { setMore(false); setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' }); }} />
        </Box>
        <PulseButton label="Cancel" kind="quiet" full onPress={() => setMore(false)} />
      </ActionSheet>
    ) : null}
    {confirmDialog}
    </>
  );
}
