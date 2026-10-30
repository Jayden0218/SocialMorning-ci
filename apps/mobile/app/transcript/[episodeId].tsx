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
 */
import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { Transcript, TranscriptLine } from '@socialmorning/player-core';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { Pressable } from '@/ui/lib/pressable';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Toggle } from '@/ui/kit/Toggle';
import { hit } from '@/design';
import { usePlayer, usePlayerState } from '@/playback/store';
import { useStores, useToast } from '@/ui/shell/providers';
import { useQuoteShare } from '@/ui/player/QuoteShare';
import { readExtras } from '@/feeds/fetch-extras';
import { TranscriptPane } from '@/ui/player/TranscriptPane';
import { TranscriptReportSheet } from '@/ui/player/TranscriptExtras';
import { useSocial } from '@/social/context';
import { phoneLocale, targetLang, useM22Api, type Translation } from '@/social/api-m22-server';

const TAP = { minHeight: hit.min };

export default function TranscriptScreen(): React.ReactElement {
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const stores = useStores();
  const player = usePlayer();
  const state = usePlayerState();
  const [reporting, setReporting] = useState<TranscriptLine | undefined>();
  const episode = stores.feeds.getEpisode(episodeId);
  const transcript = readExtras(stores.extras, episodeId)?.transcript;
  const here = state.kind !== 'idle' && state.episodeId === episodeId;
  const positionMs = state.kind === 'idle' || !here ? 0 : state.kind === 'ended' ? (state.durationMs ?? 0) : (state.positionMs ?? 0);
  const durationMs = state.kind !== 'idle' && here && 'durationMs' in state ? (state.durationMs ?? episode?.durationMs) : episode?.durationMs;
  // M22 US9: select lines → Clip (the clip editor with the range and words), Copy, Share as image.
  const toast = useToast();
  const shareImage = useQuoteShare();

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
    const t = setInterval(() => { void m22.translation(episodeId, lang).then(setTranslation, () => undefined); }, 60_000);
    return () => clearInterval(t);
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

  return (
    <Box className="flex-1 bg-background">
      <PageHeader title="Transcript" {...(episode?.title ? { subtitle: episode.title } : {})} />
      {offered ? (
        <Box className="flex-row items-center gap-gap px-screen-x" style={TAP}>
          <Text className="flex-1 text-text text-body font-bold">Translation</Text>
          {plus ? (
            <Toggle value={on} onChange={turn} label={lang === 'en' ? 'Translation into English' : 'Translation into Chinese'} />
          ) : (
            <Pressable onPress={() => router.push('/wallet')} accessibilityRole="button" accessibilityLabel="Translation is part of PLUS. Open PLUS" className="rounded-pill bg-primary px-row justify-center" style={TAP}>
              <Text className="text-onPrimary text-xs font-bold">PLUS</Text>
            </Pressable>
          )}
        </Box>
      ) : null}
      {on && translation?.state === 'done' ? <Text className="text-muted text-xs px-screen-x">Machine translation. Long-press a line to report a mistake.</Text> : null}
      {on && waiting ? <Text className="text-muted text-body px-screen-x" accessibilityLiveRegion="polite">{`Translating — usually ready within ${translation.etaHours} ${translation.etaHours === 1 ? 'hour' : 'hours'}.`}</Text> : null}
      {on && translation?.state === 'failed' ? <Text className="text-muted text-body px-screen-x">This episode couldn't be translated.</Text> : null}
      <Box className="flex-1 px-screen-x pt-2 pb-section">
        {shown ? (
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
        ) : (
          <Text className="text-body text-muted text-center mt-section">This episode has no transcript on this phone yet. Open it in the player first.</Text>
        )}
      </Box>
      <TranscriptReportSheet episodeId={episodeId} line={reporting} onClose={() => setReporting(undefined)} />
    </Box>
  );
}
