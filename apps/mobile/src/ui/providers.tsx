/**
 * The three things every screen needs: the stores, the player, and a way to
 * say something went wrong.
 *
 * This is the only place that opens the database and builds the audio
 * adapter, and it does both exactly once for the app's life.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Linking } from 'react-native';
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
import { createLibrarySync, type LibrarySync } from '../sync/library';
import { createRecOutbox } from '../recs/outbox';
import { createListened } from '../graph/listened';
import { deviceId } from '../sync/device-id';
import { createDownloadManager, type DownloadManager } from '../downloads/manager';
import { createExpoDownloader, downloadPathFor } from '../downloads/expo-downloader';
import { createExpoNetwork } from '../downloads/expo-network';
import { waitForStartup } from './startup';
import { onNotificationTap } from '../notify/expo';
import { canStream } from '../settings/playback';
import { createOutsideBridge, setOutsideToggle } from '../outside/bridge';
import { platformSinks } from '../outside/sinks';
import { applyAppearance } from '../design/theme';
import { applyAccent, readAccent } from '../design/accent';
import { readAppearance } from './useColours';
import * as SplashScreen from 'expo-splash-screen';
import { Terms } from './Terms';
import { ToastHost } from './ToastHost';
import { accept, hasAccepted } from './terms';
import { ALWAYS_SHOW_TERMS, HANDOFF_MAX_MS, coverLaunch, keepTerms, opensSignIn, signInPage } from './launch';
import { router, usePathname } from 'expo-router';
import { LaunchScreen } from './LaunchScreen';
import { createLaunchApi } from '../launch/api';
import { knownRoute, resolveTarget } from '../launch/choose';
import { decideLaunch, recordShown } from '../launch/decide';
import { createLaunchFiles } from '../launch/launch-files';
import { syncLaunch } from '../launch/sync';

const StoresContext = createContext<Stores | undefined>(undefined);
const ToastContext = createContext<((message: string) => void) | undefined>(undefined);
const SyncContext = createContext<PositionSync | undefined>(undefined);
const SubscriptionSyncContext = createContext<SubscriptionSync | undefined>(undefined);
const DownloadsContext = createContext<DownloadManager | undefined>(undefined);
const LibrarySyncContext = createContext<LibrarySync | undefined>(undefined);

/** M10b US2: favourites, moments, searches and favourite comments follow the account. */
export function useLibrarySync(): LibrarySync {
  const v = useContext(LibrarySyncContext);
  if (v === undefined) throw new Error('useLibrarySync must be used inside <AppProviders>');
  return v;
}

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
  // The launch screen waits on these (owner, 2026-09-27): the account's positions and
  // subscriptions, and the download recovery. See `./startup`.
  const startupTasks = useRef<Promise<unknown>[]>([]);
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
    startupTasks.current.push(deviceId().then((v) => { id = v; deviceIdRef.current = v; return created.reconcile(); }));
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
    startupTasks.current.push(created.reconcile().catch(() => undefined));
    return created;
  }, [stores, graphApi]);

  // M10b US2: the library change log uploads on every change, at launch, and at sign-in
  // (the social context calls `reconcile` from onSignedIn).
  const librarySync = useMemo<LibrarySync>(() => {
    const created = createLibrarySync({
      put: (items) => graphApi.libraryPut(items),
      settings: stores.settings,
      isSignedIn: () => stores.auth.get() !== undefined,
    });
    startupTasks.current.push(created.reconcile().catch(() => undefined));
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
  // M10b US4: the Appearance choice is applied at start (a no-op on main until M9 wires it).
  useEffect(() => { applyAppearance(readAppearance(stores.settings)); applyAccent(readAccent(stores.settings)); }, [stores]);
  // M10b US3 (FR-011): tapping a notification opens its episode.
  useEffect(() => onNotificationTap((episodeId) => router.push({ pathname: '/episode/[id]', params: { id: episodeId } })), []);
  const [ready, setReady] = useState(false);
  // M15 US3: the owner's promotion. Decided ONCE, here, synchronously, from the settings
  // store and the files already on disk — no network call can delay start-up (SC-004,
  // guard G-L4). Never when signed out, when the Terms are due, or in minor mode.
  const launchFiles = useMemo(() => createLaunchFiles(), []);
  const launchApi = useMemo(() => createLaunchApi({ baseUrl: apiBaseUrl(), fetch }), []);
  const [launchPick, setLaunchPick] = useState(() => decideLaunch({
    settings: stores.settings,
    files: launchFiles,
    now: Date.now(),
    signedIn: stores.auth.get() !== undefined,
    termsDue: ALWAYS_SHOW_TERMS || !hasAccepted(stores.settings),
    random: Math.random,
  }));
  // The list and images for the NEXT launch: after start-up is ready, fire and forget.
  useEffect(() => {
    if (!ready) return;
    void syncLaunch({ api: launchApi, files: launchFiles, settings: stores.settings });
  }, [ready, launchApi, launchFiles, stores]);
  // After the launch screen, the Terms — until accepted, nothing else is reachable.
  const [accepted, setAccepted] = useState(() => !ALWAYS_SHOW_TERMS && hasAccepted(stores.settings));
  // Then the sign-in page, on every launch while signed out (see `./launch`).
  const signInOpened = useRef(false);
  const wantSignIn = opensSignIn({ ready, accepted, signedIn: stores.auth.get() !== undefined, opened: signInOpened.current });
  // Owner, 2026-09-27: Accept goes straight to the sign-in page, with no glimpse of the
  // home page first. Something stays over the app from the render that decides to open it
  // (`wantSignIn`) until the page is on top and whole (`handoff`); the page does not slide.
  // Owner, 2026-09-29: that something is never a second splash — see `keepTerms`.
  const pathname = usePathname();
  const whole = useSyncExternalStore(signInPage.subscribe, signInPage.isWhole);
  const [handoff, setHandoff] = useState(false);
  useEffect(() => {
    if (!wantSignIn) return;
    signInOpened.current = true;
    setHandoff(true);
    router.push('/auth/sign-in');
  }, [wantSignIn]);
  useEffect(() => {
    if (!handoff) return;
    if (pathname === '/auth/sign-in' && whole) { setHandoff(false); return; }
    // Never trap the app behind the cover if the page does not arrive.
    const t = setTimeout(() => setHandoff(false), HANDOFF_MAX_MS);
    return () => clearTimeout(t);
  }, [handoff, pathname, whole]);
  // The native launch screen stays up (app/_layout.tsx stops its auto-hide) until the app
  // under it is finished — no white frame while the first screen draws (owner, 2026-09-29).
  const cover = coverLaunch({ ready, wantSignIn, handoff });
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    if (launched || cover) return;
    setLaunched(true);
    // One frame, so what replaces it is already drawn.
    requestAnimationFrame(() => SplashScreen.hide());
  }, [launched, cover]);
  useEffect(() => {
    let live = true;
    void waitForStartup([...startupTasks.current, downloads.recover()]).then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [downloads]);

  // M2 (research R7): what the queue advance needs. `online` is the last network
  // reading, refreshed on every connectivity change, app-foreground and every 30 s.
  // Each refresh also ticks the download manager: a transfer paused by a network
  // loss resumes when the network is back (gap 6), and a transient failure is
  // retried within 30 s instead of never.
  const online = useRef(true);
  // M10b US4: the last network kind, for "Allow mobile data for playback".
  const netKind = useRef<string>('wifi');
  const network = useMemo(() => createExpoNetwork(), []);
  useEffect(() => {
    const refresh = () => {
      void network.kind().then((k) => { online.current = k !== 'none'; netKind.current = k; });
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
      mayStream: () => canStream(stores.settings, netKind.current),
      advance: {
        lookup: (episodeId) => toPlayable(stores, episodeId),
        online: () => online.current,
        onSkipped: (episodeId) => show.current(`Not downloaded — skipped: ${stores.feeds.getEpisode(episodeId)?.title ?? episodeId}`),
      },
    });
  }, [stores, sync, listened]);

  /**
   * M8 (US6, FR-028): a **play** and a **finish** are recorded here, not on the screen
   * that showed the recommendation.
   *
   * L7 found the gap on 2026-09-26: impressions and opens reached the database and
   * `played` stayed at 0 for ever, because the outbox's method existed and nothing called
   * it. Guard G-W1 could not see it — the factory *is* constructed; it was the method that
   * was unreachable. The player knows the episode; the outbox knows which channel put it
   * on screen; this is where the two are joined.
   */
  const recOutbox = useMemo(
    () => createRecOutbox({ api: graphApi, store: stores.recOutbox, settings: stores.settings, isSignedIn: () => stores.auth.get() !== undefined }),
    [graphApi, stores],
  );
  useEffect(() => {
    let lastPlaying: string | undefined;
    let lastEnded: string | undefined;
    const onChange = (): void => {
      const st = runtime.getState();
      if (st.kind === 'playing' && st.episodeId !== lastPlaying) {
        lastPlaying = st.episodeId;
        recOutbox.playedIfShown(st.episodeId, Date.now());
        void recOutbox.flush();
      }
      if (st.kind === 'ended' && st.episodeId !== lastEnded) {
        lastEnded = st.episodeId;
        recOutbox.finishedIfShown(st.episodeId, Date.now());
        void recOutbox.flush();
      }
    };
    const unsubscribe = runtime.subscribe(onChange);
    onChange();
    return () => unsubscribe();
  }, [runtime, recOutbox]);

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

  // M10b US9: the widgets and the lock-screen live activity follow the player; the widget's
  // button toggles it while the app is alive.
  useEffect(() => {
    const bridge = createOutsideBridge({
      runtime,
      lookup: (id) => {
        const e = stores.feeds.getEpisode(id);
        return e ? { title: e.title, show: stores.feeds.getShow(e.feedUrl)?.title ?? '' } : undefined;
      },
      social: async (id) => { const r = await graphApi.social(id); return r.status === 200 ? r.body : undefined; },
      sinks: platformSinks(),
    });
    setOutsideToggle(() => { const k = runtime.getState().kind; if (k === 'playing' || k === 'buffering') runtime.pause(); else runtime.play(); });
    return () => { setOutsideToggle(undefined); bridge.dispose(); };
  }, [runtime, stores, graphApi]);

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
      <LibrarySyncContext.Provider value={librarySync}>
      <ToastContext.Provider value={show.current}>
        <PlayerProvider runtime={runtime}>
          {props.children}
          {launchPick ? (
            <LaunchScreen
              promotion={launchPick.promotion}
              uri={launchPick.uri}
              started={launched}
              onShown={() => {
                recordShown(stores.settings, launchPick.promotion.id, Date.now());
                void launchApi.event(launchPick.promotion.id, 'impression').catch(() => undefined);
              }}
              onTap={() => {
                void launchApi.event(launchPick.promotion.id, 'tap').catch(() => undefined);
                const to = resolveTarget(launchPick.promotion, (path) => knownRoute(path));
                if (to.kind === 'url') void Linking.openURL(to.url).catch(() => undefined);
                else if (to.path !== '/') router.push(to.path as never);
              }}
              onDone={() => setLaunchPick(undefined)}
            />
          ) : null}
          {keepTerms({ ready, accepted, launched, cover }) ? <Terms onAccept={() => { accept(stores.settings); setAccepted(true); }} /> : null}
          {/* M16a T015: the toast host — spoken on iOS too, and drawn above native modals. */}
          <ToastHost message={message} />
        </PlayerProvider>
      </ToastContext.Provider>
      </LibrarySyncContext.Provider>
      </SubscriptionSyncContext.Provider>
      </SyncContext.Provider>
      </DownloadsContext.Provider>
    </StoresContext.Provider>
  );
}
