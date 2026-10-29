// Open one status full screen, with the statuses around it, its items, replies and reactions.
/**
 * M22 US2 (FR-006, T021): the full-screen viewer, opened from a status circle on Updates or from a
 * push / notice (`/status/<id>`). It loads the same row the circles show (GET /v1/voice-posts with
 * suggestions) and starts at this status, so the right and left thirds move through the row; a
 * status that is not in the row (an old link) opens alone. Our own header with Close; no native
 * sheet. An expired status (gone at 24 h) says so.
 *
 * M24 US1/US17: someone else's status has More → Report (hidden for me at once, then sent), and
 * on a suggested one "Stop suggesting <name>". A status I reported leaves the row.
 *
 * M31 W4-B (T051; design-pulse2 `status--screen`, `-signed-out`, `-gone`, `-more-sheet`, `status--toast`): the page is the Stage — no header; Close
 * is the × circle at the bar's left (beside the reply box), More sits in the head row. Signed out and gone are the pushed shape: the violet-first glow,
 * a lock and a light Sign in (or the empty block), and the title bar low with a × and "Status". The More sheet lists "Stop suggesting <name>" first,
 * then Report this status under the rule in hot-text. Same actions, names and handlers.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton } from '@/ui/kit/PulseButton';
import { Loader } from '@/ui/kit/Loader';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PushedPage } from '@/ui/kit/PushedPage';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { usePlayer } from '@/playback/store';
import { useSocial } from '@/social/context';
import { useM22SocialApi, type Status } from '@/social/api-m22-social';
import { StatusViewer } from '@/ui/social/StatusViewer';
import { MoreSheet } from '@/ui/social/MoreSheet';
import { PageEmpty } from '@/ui/me/lists';
import { SignInBlock } from '@/ui/status/SignInBlock';
import { TEXT_PAGE } from '@/ui/status/measures';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useSafety } from '@/safety/context';
import { reportAndDrop } from '@/telemetry/reportError';

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'ok'; statuses: Status[]; index: number };

export default function StatusScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const api = useM22SocialApi();
  const { listener } = useSocial();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const { safety } = useSafety();
  const toast = useToast();
  const [more, setMore] = useState<Status | undefined>(undefined);
  const [reporting, setReporting] = useState<ReportTarget | undefined>(undefined);
  /** M24: what I reported is not shown to me again (read through a ref, so `load` stays the same function). */
  const safetyRef = useRef(safety);
  safetyRef.current = safety;
  const visible = useCallback((row: Status[]) => row.filter((x) => !safetyRef.current.isHidden('status', x.id)), []);

  const load = useCallback(async (keep?: string) => {
    const want = keep ?? id;
    if (!want) { setState({ kind: 'gone' }); return; }
    try {
      const row = visible(await api.statuses());
      const at = row.findIndex((s) => s.id === want);
      if (at >= 0) { setState({ kind: 'ok', statuses: row, index: at }); return; }
      setState({ kind: 'ok', statuses: [await api.status(want)], index: 0 });
    } catch {
      setState({ kind: 'gone' });
    }
  }, [api, id, visible]);
  useEffect(() => { void load(); }, [load]);

  const close = () => goBack();
  const current = state.kind === 'ok' ? state.statuses[state.index] : undefined;
  const playEpisode = (episodeId: string) => {
    const it = current?.items.find((x) => x.kind === 'episode' && x.episodeId === episodeId);
    if (!it || it.kind !== 'episode') return;
    if (!it.enclosureUrl) { router.push({ pathname: '/episode/[id]', params: { id: episodeId } }); return; }
    player.load({
      id: episodeId, url: it.enclosureUrl, title: it.title ?? 'Episode', showTitle: it.showTitle ?? '',
      ...(it.imageUrl ? { artworkUrl: it.imageUrl } : {}), ...(it.durationMs !== undefined ? { durationMs: it.durationMs } : {}), ...(it.feedUrl ? { feedUrl: it.feedUrl } : {}),
    }, 'play');
  };

  /** After a report or "stop suggesting": drop those statuses and stay at the same place, or close when none is left. */
  const drop = (gone: (x: Status) => boolean) => {
    if (state.kind !== 'ok') return;
    const left = state.statuses.filter((x) => !gone(x));
    if (left.length === 0) { close(); return; }
    setState({ kind: 'ok', statuses: left, index: Math.min(state.index, left.length - 1) });
  };
  const stopSuggesting = (st: Status) => {
    void api.stopSuggesting(st.author.id).then(
      () => { toast(`We won't suggest ${st.author.name}'s statuses.`); drop((x) => x.suggested && x.author.id === st.author.id); },
      (e: unknown) => { reportAndDrop('status.stopSuggesting')(e); toast("Couldn't do that. Try again."); },
    );
  };

  const sheets = (
    <>
      <MoreSheet
        open={more !== undefined}
        title={more ? `${more.author.name}'s status` : ''}
        iconColour={c.accent}
        onClose={() => setMore(undefined)}
        rows={more ? [
          ...(more.suggested ? [{ icon: 'eye-off-outline' as const, label: `Stop suggesting ${more.author.name}`, onPress: () => stopSuggesting(more) }] : []),
          { icon: 'flag-outline', label: 'Report this status', danger: true, onPress: () => setReporting({ kind: 'status', id: more.id, authorId: more.author.id, label: 'status' }) },
        ] : []}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} onReported={() => { const id = reporting?.id; if (id) drop((x) => x.id === id); }} />
    </>
  );

  // Signed out, loading and gone: the pushed shape, with Close (×) in the bottom zone.
  if (!listener || state.kind !== 'ok') {
    return (
      <PushedPage title="Status" size={26} tone="none" onBack={close} backIcon="close" backLabel="Close">
        {(layout) => (
          <Box className="flex-1">
            <PageGlow flip top={-200} strength={0.3} />
            {!listener ? (
              <Box className="absolute left-0 right-0" style={{ top: layout.top + TEXT_PAGE.signInTop }}><SignInBlock line="Sign in to see statuses." /></Box>
            ) : state.kind === 'loading' ? (
              <Box className="items-center" style={{ paddingTop: layout.top + TEXT_PAGE.signInTop }}><Loader /></Box>
            ) : (
              <Box className="absolute left-0 right-0" style={{ top: layout.top + TEXT_PAGE.signInTop }}><PageEmpty top={0} title="This status is gone" line="This status is gone. Statuses are deleted 24 hours after they are posted." /></Box>
            )}
          </Box>
        )}
      </PushedPage>
    );
  }
  return (
    <>
      <StatusViewer
        statuses={state.statuses}
        index={state.index}
        onIndex={(i) => setState({ ...state, index: i })}
        onClose={close}
        pauseEpisode={player.pause}
        playEpisode={playEpisode}
        reload={() => { if (current) void load(current.id); }}
        onMore={setMore}
        close={<IconButton icon="close" label="Close" onPress={close} fill />}
      />
      {sheets}
    </>
  );
}
