// The app's share panel: chat apps on this phone, share this moment, a picture, Copy link, More.
/**
 * The first step of Share (M12 FR-033/034). The episode page and the player opened the system
 * sheet with the publisher's raw .mp3 address (NEW-8, found on the iPhone). Now: share the
 * episode's SocialNet page, share this moment as a clip, or share a picture of the episode —
 * drawn by the server, downloaded here, and handed to the system sheet as a file. No audio.
 *
 * M16a T005 (FR-015, owner 2026-10-02): every Share in the app opens THIS panel first — the
 * app's own — and the iOS share sheet only behind its "More" row. `SharePanel` is the panel;
 * `useSharePanel` is how a page opens it for a show, a clip, a code or a file.
 *
 * M17 T099: the panel takes the `ShareSheet-B` layout (see `SharePanel`); the episode chooser
 * passes "Episode · Show" as the subtitle and marks "Share this moment" as the lead card.
 *
 * M19 (owner, 2026-10-05): a clip's panel may carry "Share as video" (`useClipVideoRows`) — the
 * clip as an .mp4 made on the phone by `modules/clip-video` with the phone's own encoders. Shown
 * only in a build that has the module and for a clip of at most 60 s.
 *
 * M21 US2 (spec story 2, scenario 8), after 小宇宙's share panel: the episode's panel opens with a
 * row of the chat apps on this phone (WhatsApp, Telegram, WeChat, Messages, X — `share-targets.ts`,
 * found with `Linking.canOpenURL`), each sending the episode's link straight into that app, and
 * gains "Copy link" beside the picture. More (the system sheet) stays last.
 */
import { useCallback, useEffect, useState } from 'react';
import { Clipboard, Linking, Platform, Share } from 'react-native';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { colour, hit, tabular } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useM12Api } from '@/social/m12-api';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { useSocial } from '@/social/context';
import { extensionFor } from '@/downloads/expo-downloader';
import type { PlayableEpisode } from '@/playback/store';
import * as ClipVideo from '../../../modules/clip-video';
import { installedTargets, type ShareTarget } from './share-targets';

const TAP = { minHeight: hit.min };
/** The × beside the drag bar: a 48 pt square. */
const CLOSE = { width: hit.min, height: hit.min };
/** M17: a share tile in `ShareSheet-B` is ~100 pt tall — icon on top, label and detail below. */
const TILE = { minHeight: 100 };
/** M21: a target app's round button and its name under it. */
const APP = { minWidth: 64, minHeight: hit.min };

