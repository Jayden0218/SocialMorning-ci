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
import { useOpenLink } from '@/ui/kit/useOpenLink';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseTile, PulseTileGrid } from '@/ui/kit/PulseTile';
import { Curve } from '@/ui/kit/Curve';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { colour, hit, radius, spacing } from '@/design';
import { share as shareMeasure } from '@/design/tokens';
import { mmss } from '@/ui/kit/format';
import { useM12Api } from '@/social/m12-api';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { useSocial } from '@/social/context';
import { createSocialCache } from '@/social/cache';
import { extensionFor } from '@/downloads/expo-downloader';
import type { PlayableEpisode } from '@/playback/store';
import * as ClipVideo from '../../../modules/clip-video';
import { installedTargets, type ShareTarget } from './share-targets';
import type { Clip } from '@/social/api';
import { apiBaseUrl } from '@/social/base-url';
import { shareClip, shareText } from '@/graph/share';
import { clipLinkFor } from '@/graph/links';

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
  const { openOutside } = useOpenLink();
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
    try { await openOutside(t.url(message(), Platform.OS)); props.onShared?.(); } catch { toast(`Couldn't open ${t.label}.`); }
  };
  const copyLink = () => { Clipboard.setString(m12.episodePageUrl(props.episode.id)); toast('Link copied.'); props.onShared?.(); };
  // design-pulse2 `player--share-sheet`: the card chosen on top decides what the tiles share.
  const [pick, setPick] = useState<'moment' | 'episode'>('moment');
  const withMoment = props.onClip !== undefined;
  const momentAt = !withMoment || pick === 'moment' ? props.atMs : undefined;
  const shareImage = async () => {
    // Phone walk 2026-09-30: the card took 10–16 s with nothing on screen; say it is coming.
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `share-${props.episode.id}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(m12.shareCardUrl(props.episode.id, momentAt), target);
      await Share.share({ url: file.uri, message: props.episode.title });
      props.onShared?.();
    } catch {
      toast("Couldn't make the picture — try again when you're online.");
    }
  };

  // M24 US20 (`ShareSheet-B`): the heat this phone already has for the episode, under "Share this moment".
  // Read straight from the phone's social cache (no provider needed): nothing cached, no chart.
  const social = props.open && stores.socialCache ? createSocialCache(stores.socialCache).get(props.episode.id)?.social : undefined;
  const heat = social?.heat.available ? shareHeat(social.heat.buckets, props.atMs, social.episode.durationMs) : undefined;
  const cards: ShareCard[] = withMoment ? [
    { key: 'moment', label: 'Share this moment', title: props.episode.title, ...(props.atMs !== undefined ? { at: mmss(props.atMs) } : {}), ...(heat ? { heat: heat.bars, played: heat.at >= 0 ? (heat.at + 1) / SHARE_HEAT_BARS : 0 } : {}) },
    { key: 'episode', label: 'Episode · Show', title: props.episode.title, ...(heat ? { heat: heat.bars } : {}) },
  ] : [];
  const rows: ShareOption[] = [
    // Chat (owner, 2026-10-04): send the episode to someone who follows you back — a target in the row.
    { icon: 'chatbubbles-outline', label: 'Send in chat', target: true, onPress: () => router.push({ pathname: '/chat/new', params: { episodeId: props.episode.id, episodeTitle: props.episode.title } }) },
    { icon: 'image-outline', label: 'Share as image', onPress: () => void shareImage() },
    { icon: 'link-outline', label: 'Copy link', onPress: copyLink },
    ...(props.onClip ? [{ icon: 'cut-outline' as const, label: 'Clip', detail: 'the last 30 seconds', onPress: props.onClip }] : []),
  ];
  const apps: ShareOption[] = targets.map((t) => ({ icon: t.icon, label: t.label, onPress: () => void sendWith(t) }));
  return <SharePanel open={props.open} onClose={props.onClose} subtitle={`${props.episode.title} · ${props.episode.showTitle}`} apps={apps} rows={rows} cards={cards} chosen={pick} onChoose={(k) => setPick(k === 'episode' ? 'episode' : 'moment')} more={{ detail: 'a link to its page', run: () => void shareLink() }} colour={c.text} />;
}

/**
 * One of the app's own share options. A plain one is a tile; `target` puts it in the targets row
 * (the drawing's "Send in chat"). `accessibilityLabel` overrides the spoken name.
 */
export type ShareOption = { icon: IconName; label: string; detail?: string; target?: boolean; onPress: () => void };

/** M24 US20: how many bars the lead card's little heat chart draws (`ShareSheet-B`: 30). */
export const SHARE_HEAT_BARS = 30;

/**
 * The episode's heat squeezed into `SHARE_HEAT_BARS` bars (each the loudest bucket it covers,
 * 0–1) and the bar the moment falls in. Undefined when there is no heat to show.
 */
export function shareHeat(buckets: readonly number[] | undefined, atMs: number | undefined, axisMs: number | null | undefined): { bars: number[]; at: number } | undefined {
  if (!buckets || buckets.length === 0) return undefined;
  const top = Math.max(...buckets);
  if (!(top > 0)) return undefined;
  const bars: number[] = [];
  for (let i = 0; i < SHARE_HEAT_BARS; i++) {
    const from = Math.floor((i * buckets.length) / SHARE_HEAT_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * buckets.length) / SHARE_HEAT_BARS));
    bars.push(Math.max(...buckets.slice(from, to)) / top);
  }
  const at = atMs !== undefined && axisMs ? Math.min(SHARE_HEAT_BARS - 1, Math.max(0, Math.floor((atMs * SHARE_HEAT_BARS) / axisMs))) : -1;
  return { bars, at };
}

/** A preview card on the Share sheet (design-pulse2: "Share this moment" · "Episode · Show"). */
export type ShareCard = { key: string; label: string; title: string; at?: string; heat?: readonly number[]; played?: number };

function PreviewCard(props: { card: ShareCard; chosen: boolean; onPress: () => void }): React.ReactElement {
  const { card } = props;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={card.label}
      accessibilityState={{ selected: props.chosen }}
      className="bg-raise justify-end"
      style={{ width: shareMeasure.cardWidth, height: shareMeasure.cardHeight, borderRadius: shareMeasure.cardRadius, paddingHorizontal: shareMeasure.cardPadX, paddingVertical: shareMeasure.cardPadY, borderWidth: shareMeasure.cardRing, borderColor: props.chosen ? colour.text : colour.clear, gap: shareMeasure.targetGap }}
    >
      {card.at !== undefined ? <TimestampChip text={card.at} solid /> : null}
      <Type step="row" className="text-text" numberOfLines={2}>{card.title}</Type>
      <Type step="tag" className="text-text2">{card.label}</Type>
      <Curve data={card.heat ?? []} count={shareMeasure.cardCurveBars} height={shareMeasure.cardCurve} played={card.played ?? 0} flat={card.heat === undefined} />
    </Pressable>
  );
}

/**
 * The app's share panel: its own options, then "More" — the only way to the system sheet. Each row
 * closes the panel first, then acts.
 *
 * M31 W3-D (design-pulse2 `player--share-sheet`, the kit `ActionSheet` titled "Share"): optional
 * preview `cards` that snap sideways (the chosen one ringed light — everything below shares that
 * choice), a row of targets (`apps`, the options marked `target`, and "More" last — each a 56 tile
 * with its name under it), then the other options as two-column tiles (`PulseTile`). Same options,
 * names and handlers as before; the props gained `cards`, `chosen`, `onChoose` and `ShareOption.target`.
 * It was M17's `ShareSheet-B` (a lead card, tiles, a serif "Share").
 */
export function SharePanel(props: {
  open: boolean;
  onClose: () => void;
  heading?: string;
  /** The muted line under the title when there are no cards, e.g. "Episode · Show". */
  subtitle?: string;
  rows?: readonly ShareOption[];
  /** M21 US2: the chat apps on this phone, in the targets row. */
  apps?: readonly ShareOption[];
  cards?: readonly ShareCard[];
  chosen?: string;
  onChoose?: (key: string) => void;
  /** The system share sheet, behind "More". */
  more: { detail?: string; run: () => void };
  colour: string;
}): React.ReactElement {
  const c = useColours();
  const close = (then: () => void) => { props.onClose(); then(); };
  const all = props.rows ?? [];
  const chats = all.filter((r) => r.target === true);
  const tiles = all.filter((r) => r.target !== true);
  const cards = props.cards ?? [];
  return (
    <ActionSheet open={props.open} onClose={props.onClose} label="Share" title={props.heading ?? 'Share'}>
      {props.subtitle && cards.length === 0 ? <Type step="body" className="text-text2" numberOfLines={2}>{props.subtitle}</Type> : null}
      {cards.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={shareMeasure.cardWidth + shareMeasure.cardGap} decelerationRate="fast" style={{ marginRight: -spacing.screenX }} contentContainerStyle={{ gap: shareMeasure.cardGap, paddingRight: spacing.screenX }}>
          {cards.map((card) => <PreviewCard key={card.key} card={card} chosen={card.key === props.chosen} onPress={() => props.onChoose?.(card.key)} />)}
        </ScrollView>
      ) : null}
      {/* F3: the targets row scrolls sideways when the chat apps on this phone do not fit (Send in chat + five apps + More is 7 x 56 on a 350 row: More was cut off and unreachable); with few targets it spreads as drawn. */}
      <ScrollView testID="share-targets" horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.screenX }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: spacing.screenX, gap: spacing.row }}>
        {chats.map((r) => (
          <Pressable key={r.label} onPress={() => close(r.onPress)} accessibilityRole="button" accessibilityLabel={r.label} className="items-center" style={{ gap: shareMeasure.targetGap, minWidth: shareMeasure.target }}>
            <Box className="bg-raise items-center justify-center" style={{ width: shareMeasure.target, height: shareMeasure.target, borderRadius: shareMeasure.targetRadius }}>
              <Icon name={r.icon} size={shareMeasure.targetIcon} color={c.text} />
            </Box>
            <Type step="tag" className="text-text2" numberOfLines={1}>{r.label}</Type>
          </Pressable>
        ))}
        {(props.apps ?? []).map((a) => (
          <Pressable key={a.label} onPress={() => close(a.onPress)} accessibilityRole="button" accessibilityLabel={`Send with ${a.label}`} className="items-center" style={{ gap: shareMeasure.targetGap, minWidth: shareMeasure.target }}>
            <Box className="bg-raise items-center justify-center" style={{ width: shareMeasure.target, height: shareMeasure.target, borderRadius: shareMeasure.targetRadius }}>
              <Icon name={a.icon} size={shareMeasure.targetIcon} color={c.text} />
            </Box>
            <Type step="tag" className="text-text2" numberOfLines={1}>{a.label}</Type>
          </Pressable>
        ))}
        <Pressable onPress={() => close(props.more.run)} accessibilityRole="button" accessibilityLabel="More ways to share" className="items-center" style={{ gap: shareMeasure.targetGap, minWidth: shareMeasure.target }}>
          <Box className="bg-raise items-center justify-center" style={{ width: shareMeasure.target, height: shareMeasure.target, borderRadius: shareMeasure.targetRadius }}>
            <Icon name="ellipsis-horizontal" size={shareMeasure.targetIcon} color={c.text} />
          </Box>
          <Type step="tag" className="text-text2">More</Type>
        </Pressable>
      </ScrollView>
      {tiles.length > 0 ? (
        <PulseTileGrid>
          {tiles.map((r, i) => (
            <PulseTile key={r.label} icon={r.icon} label={r.label} {...(r.detail !== undefined ? { detail: r.detail } : {})} wide={tiles.length % 2 === 1 && i === tiles.length - 1} onPress={() => close(r.onPress)} />
          ))}
        </PulseTileGrid>
      ) : null}
    </ActionSheet>
  );
}

export type ShareRequest = {
  heading?: string;
  subtitle?: string;
  rows?: readonly ShareOption[];
  more: { detail?: string; run: () => void };
  onClosed?: () => void;
  /** F3: the text the chat apps on this phone (WhatsApp, Telegram ...) are sent; with it the panel's targets row lists them. */
  message?: string;
  onShared?: () => void;
};

/**
 * Opens the panel from anywhere on a page: `const [share, panel] = useSharePanel();` then
 * `share({ more: { run: () => void Share.share(…) } })` and render `{panel}`.
 */
export function useSharePanel(): [(request: ShareRequest) => void, React.ReactElement] {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const { openOutside } = useOpenLink();
  const [request, setRequest] = useState<ShareRequest | undefined>();
  const open = useCallback((next: ShareRequest) => setRequest(next), []);
  // F3: the chat apps on this phone, asked each time a request with a message opens the panel (as the episode chooser does).
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const wantsApps = request?.message !== undefined;
  useEffect(() => {
    if (!wantsApps) return;
    let live = true;
    void installedTargets((u) => Linking.canOpenURL(u)).then((t) => { if (live) setTargets(t); });
    return () => { live = false; };
  }, [wantsApps]);
  const message = request?.message;
  const apps: ShareOption[] = message === undefined ? [] : targets.map((t) => ({
    icon: t.icon,
    label: t.label,
    onPress: () => {
      void (async () => {
        if (t.copiesFirst) { Clipboard.setString(message); toast(`Link copied — paste it in ${t.label}.`); }
        try { await openOutside(t.url(message, Platform.OS)); request?.onShared?.(); } catch { toast(`Couldn't open ${t.label}.`); }
      })();
    },
  }));
  const onClose = () => { const done = request?.onClosed; setRequest(undefined); done?.(); };
  const panel = (
    <SharePanel
      open={request !== undefined}
      onClose={onClose}
      {...(request?.heading !== undefined ? { heading: request.heading } : {})}
      {...(request?.subtitle !== undefined ? { subtitle: request.subtitle } : {})}
      rows={request?.rows ?? []}
      apps={apps}
      more={request?.more ?? { run: () => undefined }}
      colour={c.text}
    />
  );
  return [open, panel];
}

/**
 * F3 (design-pulse2 `clip--share-sheet`, `ShareSheet-B`): a clip's share panel is the player's — Send in chat, the chat apps on this
 * phone, More, then Share as video and Copy link. `heading` is "Share this clip" (the clip page) or "Clip saved — share it".
 * Send in chat opens the chat picker with the clip's text and link; Copy link copies the clip's https link.
 */
export function useClipShare(): (clip: Clip, episode: PlayableEpisode, heading?: string) => ShareRequest {
  const videoRows = useClipVideoRows();
  const toast = useToast();
  return (clip, episode, heading = 'Share this clip') => {
    const message = shareText(clip, episode.title, apiBaseUrl());
    return {
      heading,
      message,
      rows: [
        { icon: 'chatbubbles-outline', label: 'Send in chat', target: true, onPress: () => router.push({ pathname: '/chat/new', params: { text: message } }) },
        ...videoRows(clip, episode),
        { icon: 'link-outline', label: 'Copy link', onPress: () => { Clipboard.setString(clipLinkFor(clip.id, apiBaseUrl())); toast('Link copied.'); } },
      ],
      more: { detail: 'other apps', run: () => void shareClip(Share, clip, episode.title, apiBaseUrl()) },
    };
  };
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
