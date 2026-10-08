// Check network: times our server, a show's feed host and an episode's audio host, with a result you can copy.
/**
 * M22 US17 item 13 (T078). Three timed requests, one after another, each with a 10 s limit:
 *   1. our server — GET /v1/health;
 *   2. the feed host — HEAD on a show you follow (its RSS address);
 *   3. the audio host (CDN) — HEAD on the episode playing now, else that show's newest episode.
 * We never host audio, so 2 and 3 are the publishers' own servers. The result is plain text that
 * Copy puts on the clipboard (expo-clipboard, loaded lazily: a build without it hides Copy).
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
import { apiBaseUrl } from '@/social/base-url';
import { useStores, useToast } from '@/ui/shell/providers';
import { usePlayerState } from '@/playback/store';

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

export default function NetworkScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const state = usePlayerState();
  const [results, setResults] = useState<Result[] | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const copy = clipboard();

  const run = async () => {
    setRunning(true);
    setResults([]);
    const feedUrl = stores.subscriptions.list()[0]?.feedUrl;
    const playingId = state.kind === 'idle' ? undefined : state.episodeId;
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
    `Checked ${new Date().toISOString()}`,
    ...results.map((r) => `${r.name} (${r.host}): ${r.ok ? 'OK' : 'FAILED'} · ${r.ms} ms · ${r.detail}`),
  ].join('\n');

  return (
    <>
    <PageHeader title="Check network" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-row">
      <Text className="text-muted text-body">Tests our server, the host of a show you follow, and the host its audio streams from.</Text>
      <Button label={running ? 'Checking…' : results === undefined ? 'Start the check' : 'Check again'} busy={running} onPress={() => void run()} />
      {results !== undefined && results.length > 0 ? (
        <Card className="py-1">
          {results.map((r) => (
            <Box key={r.name}>
              <Box className="py-row gap-0.5">
                <Box className="flex-row justify-between">
                  <Text className="text-text text-body font-bold">{r.name}</Text>
                  <Text className={r.ok ? 'text-text text-body' : 'text-accent text-body font-bold'}>{r.ok ? `${r.ms} ms` : 'Failed'}</Text>
                </Box>
                <Text className="text-muted text-xs" numberOfLines={1}>{`${r.host} · ${r.detail}`}</Text>
              </Box>
            </Box>
          ))}
        </Card>
      ) : null}
      {!running && results !== undefined && results.length > 0 && copy ? (
        <Button label="Copy the result" kind="secondary" onPress={() => void copy.setStringAsync(report).then(() => toast('Copied.'), () => toast('Could not copy.'))} />
      ) : null}
    </ScrollView>
    </>
  );
}
