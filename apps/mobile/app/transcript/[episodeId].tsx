// The episode's transcript full screen: follows the audio, tap a line to jump, long-press to share or report it.
/**
 * M21 US2 (spec story 2, scenario 5): ⤢ on the player's transcript lines opens this page. The
 * transcript comes from the phone's cache (src/feeds/fetch-extras), the same copy the player
 * shows. When this episode is the one playing, the current line is marked and followed, and a tap
 * seeks; "Back to now" appears after the listener scrolls away. Our own header (no native chrome).
 *
 * M22 US13 (FR-038–FR-041): on a show the /mod allow-list offers, a "Translation" switch. PLUS
 * members get each original line with its translation under it (same timing, so the highlight
 * still follows playback), marked "Machine translation" and reportable per line; a translation not
 * made yet is queued ("Translating — usually ready within N hours"). Everyone else sees the PLUS
 * sign, which opens the PLUS page (Wallet). Target: English, or Simplified Chinese for an English
 * show when the phone's language is Chinese.
 *
 * M31 W3-B (T041; design-pulse2 `shell.html#transcript--screen`, `toast--transcript`, `listen.html#transcript--none-on-phone`; "Layout: Thread"):
 * a pushed page with the title bar low — back, "Transcript" and the episode's title under it. The Translation row sits at
 * the top (44 tall: the words, then the switch for PLUS or the hot "PLUS" pill); under it the lines hang from the time
 * spine (`TranscriptPane`, the same component the player shows). No now bar (`miniPlayerShows`): the page follows the audio itself.
 * No transcript on this phone: an empty spine, "No transcript yet", the old line, and an "Open player" pill that loads the
 * episode in the player (which fetches its transcript) and opens it. "Copied." sits above the title bar (142 over the strip).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { Transcript, TranscriptLine } from '@socialmorning/player-core';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { LinearGradient } from '@/design/tailwind';
import { EmptyBlock } from '@/ui/chat/EmptyBlock';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { colour, gutter, hit, spacing } from '@/design';
import { PX } from '@/ui/discover/Deck';
import { toPlayable } from '@/storage/playable';
import { playerDurationMs, playerPositionMs, usePlayer, usePlayerSelector } from '@/playback/store';
import type { PlayerState } from '@/playback/types';
import { useStores, useToast } from '@/ui/shell/providers';
import { useQuoteShare } from '@/ui/player/QuoteShare';
import { readExtras } from '@/feeds/fetch-extras';
import { TranscriptPane } from '@/ui/player/TranscriptPane';
import { TranscriptReportSheet } from '@/ui/player/TranscriptExtras';
import { useSocial } from '@/social/context';
import { phoneLocale, targetLang, useM22Api, type Translation } from '@/social/api-m22-server';

/** Drawn: the Translation row 44 tall, 8 under the status bar; the lines start 18 from the left (the spine at 40), 20 from the right; the empty spine is 2 wide. */
export const TRANSCRIPT_PAGE = { rowTop: 8, row: 44, pill: 30, left: PX.eighteen, spine: 2, spineLeft: 40, emptyTop: 190 } as const;
const SPINE_EMPTY = [colour.line, colour.line] as const;

/** What this page draws from the player (T099, review C4): whether THIS episode is loaded, and its position and length — nothing else. */
type TranscriptClock = { here: boolean; positionMs: number; durationMs: number | undefined };
function transcriptClock(s: PlayerState, episodeId: string | undefined): TranscriptClock {
  const here = s.kind !== 'idle' && s.episodeId === episodeId;
  return here ? { here, positionMs: playerPositionMs(s), durationMs: playerDurationMs(s) } : { here, positionMs: 0, durationMs: undefined };
}
const sameTranscriptClock = (a: TranscriptClock, b: TranscriptClock): boolean => a.here === b.here && a.positionMs === b.positionMs && a.durationMs === b.durationMs;

