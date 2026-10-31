// A shared clip opened from a link: the episode's art, a ring that plays it, the range, the author, play the episode, share.
/**
 * A clip link opened on this phone (M4 US1, FR-003/FR-004). Both link forms land here
 * (expo-router: `socialmorning://clip/<id>` and the verified https link). Works signed
 * out: clips are public. Resolution order in `src/graph/resolve.ts`.
 *
 * M17 (`Clip-B`): one centred card and an action bar. M31 W3-B (T041; design-pulse2 `clip--screen`, `-signed-out`,
 * `-share-sheet`, `-not-found`; "Layout: Stage"): the episode's art fills the screen under a veil that goes to void; the
 * clip plays at once in a 200 ring (src/ui/clips/ClipRing.tsx — the disc in it is "Play the clip") that fills as the 30 s
 * run. Low on the page: the range as a solid chip and "by Rui" (a link to the profile), the episode title (Unbounded 28), the
 * caption in quotes, and where the clip sits on the episode's reaction curve (60 bars, the clip's run hot). At the foot:
 * "Play the episode" (light — from the clip's start, then the player) and Share (48). The top bar is back, "CLIP · 30 s"
 * and ···: Share as video, Delete this clip (yours), Report this clip (others'). When the clip ends the ring turns into
 * two pills, "Keep listening" and "Open player". Signed out: a glass strip under the top bar with a hot-text "Sign in".
 * A removed clip says so and keeps "Play the episode"; a missing one is the grey not-found page. There is no now bar on
 * this page (`miniPlayerShows`): the ring is the player.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Link, LinearGradient } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { selectIsPlaying, usePlayer, usePlayerSelector } from '@/playback/store';
import { refreshShow } from '@/feeds/fetch';
import { resolveClipEpisode, type Resolved } from '@/graph/resolve';
import { useClipShare, useClipVideoRows, useSharePanel } from '@/ui/clips/ShareChooser';
import { ClipRing } from '@/ui/clips/ClipRing';
import { CLIP_PAGE, clipsType } from '@/ui/clips/measures';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { MenuRow, MenuRule } from '@/ui/comments/MenuRows';
import { useInsets } from '@/ui/comments/useInsets';
import { EmptyBlock } from '@/ui/chat/EmptyBlock';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { goBack } from '@/ui/kit/PageHeader';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { bars, colour, gutter, hit, spacing } from '@/design';
import { ApiError, type Clip } from '@/social/api';

type Status = { kind: 'loading' } | { kind: 'error'; message: string; missing: boolean } | { kind: 'ready'; clip: Clip; resolved: Resolved };

const NO_HEAT: readonly number[] = [];

/** The bars the clip covers on a curve of `count` bars over an episode `durationMs` long. */
export function hotRangeOf(startMs: number, endMs: number, durationMs: number | undefined, count: number): readonly [number, number] | undefined {
  if (!durationMs || !(durationMs > 0) || !(endMs > startMs)) return undefined;
  const from = Math.max(0, Math.min(count - 1, Math.floor((startMs / durationMs) * count)));
  const to = Math.max(from, Math.min(count - 1, Math.ceil((endMs / durationMs) * count) - 1));
  return [from, to];
}

