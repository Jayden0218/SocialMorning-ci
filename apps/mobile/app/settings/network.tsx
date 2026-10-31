// Check network: times our server, a show's feed host and an episode's audio host, with a result you can copy.
/**
 * M22 US17 item 13 (T078). Three timed requests, one after another, each with a 10 s limit:
 *   1. our server — GET /v1/health;
 *   2. the feed host — HEAD on a show you follow (its RSS address);
 *   3. the audio host (CDN) — HEAD on the episode playing now, else that show's newest episode.
 * We never host audio, so 2 and 3 are the publishers' own servers. The result is plain text that
 * Copy puts on the clipboard (expo-clipboard, loaded lazily: a build without it hides Copy).
 *
 * M31 S-B (T060; design-pulse2 `settings-network--screen`, `-results`, `toast--settings-network`; layout Panel): the lede, then the three
 * hosts as rows in one group (the status dot 10 — grey before a check, green when the host answered, hot when it did not — the name, the
 * host and what it answered in mono 11, the time in mono 15, or "Failed"), under the edge label HOSTS. The buttons sit under the title:
 * "Start the check" (light, 52) before a check — "Checking…" with the busy bars while it runs — then "Copy the result" (quiet) and
 * "Check again" (light). The rows fill one by one as each host answers. Same requests, report text, names and toasts.
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Box } from '@/ui/lib/box';
import { PanelGroup } from '@/ui/me/Panel';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { Lede, Section, SettingsPage } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';
import { apiBaseUrl } from '@/social/base-url';
import { useStores, useToast } from '@/ui/shell/providers';
import { selectEpisodeId, usePlayerSelector } from '@/playback/store';
import { nowMs as clockMs } from '@/ui/kit/clock';

type Clipboard = { setStringAsync(text: string): Promise<boolean> };
function clipboard(): Clipboard | null {
  try { return require('expo-clipboard') as Clipboard; } catch { return null; }
}

type Result = { name: string; host: string; ok: boolean; ms: number; detail: string };

const LIMIT_MS = 10_000;

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m?.[1] ?? url;
}

async function timed(name: string, url: string | undefined, method: 'GET' | 'HEAD'): Promise<Result> {
  if (url === undefined) return { name, host: '—', ok: false, ms: 0, detail: 'Nothing to test (follow a show first)' };
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LIMIT_MS);
  try {
    const res = await fetch(url, { method, signal: abort.signal });
    return { name, host: hostOf(url), ok: res.status < 500, ms: Date.now() - started, detail: `HTTP ${res.status}` };
  } catch (e) {
    const ms = Date.now() - started;
    return { name, host: hostOf(url), ok: false, ms, detail: ms >= LIMIT_MS ? 'No answer in 10 s' : (e instanceof Error ? e.message : 'Failed') };
  } finally {
    clearTimeout(timer);
  }
}

const HOSTS = ['Our server', 'Feed host', 'Audio host'] as const;

export default function NetworkScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const playingId = usePlayerSelector(selectEpisodeId);
  const [results, setResults] = useState<Result[] | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const copy = clipboard();

  const run = async () => {
    setRunning(true);
    setResults([]);
    const feedUrl = stores.subscriptions.list()[0]?.feedUrl;
    const playing = playingId === undefined ? undefined : stores.feeds.getEpisode(playingId);
    const episodeUrl = playing?.enclosureUrl ?? (feedUrl === undefined ? undefined : stores.feeds.listEpisodes(feedUrl)[0]?.enclosureUrl);
    const out: Result[] = [];
    for (const [name, url, method] of [
      ['Our server', `${apiBaseUrl()}/v1/health`, 'GET'],
      ['Feed host', feedUrl, 'HEAD'],
      ['Audio host', episodeUrl, 'HEAD'],
    ] as const) {
      out.push(await timed(name, url, method));
      setResults([...out]);
    }
    setRunning(false);
  };

  const report = results === undefined ? '' : [
    `SocialNet ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${String(Platform.Version)}`,
    `Checked ${new Date(clockMs()).toISOString()}`,
    ...results.map((r) => `${r.name} (${r.host}): ${r.ok ? 'OK' : 'FAILED'} · ${r.ms} ms · ${r.detail}`),
  ].join('\n');

  const done = !running && results !== undefined && results.length > 0;
  return (
    <SettingsPage
      title="Check network"
      foot={(
        <Box className="flex-row items-center flex-1" style={{ gap: SET.footGap }}>
          {done && copy ? <Box className="flex-1"><PulseButton label="Copy the result" kind="quiet" full onPress={() => void copy.setStringAsync(report).then(() => toast('Copied.'), () => toast('Could not copy.'))} /></Box> : null}
          <Box className="flex-1"><PulseButton label={running ? 'Checking…' : results === undefined ? 'Start the check' : 'Check again'} busy={running} full {...(done && copy ? {} : { height: SET.footButton })} onPress={() => void run()} /></Box>
        </Box>
      )}
    >
      <Lede>Tests our server, the host of a show you follow, and the host its audio streams from.</Lede>
      <Section label="Hosts">
        <PanelGroup>
          {HOSTS.map((name) => {
            const r = results?.find((x) => x.name === name);
            return (
              <Box key={name} testID="host-row" className="flex-row items-center" style={{ minHeight: SET.hostMin, paddingVertical: 14, paddingHorizontal: SET.rowPadX, gap: SET.rowGap }}>
                <Box testID="host-dot" style={{ width: SET.dot, height: SET.dot, borderRadius: SET.dot / 2, backgroundColor: r === undefined ? colour.glowGrey : r.ok ? colour.ok : colour.hot }} accessible={false} importantForAccessibility="no-hide-descendants" />
                <Box className="flex-1" style={{ minWidth: 0 }}>
                  <Type step="row" className="text-text">{name}</Type>
                  <Type step="mono" className="text-text3" numberOfLines={1} style={SET_TYPE.mono11}>{r === undefined ? 'not checked yet' : `${r.host} · ${r.detail}`}</Type>
                </Box>
                <Type step="mono" className={r === undefined ? 'text-text2' : 'text-text'} style={SET_TYPE.mono15}>{r === undefined ? '—' : r.ok ? `${r.ms} ms` : 'Failed'}</Type>
              </Box>
            );
          })}
        </PanelGroup>
      </Section>
    </SettingsPage>
  );
}