export default function TranscriptScreen(): React.ReactElement {
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const { width } = useWindowDimensions();
  const stores = useStores();
  const player = usePlayer();
  const clock = usePlayerSelector(useCallback((s: PlayerState) => transcriptClock(s, episodeId), [episodeId]), sameTranscriptClock);
  const [reporting, setReporting] = useState<TranscriptLine | undefined>();
  const episode = stores.feeds.getEpisode(episodeId);
  const transcript = readExtras(stores.extras, episodeId)?.transcript;
  const here = clock.here;
  const positionMs = clock.positionMs;
  const durationMs = clock.durationMs ?? episode?.durationMs;
  // M22 US9: select lines → Clip (the clip editor with the range and words), Copy, Share as image.
  const toast = useToast();
  const shareImage = useQuoteShare();
  const side = gutter(width);

  // M22 US13: what the server says about a translation for this episode.
  const { listener } = useSocial();
  const m22 = useM22Api();
  const lang = useMemo(() => targetLang(transcript, phoneLocale()), [transcript]);
  const [translation, setTranslation] = useState<Translation | undefined>();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!listener || !episodeId) { setTranslation(undefined); return undefined; }
    let live = true;
    m22.translation(episodeId, lang).then((t) => { if (live) setTranslation(t); }, () => { if (live) setTranslation(undefined); });
    return () => { live = false; };
  }, [m22, listener, episodeId, lang]);
  // While it is being made, look again every minute.
  const waiting = translation !== undefined && (translation.state === 'queued' || translation.state === 'transcribing' || translation.state === 'translating');
  useEffect(() => {
    if (!on || !waiting || !episodeId) return undefined;
    let live = true; // M32 T090
    const t = setInterval(() => { void m22.translation(episodeId, lang).then((v) => { if (live) setTranslation(v); }, () => undefined); }, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [on, waiting, m22, episodeId, lang]);
  const offered = translation !== undefined && translation.state !== 'not_offered';
  const plus = translation !== undefined && translation.state !== 'plus_required';
  const turn = (next: boolean): void => {
    if (!plus) { router.push('/wallet'); return; }
    setOn(next);
    if (next && episodeId && translation?.state === 'none') {
      void m22.requestTranslation(episodeId, lang).then(setTranslation, () => undefined);
    }
  };
  // Original line, translation under it, same timing: the pane keeps following playback.
  const shown: Transcript | undefined = on && translation?.state === 'done'
    ? { lines: translation.lines.map((l): TranscriptLine => ({ startMs: l.s, endMs: l.e, text: l.t ? `${l.o}\n${l.t}` : l.o })) }
    : transcript;

  const openPlayer = () => {
    // The transcript is fetched when the player opens the episode; load it (playing) and go there.
    const playable = toPlayable(stores, episodeId);
    if (playable && !here) player.load(playable, 'play');
    router.push('/player');
  };
  const note = on && translation?.state === 'done' ? 'Machine translation. Long-press a line to report a mistake.'
    : on && waiting ? `Translating — usually ready within ${translation.etaHours} ${translation.etaHours === 1 ? 'hour' : 'hours'}.`
    : on && translation?.state === 'failed' ? "This episode couldn't be translated."
    : undefined;
  return (
    <>
      <PushedPage title="Transcript" tone="none" now={false} {...(episode?.title ? { subtitle: episode.title } : {})}>
        {(layout) => (
          <Box className="flex-1" style={{ paddingTop: layout.top + TRANSCRIPT_PAGE.rowTop }}>
            {offered ? (
              <Box className="flex-row items-center" style={{ height: TRANSCRIPT_PAGE.row, paddingHorizontal: side, gap: spacing.gap + 2 }}>
                <Type step="row" className="flex-1 text-text">Translation</Type>
                {plus ? (
                  <Toggle value={on} onChange={turn} label={lang === 'en' ? 'Translation into English' : 'Translation into Chinese'} />
                ) : (
                  <Pressable onPress={() => router.push('/wallet')} accessibilityRole="button" accessibilityLabel="Translation is part of PLUS. Open PLUS" hitSlop={(hit.min - TRANSCRIPT_PAGE.pill) / 2} className="bg-hot justify-center" style={{ height: TRANSCRIPT_PAGE.pill, paddingHorizontal: spacing.row, borderRadius: TRANSCRIPT_PAGE.pill / 2 }}>
                    <Type step="mono" className="text-void">PLUS</Type>
                  </Pressable>
                )}
              </Box>
            ) : null}
            {note ? <Type step="caption" className="text-text2" style={{ paddingHorizontal: side }} accessibilityLiveRegion="polite">{note}</Type> : null}
            {shown ? (
              <Box className="flex-1" style={{ paddingLeft: TRANSCRIPT_PAGE.left, paddingRight: side, paddingTop: spacing.hair + 2, paddingBottom: layout.reserve }}>
                <TranscriptPane
                  transcript={shown}
                  positionMs={positionMs}
                  onSeek={(ms) => { if (here) player.seek(ms); }}
                  onReport={setReporting}
                  selectable
                  onClip={(q) => router.push({ pathname: '/clip/new', params: { episodeId, startMs: String(q.startMs ?? 0), endMs: String(q.endMs ?? 0), caption: q.text.slice(0, 200) } })}
                  onCopy={(text) => { void Clipboard.setStringAsync(text).then(() => toast('Copied.')).catch(() => undefined); }}
                  onShareImage={(q) => { void shareImage(episode ? { id: episode.id, title: episode.title } : undefined, q); }}
                  fill
                  {...(durationMs !== undefined ? { durationMs } : {})}
                />
              </Box>
            ) : (
              <Box className="flex-1">
                {/* An empty spine where the lines would hang (line colour), then the empty block. */}
                <LinearGradient colors={SPINE_EMPTY} testID="transcript-empty-spine" pointerEvents="none" accessible={false} style={{ position: 'absolute', left: TRANSCRIPT_PAGE.spineLeft, width: TRANSCRIPT_PAGE.spine, top: spacing.group + 16, height: 300 }} />
                <Box style={{ paddingTop: TRANSCRIPT_PAGE.emptyTop }}>
                  <EmptyBlock title="No transcript yet" line="This episode has no transcript on this phone yet. Open it in the player first.">
                    <PulseButton label="Open player" kind="light" onPress={openPlayer} />
                  </EmptyBlock>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </PushedPage>
      <TranscriptReportSheet episodeId={episodeId} line={reporting} onClose={() => setReporting(undefined)} />
    </>
  );
}