export default function ClipScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const stores = useStores();
  const player = usePlayer();
  const { width } = useWindowDimensions();
  const insets = useInsets();
  // The lag audit (2026-10-04, branch perf): re-render on a change of kind, of the clip, or of a
  // paused position only, then read the full state fresh — usePlayerState re-rendered this page
  // on every position tick. (The ring follows the clock on its own.)
  usePlayerSelector((s) => `${s.kind}|${player.clip() !== undefined}|${s.kind === 'paused' && 'positionMs' in s ? s.positionMs : ''}`);
  const playing = usePlayerSelector(selectIsPlaying);
  const state = player.getState();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();
  // M19: "Share as video" when this build can make one and the clip is at most 60 s.
  const videoRows = useClipVideoRows();
  const clipShare = useClipShare();

  useEffect(() => {
    let live = true;
    setStatus({ kind: 'loading' });
    (async () => {
      try {
        const { clip, episode } = await api.getClip(String(id));
        const resolved = await resolveClipEpisode({ stores, refreshShow: (url) => refreshShow(url, stores.feeds, Date.now()) }, episode);
        if (!live) return;
        setStatus({ kind: 'ready', clip, resolved });
        if (!clip.deleted) player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs });
      } catch (e) {
        if (!live) return;
        const message = e instanceof ApiError ? (e.code === 'not_found' ? 'No such clip.' : e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e);
        setStatus({ kind: 'error', message, missing: e instanceof ApiError && e.code === 'not_found' });
      }
    })();
    return () => { live = false; };
  }, [id, api, stores, player]);

  const heat = useEpisodeHeat(status.kind === 'ready' ? status.resolved.episode.id : '', status.kind === 'ready');

  if (status.kind === 'loading') return <PushedPage title="Clip">{(l) => <Box className="px-screen-x" style={{ paddingTop: l.top + CLIP_PAGE.ringTop }}><Type step="body" className="text-text2">Opening the clip…</Type></Box>}</PushedPage>;
  if (status.kind === 'error') {
    return (
      <PushedPage title="Clip" tone="grey">
        {(l) => <Box style={{ paddingTop: l.top + CLIP_PAGE.emptyTop }}><EmptyBlock title={status.message} line={status.missing ? 'The link may be wrong, or the clip was deleted.' : ''} /></Box>}
      </PushedPage>
    );
  }
  const { clip, resolved } = status;
  const inClip = player.clip() !== undefined;
  const pausedAtEnd = state.kind === 'paused' && !inClip && 'positionMs' in state && Math.abs(state.positionMs - clip.endMs) <= 6_000;
  const seconds = Math.round((clip.endMs - clip.startMs) / 1000);
  const mine = listener?.listenerId === clip.author.id;
  const named = clip.author.displayName !== null;
  const side = gutter(width);
  const showLine = resolved.via === 'server' && resolved.episode.showTitle ? `${resolved.episode.showTitle} · from the server's record (the feed no longer lists it)` : undefined;
  const shareThis = () => share(clipShare(clip, resolved.episode));
  const video = videoRows(clip, resolved.episode)[0];
  const playClip = () => player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs });
  const range = hotRangeOf(clip.startMs, clip.endMs, heat.durationMs ?? resolved.episode.durationMs, CLIP_PAGE.curveBars);
  const hasMenu = !clip.deleted;
  const art = resolved.episode.artworkUrl;
  return (
    <Box className="flex-1 bg-void" testID="clip-page">
      {art ? <Image source={{ uri: art }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <LinearGradient colors={[colour.scrimTop, colour.scrimMid, colour.scrimFoot]} locations={[0, 0.35, 0.72]} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Box className="flex-1">
        {/* The top bar: back, the length, the menu. */}
        <Box className="absolute flex-row items-center justify-between" style={{ left: side, right: side, top: insets.top + CLIP_PAGE.barTop, zIndex: 5 }}>
          <IconButton icon="chevron-back" label="Back" onPress={goBack} size={22} className="bg-glassDark" />
          <Box className="bg-glassDark justify-center" style={{ height: CLIP_PAGE.pill, borderRadius: CLIP_PAGE.pill / 2, paddingHorizontal: spacing.row }}>
            <Type step="mono" className="text-text" numberOfLines={1}>{`CLIP · ${seconds} s`}</Type>
          </Box>
          {hasMenu ? <IconButton icon="ellipsis-horizontal" label="More for this clip" onPress={() => setMenu(true)} size={22} className="bg-glassDark" /> : <Box style={{ width: CLIP_PAGE.glass }} />}
        </Box>
        {!listener ? (
          <Box className="absolute bg-glassDark" style={{ left: spacing.section, right: spacing.section, top: insets.top + CLIP_PAGE.stripTop, zIndex: 6, borderRadius: 16, paddingVertical: spacing.row, paddingHorizontal: 14 }}>
            <Type step="caption" className="text-text">You are not signed in — clips play anyway. Sign in to follow people and make your own.{' '}
              <Type step="caption" className="text-hotText font-bold" accessibilityRole="link" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')}>Sign in</Type>
            </Type>
          </Box>
        ) : null}
        {/* The ring: plays the clip at once; at the clip's end it becomes two pills. */}
        {clip.deleted ? null : (
          <Box className="absolute items-center" style={{ left: 0, right: 0, top: insets.top + CLIP_PAGE.ringTop, zIndex: 4 }}>
            {pausedAtEnd ? (
              <Box testID="clip-end-pills" className="items-center" style={{ gap: spacing.row, paddingTop: CLIP_PAGE.endPillsTop }}>
                <Pressable onPress={() => player.play()} accessibilityRole="button" accessibilityLabel="Keep listening" className="items-center justify-center bg-text rounded-pill px-block" style={{ height: hit.min }}>
                  <Type step="row" className="text-void">Keep listening</Type>
                </Pressable>
                <Pressable onPress={() => router.push('/player')} accessibilityRole="button" accessibilityLabel="Open player" className="flex-row items-center justify-center rounded-pill px-block border-[1.5px] border-outline" style={{ height: hit.min, gap: spacing.gap }}>
                  <Icon name="play-circle-outline" size={18} color={colour.text} />
                  <Type step="row" className="text-text">Open player</Type>
                </Pressable>
              </Box>
            ) : (
              <ClipRing startMs={clip.startMs} endMs={clip.endMs} live={inClip} playing={playing && inClip} label={playing && inClip ? 'Pause the clip' : `Play the clip, ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`} onPress={() => { if (playing && inClip) player.pause(); else playClip(); }} />
            )}
          </Box>
        )}
        {/* Low on the page: the range, who made it, the episode, the caption, where it sits. */}
        <Box className="absolute" style={{ left: side, right: side, bottom: CLIP_PAGE.stackBottom, zIndex: 5, gap: spacing.row - 2 }}>
          <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
            <TimestampChip text={`${mmss(clip.startMs)} – ${mmss(clip.endMs)}`} solid />
            {named ? (
              <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
                {/* A name is not an action (owner's K1 note, 2026-09-25): it takes the text colour, not the accent. */}
                <Pressable accessibilityRole="link" accessibilityLabel={`by ${clip.author.displayName ?? ''}`} className="justify-center" style={{ minHeight: hit.min }}>
                  <Type step="caption" className="text-quote" style={clipsType.by}>by <Type step="caption" className="text-quote font-bold" style={clipsType.by}>{clip.author.displayName ?? ''}</Type></Type>
                </Pressable>
              </Link>
            ) : <Type step="caption" className="text-quote" style={clipsType.by}>by a deleted account</Type>}
          </Box>
          <Type step="hero" className="text-text" style={clipsType.title} numberOfLines={3}>{resolved.episode.title}</Type>
          {showLine ? <Type step="caption" className="text-text2">{showLine}</Type> : null}
          {clip.deleted ? <Type step="body" className="text-text2">This clip was removed. The episode is still here.</Type> : clip.caption ? <Type step="body" className="text-text2">{`“${clip.caption}”`}</Type> : null}
          <Curve data={heat.buckets ?? NO_HEAT} count={CLIP_PAGE.curveBars} height={CLIP_PAGE.curveHeight} min={2} flat={heat.buckets === undefined} {...(range ? { hotRange: range } : {})} accessibilityLabel="Where this clip sits in the episode" />
        </Box>
        {/* The foot: play the episode from the clip, share. */}
        <Box className="absolute flex-row items-center" style={{ left: side, right: side, bottom: bars.pushedGap, zIndex: 5, gap: spacing.row - 2 }}>
          <Pressable
            className="flex-1 flex-row items-center justify-center bg-text rounded-pill px-block"
            style={{ height: hit.min, gap: spacing.hair + 2 }}
            accessibilityRole="button"
            accessibilityLabel="Play the episode"
            onPress={() => {
              // From the clip's start (a removed clip: from where this phone left off).
              const s = player.getState();
              if (!clip.deleted && s.kind !== 'idle' && 'episodeId' in s && s.episodeId === resolved.episode.id) { player.seek(clip.startMs); player.play(); } else { player.load(resolved.episode, 'play'); if (!clip.deleted) player.seek(clip.startMs); }
              router.push('/player');
            }}
          >
            <Icon name="play" size={14} color={colour.void} />
            <Type step="row" className="text-void">Play the episode</Type>
          </Pressable>
          {clip.deleted ? null : (
            <Pressable
              className="bg-raise rounded-pill items-center justify-center"
              style={{ width: CLIP_PAGE.shareCircle, height: CLIP_PAGE.shareCircle }}
              accessibilityRole="button"
              accessibilityLabel="Share this clip"
              onPress={shareThis}
            >
              <Icon name="share-outline" size={20} color={colour.text} />
            </Pressable>
          )}
        </Box>
      </Box>
      <ActionSheet open={menu} onClose={() => setMenu(false)} label="Clip menu">
        {video ? <MenuRow icon="videocam-outline" label={video.label} detail={video.detail ?? ''} onPress={() => { setMenu(false); video.onPress(); }} /> : null}
        {mine ? (
          <>
            {video ? <MenuRule /> : null}
            <MenuRow icon="trash-outline" label="Delete this clip" danger onPress={() => { setMenu(false); void api.deleteClip(clip.id).then(() => setStatus({ kind: 'ready', clip: { ...clip, deleted: true }, resolved })); }} />
          </>
        ) : (
          <>
            {video ? <MenuRule /> : null}
            <MenuRow icon="flag-outline" label="Report this clip" danger onPress={() => { setMenu(false); setReporting({ kind: 'clip', id: clip.id, authorId: clip.author.id, label: 'clip' }); }} />
          </>
        )}
      </ActionSheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {sharePanel}
    </Box>
  );
}
