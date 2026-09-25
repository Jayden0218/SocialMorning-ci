/**
 * The three things every screen needs: the stores, the player, and a way to
 * say something went wrong.
 *
 * This is the only place that opens the database and builds the audio
 * adapter, and it does both exactly once for the app's life.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { createExpoAudioAdapter } from '../playback/expo-audio-adapter';
import { PlayerProvider, createPlayerRuntime, type PlayerRuntime } from '../playback/store';
import { hash } from '../feeds/hash';
import { createSqliteStores } from '../storage/sqlite';
import { toPlayable } from '../storage/playable';
import type { Stores } from '../storage/types';
import { createApi } from '../social/api';
import { apiBaseUrl } from '../social/base-url';
import { registrationFor } from '../social/registration';
import { secureToken } from '../social/token';
import { createPositionSync, IMMEDIATE, UPLOAD_EVERY_MS, type PositionSync } from '../sync/positions';
import { createSubscriptionSync, type SubscriptionSync } from '../sync/subscriptions';
import { createListened } from '../graph/listened';
import { deviceId } from '../sync/device-id';
import { createDownloadManager, type DownloadManager } from '../downloads/manager';
import { createExpoDownloader, downloadPathFor } from '../downloads/expo-downloader';
import { createExpoNetwork } from '../downloads/expo-network';
import { colour } from '../design';

const StoresContext = createContext<Stores | undefined>(undefined);
const ToastContext = createContext<((message: string) => void) | undefined>(undefined);
const SyncContext = createContext<PositionSync | undefined>(undefined);
const SubscriptionSyncContext = createContext<SubscriptionSync | undefined>(undefined);
const DownloadsContext = createContext<DownloadManager | undefined>(undefined);

export function useDownloads(): DownloadManager {
  const m = useContext(DownloadsContext);
  if (m === undefined) throw new Error('useDownloads must be used inside <AppProviders>');
  return m;
}

export function useSubscriptionSync(): SubscriptionSync {
  const v = useContext(SubscriptionSyncContext);
  if (v === undefined) throw new Error('useSubscriptionSync must be used inside <AppProviders>');
  return v;
}

export function usePositionSync(): PositionSync {
  const sync = useContext(SyncContext);
  if (sync === undefined) throw new Error('usePositionSync must be used inside <AppProviders>');
  return sync;
}

export function useStores(): Stores {
  const stores = useContext(StoresContext);
  if (stores === undefined) throw new Error('useStores must be used inside <AppProviders>');
  return stores;
}

export function useToast(): (message: string) => void {
  const toast = useContext(ToastContext);
  if (toast === undefined) throw new Error('useToast must be used inside <AppProviders>');
  return toast;
}

export function AppProviders(props: { children?: ReactNode }): ReactNode {
  const [message, setMessage] = useState<string | undefined>(undefined);
  // The toast is read by the runtime through a ref so that building the
  // runtime does not depend on a state setter identity.
  const show = useRef((next: string) => setMessage(next));

  const stores = useMemo(() => createSqliteStores(hash), []);

  // M3 (US6): positions go to the account. The device id is read lazily (async
  // secure store); until it resolves, uploads wait — the local row is the truth.
  const graphApi = useMemo(() => createApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
  const deviceIdRef = useRef<string | undefined>(undefined);
  const sync = useMemo<PositionSync>(() => {
    let id: string | undefined;
    const api = graphApi;
    const created = createPositionSync({
      api,
      positions: stores.positions,
      get deviceId() { return id ?? 'pending'; },
      isSignedIn: () => id !== undefined && stores.auth.get() !== undefined,
      now: () => Date.now(),
      registration: (episodeId) => registrationFor(stores, episodeId),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    // App start while signed in: pull the account's positions, merge, push (T057) —
    // only once the device id is known, or `isSignedIn()` is false and nothing happens.
    // (Seen on the phone 2026-09-21: the reconcile ran before the id resolved and did nothing.)
    void deviceId().then((v) => { id = v; deviceIdRef.current = v; void created.reconcile(); });
    return created;
  }, [stores, graphApi]);

  /**
   * M8 (US1): subscriptions belong to the account, not to this phone.
   *
   * Written at T017 and **never called** until the phone found it on 2026-09-26: the
   * module was green in the suite and the server had zero subscription rows, because
   * nothing in the app ever constructed it. A tested module that no code path reaches is
   * not a feature (Principle I — a green suite is not evidence).
   */
  const subscriptionSync = useMemo<SubscriptionSync>(() => {
    const created = createSubscriptionSync({
      api: graphApi,
      subscriptions: stores.subscriptions,
      isSignedIn: () => stores.auth.get() !== undefined,
    });
    void created.reconcile().catch(() => undefined);
    return created;
  }, [stores, graphApi]);

  // M2 (US1): the download manager. One per app life; recovers interrupted rows at start.
  const downloads = useMemo<DownloadManager>(() => createDownloadManager({
    downloader: createExpoDownloader(),
    network: createExpoNetwork(),
    stores,
    now: () => Date.now(),
    pathFor: downloadPathFor,
  }), [stores]);
  useEffect(() => { void downloads.recover(); }, [downloads]);

  // M2 (research R7): what the queue advance needs. `online` is the last network
  // reading, refreshed on every connectivity change, app-foreground and every 30 s.
  // Each refresh also ticks the download manager: a transfer paused by a network
  // loss resumes when the network is back (gap 6), and a transient failure is
  // retried within 30 s instead of never.
  const online = useRef(true);
  const network = useMemo(() => createExpoNetwork(), []);
  useEffect(() => {
    const refresh = () => {
      void network.kind().then((k) => { online.current = k !== 'none'; });
      void downloads.tick();
    };
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    const unsubscribe = network.onChange?.(refresh);
    const timer = setInterval(refresh, 30_000);
    return () => { sub.remove(); unsubscribe?.(); clearInterval(timer); };
  }, [network, downloads]);

  // M4 (research R3): listening time from TICKs, pushed on the position sync's cadence.
  const listened = useMemo(() => createListened({
    api: graphApi, store: stores.listened, deviceId: () => deviceIdRef.current, isSignedIn: () => stores.auth.get() !== undefined, now: () => Date.now(),
  }), [graphApi, stores]);

  const runtime = useMemo<PlayerRuntime>(() => {
    const adapter = createExpoAudioAdapter();
    // Fire and forget: setAudioModeAsync must happen once, before anything
    // plays. interruptionMode doNotMix is what lock-screen controls need.
    void adapter.configure();
    return createPlayerRuntime({
      adapter,
      stores,
      now: () => Date.now(),
      notify: (text) => show.current(text),
      onTick: (episodeId, positionMs) => listened.onTick(episodeId, positionMs),
      onPositionSaved: (row, reason) => {
        sync.onSaved(row, reason);
        // A stop/seek/background closes the listened interval and pushes with the positions.
        if (IMMEDIATE.has(reason)) { listened.close(); void listened.push(); }
        // FR-019: an episode that has a position has been played — it leaves the inbox.
        stores.inboxState.mark(row.episodeId, 'played', Date.now());
      },
      advance: {
        lookup: (episodeId) => toPlayable(stores, episodeId),
        online: () => online.current,
        onSkipped: (episodeId) => show.current(`Not downloaded — skipped: ${stores.feeds.getEpisode(episodeId)?.title ?? episodeId}`),
      },
    });
  }, [stores, sync, listened]);

  // The 30 s upload timer runs only while playing (FR-025: nothing while paused).
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const reconcileTimer = () => {
      const playing = runtime.getState().kind === 'playing' || runtime.getState().kind === 'buffering';
      if (playing && timer === undefined) timer = setInterval(() => { sync.onTimer(); void listened.push(); }, UPLOAD_EVERY_MS);
      if (!playing && timer !== undefined) { clearInterval(timer); timer = undefined; }
    };
    const unsubscribe = runtime.subscribe(reconcileTimer);
    reconcileTimer();
    return () => { unsubscribe(); if (timer !== undefined) clearInterval(timer); sync.dispose(); };
  }, [runtime, sync, listened]);


  // Cold start (Story 3 / FR-017): put back the episode the listener was on,
  // at its saved position, PAUSED. "Resumes at 14:32" means the position is
  // restored and continues on play, not that audio starts by itself.
  useEffect(() => {
    runtime.restore((episodeId) => toPlayable(stores, episodeId));
  }, [runtime, stores]);

  useEffect(() => () => runtime.dispose(), [runtime]);

  useEffect(() => {
    if (message === undefined) return;
    const timer = setTimeout(() => setMessage(undefined), 6_000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <StoresContext.Provider value={stores}>
      <DownloadsContext.Provider value={downloads}>
      <SyncContext.Provider value={sync}>
      <SubscriptionSyncContext.Provider value={subscriptionSync}>
      <ToastContext.Provider value={show.current}>
        <PlayerProvider runtime={runtime}>
          {props.children}
          {message === undefined ? null : (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}
        </PlayerProvider>
      </ToastContext.Provider>
      </SubscriptionSyncContext.Provider>
      </SyncContext.Provider>
      </DownloadsContext.Provider>
    </StoresContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.separator,
    borderRadius: 8,
    padding: 12,
  },
  toastText: { color: colour.text },
});