export function ShareChooser(props: {
  open: boolean;
  onClose: () => void;
  episode: { id: string; title: string; showTitle: string };
  atMs?: number;
  /** Opens the clip maker at this moment (the M4 flow). */
  onClip?: () => void;
  onShared?: () => void;
}): React.ReactElement {
  const m12 = useM12Api();
  const toast = useToast();
  const stores = useStores();
  const c = useColours(stores.settings);
  const shareLink = async () => {
    const url = m12.episodePageUrl(props.episode.id);
    try { await Share.share({ message: `${props.episode.title} — ${props.episode.showTitle}\n${url}`, url }); props.onShared?.(); } catch { /* dismissed */ }
  };
  // M21 US2: the chat apps on this phone, asked once each time the panel opens.
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  useEffect(() => {
    if (!props.open) return;
    let live = true;
    void installedTargets((u) => Linking.canOpenURL(u)).then((t) => { if (live) setTargets(t); });
    return () => { live = false; };
  }, [props.open]);
  const message = () => `${props.episode.title} — ${props.episode.showTitle}\n${m12.episodePageUrl(props.episode.id)}`;
  const sendWith = async (t: ShareTarget) => {
    if (t.copiesFirst) { Clipboard.setString(message()); toast(`Link copied — paste it in ${t.label}.`); }
    try { await Linking.openURL(t.url(message(), Platform.OS)); props.onShared?.(); } catch { toast(`Couldn't open ${t.label}.`); }
  };
  const copyLink = () => { Clipboard.setString(m12.episodePageUrl(props.episode.id)); toast('Link copied.'); props.onShared?.(); };
  const shareImage = async () => {
    // Phone walk 2026-09-30: the card took 10–16 s with nothing on screen; say it is coming.
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `share-${props.episode.id}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(m12.shareCardUrl(props.episode.id, props.atMs), target);
      await Share.share({ url: file.uri, message: props.episode.title });
      props.onShared?.();
    } catch {
      toast("Couldn't make the picture — try again when you're online.");
    }
  };

  const rows: ShareOption[] = [
    ...(props.onClip ? [{ icon: 'cut-outline' as const, label: 'Share this moment', lead: true, ...(props.atMs !== undefined ? { detail: mmss(props.atMs) } : {}), onPress: props.onClip }] : []),
    { icon: 'image-outline', label: 'Share as image', onPress: () => void shareImage() },
    { icon: 'link-outline', label: 'Copy link', onPress: copyLink },
    // Chat (owner, 2026-10-04): send the episode to someone who follows you back.
    { icon: 'chatbubbles-outline', label: 'Send in chat', onPress: () => router.push({ pathname: '/chat/new', params: { episodeId: props.episode.id, episodeTitle: props.episode.title } }) },
  ];
  const apps: ShareOption[] = targets.map((t) => ({ icon: t.icon, label: t.label, onPress: () => void sendWith(t) }));
  return <SharePanel open={props.open} onClose={props.onClose} subtitle={`${props.episode.title} · ${props.episode.showTitle}`} apps={apps} rows={rows} more={{ detail: 'a link to its page', run: () => void shareLink() }} colour={c.text} />;
}

/**
 * One of the app's own share options (a row above "More"). M17: `lead` draws it as the wide
 * card at the top (`ShareSheet-B`'s "Share this moment"), its `detail` as a large serif figure.
 */
export type ShareOption = { icon: IconName; label: string; detail?: string; lead?: boolean; onPress: () => void };

const TILE_CLASS = 'flex-1 bg-surface border border-border rounded-row p-section gap-row justify-between';

/** A share tile's inside: the icon on top, the label and its detail under it. */
function TileBody(props: { icon: IconName; label: string; detail?: string; colour: string }): React.ReactElement {
  return (
    <>
      <Icon name={props.icon} size={22} color={props.colour} />
      <Box>
        <Text className="text-sm font-bold text-text">{props.label}</Text>
        {props.detail !== undefined ? <Text className="text-xs text-muted" numberOfLines={2}>{props.detail}</Text> : null}
      </Box>
    </>
  );
}

/** Pairs for the two-column grid; an odd last tile takes the full width. */
function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/**
 * The app's share panel: its own options, then "More" — the only way to the system sheet. An ×
 * at the top right closes it (owner, 2026-10-05: it replaced Cancel). Each row closes the panel
 * first, then acts.
 *
 * M17 T099 (`ShareSheet-B`): a 32 pt serif "Share" with an optional subtitle; a `lead` option
 * becomes a wide white card (yellow icon disc, label, serif figure); the other options and
 * "More" become white tiles in two columns; Cancel is an accent text action. Same options,
 * names and handlers as before; the props only gained `subtitle` and `ShareOption.lead`.
 */
export function SharePanel(props: {
  open: boolean;
  onClose: () => void;
  heading?: string;
  /** M17: the muted line under the heading, e.g. "Episode · Show". */
  subtitle?: string;
  rows?: readonly ShareOption[];
  /** M21 US2: the chat apps on this phone, as a row of round buttons above the tiles. */
  apps?: readonly ShareOption[];
  /** The system share sheet, behind "More". */
  more: { detail?: string; run: () => void };
  colour: string;
}): React.ReactElement {
  const c = useColours();
  const close = (then: () => void) => { props.onClose(); then(); };
  const all = props.rows ?? [];
  const leads = all.filter((r) => r.lead === true);
  const tiles: (ShareOption | 'more')[] = [...all.filter((r) => r.lead !== true), 'more'];
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      {/* M16a T014: no fixed bottom padding — ActionsheetContent's own `pb-safe` clears the home indicator. */}
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
        {/* Owner, 2026-10-05: an × at the top right, level with the drag bar, instead of Cancel at the foot. */}
        <Box className="justify-center">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="absolute -right-3 items-center justify-center" style={CLOSE}>
            <Icon name="close" size={18} color={c.muted} />
          </Pressable>
        </Box>
        <Text className="text-display font-display text-text" accessibilityRole="header">{props.heading ?? 'Share'}</Text>
        {props.subtitle ? <Text className="text-body text-muted mt-1" numberOfLines={2}>{props.subtitle}</Text> : null}
        {props.apps && props.apps.length > 0 ? (
          <Box className="flex-row gap-gap mt-section flex-wrap">
            {props.apps.map((a) => (
              <Pressable key={a.label} onPress={() => close(a.onPress)} accessibilityRole="button" accessibilityLabel={`Send with ${a.label}`} className="items-center gap-1" style={APP}>
                <Box className="w-12 h-12 rounded-pill bg-background border border-border items-center justify-center">
                  <Icon name={a.icon} size={24} color={props.colour} />
                </Box>
                <Text className="text-xs text-text" numberOfLines={1}>{a.label}</Text>
              </Pressable>
            ))}
          </Box>
        ) : null}
        <Box className="gap-gap mt-section">
          {leads.map((r) => (
            <Pressable
              key={r.label}
              onPress={() => close(r.onPress)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              {...(r.detail !== undefined ? { accessibilityHint: r.detail } : {})}
              className="bg-surface border border-border rounded-row p-section flex-row items-center gap-row"
              style={TAP}
            >
              <Box className="w-10 h-10 rounded-pill bg-primary items-center justify-center">
                <Icon name={r.icon} size={20} color={c.onPrimary} />
              </Box>
              <Text className="flex-1 text-sm font-bold text-text">{r.label}</Text>
              {r.detail !== undefined ? <Text className="text-hero font-display text-text" style={tabular}>{r.detail}</Text> : null}
            </Pressable>
          ))}
          {pairs(tiles).map((pair) => (
            <Box key={pair.map((t) => (t === 'more' ? 'more' : t.label)).join('|')} className="flex-row gap-gap">
              {pair.map((t) => t === 'more' ? (
                <Pressable key="more" onPress={() => close(props.more.run)} accessibilityRole="button" accessibilityLabel="More ways to share" className={TILE_CLASS} style={TILE}>
                  <TileBody icon="ellipsis-horizontal" label="More" {...(props.more.detail !== undefined ? { detail: props.more.detail } : {})} colour={props.colour} />
                </Pressable>
              ) : (
                <Pressable key={t.label} onPress={() => close(t.onPress)} accessibilityRole="button" accessibilityLabel={t.label} className={TILE_CLASS} style={TILE}>
                  <TileBody icon={t.icon} label={t.label} {...(t.detail !== undefined ? { detail: t.detail } : {})} colour={props.colour} />
                </Pressable>
              ))}
            </Box>
          ))}
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}

export type ShareRequest = { heading?: string; subtitle?: string; rows?: readonly ShareOption[]; more: { detail?: string; run: () => void }; onClosed?: () => void };

/**
 * Opens the panel from anywhere on a page: `const [share, panel] = useSharePanel();` then
 * `share({ more: { run: () => void Share.share(…) } })` and render `{panel}`.
 */
export function useSharePanel(): [(request: ShareRequest) => void, React.ReactElement] {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [request, setRequest] = useState<ShareRequest | undefined>();
  const open = useCallback((next: ShareRequest) => setRequest(next), []);
  const onClose = () => { const done = request?.onClosed; setRequest(undefined); done?.(); };
  const panel = (
    <SharePanel
      open={request !== undefined}
      onClose={onClose}
      {...(request?.heading !== undefined ? { heading: request.heading } : {})}
      {...(request?.subtitle !== undefined ? { subtitle: request.subtitle } : {})}
      rows={request?.rows ?? []}
      more={request?.more ?? { run: () => undefined }}
      colour={c.text}
    />
  );
  return [open, panel];
}

/** How many heat bars the video draws for a clip. */
const VIDEO_BARS = 30;

/**
 * M19: the clip's share of the episode's heat curve (100 buckets over the whole episode), as
 * `bars` samples across the clip. Empty when the curve is not available or the length unknown.
 */
export function clipVideoHeat(buckets: readonly number[] | undefined, durationMs: number | undefined, startMs: number, endMs: number, bars = VIDEO_BARS): number[] {
  if (!buckets || buckets.length === 0 || !durationMs || durationMs <= 0 || endMs <= startMs) return [];
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const t = startMs + ((i + 0.5) / bars) * (endMs - startMs);
    const index = Math.min(buckets.length - 1, Math.max(0, Math.floor((t / durationMs) * buckets.length)));
    out.push(buckets[index] ?? 0);
  }
  return out;
}

/**
 * M19: the "Share as video" row for a clip's share panel — or no row, when this build has no
 * `ClipVideo` module or the clip is empty or longer than 60 s. The tap: fetch the episode to the
 * cache if it is not downloaded ("Downloading the episode…"), make the video ("Making the
 * video…"), then the phone's own share sheet. Any failure is a toast.
 */
export function useClipVideoRows(): (clip: { startMs: number; endMs: number }, episode: PlayableEpisode) => ShareOption[] {
  const run = useClipVideoMaker();
  return (clip, episode) => {
    const length = clip.endMs - clip.startMs;
    if (!ClipVideo.isAvailable() || !(length > 0) || length > ClipVideo.MAX_CLIP_VIDEO_MS) return [];
    return [{ icon: 'videocam-outline', label: 'Share as video', detail: 'up to 60 s', onPress: () => void run(clip, episode) }];
  };
}

/**
 * Makes and shares the video of a range (M19), downloading the episode first when it is not on the
 * phone. M20 US1: `captions` (transcript lines) are drawn in the title's place.
 */
export function useClipVideoMaker(): (clip: { startMs: number; endMs: number }, episode: PlayableEpisode, captions?: { atMs: number; text: string }[]) => Promise<void> {
  const toast = useToast();
  const { cache } = useSocial();
  return async (clip, episode, captions) => {
    let fetched: File | undefined;
    try {
      let audioUri = episode.url;
      if (!audioUri.startsWith('file:')) {
        toast('Downloading the episode…');
        const target = new File(Paths.cache, `clip-audio-${episode.id}.${extensionFor(episode.url)}`);
        if (target.exists) target.delete();
        fetched = await File.downloadFileAsync(episode.url, target);
        audioUri = fetched.uri;
      }
      toast('Making the video…');
      const social = cache.get(episode.id)?.social;
      let heat: number[] = [];
      if (social && social.heat.available) heat = clipVideoHeat(social.heat.buckets, social.episode.durationMs ?? episode.durationMs, clip.startMs, clip.endMs);
      const { uri } = await ClipVideo.makeClipVideo({
        audioUri,
        startMs: clip.startMs,
        endMs: clip.endMs,
        ...(episode.artworkUrl !== undefined ? { coverUri: episode.artworkUrl } : {}),
        title: episode.title,
        show: episode.showTitle,
        heat,
        palette: { background: colour.background, text: colour.text, muted: colour.muted, primary: colour.primary, accent: colour.accent },
        ...(captions && captions.length > 0 ? { captions } : {}),
      });
      await ClipVideo.shareVideo(uri, episode.title);
    } catch {
      toast("Couldn't make the video — try again when you're online.");
    } finally {
      try { if (fetched?.exists) fetched.delete(); } catch { /* the cache folder is cleared by the system anyway */ }
    }
  };
}
