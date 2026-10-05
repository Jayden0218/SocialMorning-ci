// Sends player changes to the widgets, and the nearby comment to the lock screen, only when they change.
/**
 * M10b US9 — feeds the outside surfaces from the player. It redraws only when what they show
 * changes (episode, play/pause, the best comment) — never on a position TICK, which would
 * wake the widget every second. The best comment is fetched once per episode.
 *
 * M20 US2 (research R2): the same fetched answer also gives the lock screen its comment line —
 * the comment near the listener (`commentNear`), at most every 15 s, through the reducer's
 * LOCK_LINE event so the lock screen keeps one path (T122 of M12, built here).
 */
import type { PlayerRuntime } from '@/playback/store';
import type { Social } from '@/social/api';
import { bestComment, commentNear, lockLineOf, nowPlayingOf, sameCard, type NowPlaying } from './now-playing';

/** M20 US2: the lock-screen line is worked out at most this often while playing. */
export const LOCK_LINE_EVERY_MS = 15_000;

/** One outside surface: the Android widget, the iOS widget, the live activity. */
export type OutsideSink = { show(card: NowPlaying | undefined): void };

export type OutsideBridge = { dispose(): void; current(): NowPlaying | undefined };

export function createOutsideBridge(deps: {
  runtime: Pick<PlayerRuntime, 'getState' | 'subscribe'>;
  lookup: (episodeId: string) => { title: string; show: string } | undefined;
  /** The episode's social answer; failures leave the card without a comment. */
  social?: (episodeId: string) => Promise<Social | undefined>;
  sinks: readonly OutsideSink[];
  /** M20 US2: sets the lock-screen comment line (`runtime.lockLine`). Absent = no line. */
  lockLine?: (text: string | null) => void;
  /** M20 US2 (FR-005): "Comments on lock screen" — read on every check, so a change applies at once. */
  lockComments?: () => boolean;
  now?: () => number;
}): OutsideBridge {
  let last: NowPlaying | undefined;
  const comments = new Map<string, NowPlaying['comment'] | null>();
  const socials = new Map<string, Social>();
  let live = true;
  const now = deps.now ?? Date.now;
  let line: { episodeId: string; text: string | null; at: number } | undefined;

  // M20 US2: the comment near the listener, under the title on the lock screen. Checked on the
  // player's own TICKs, at most every 15 s; the reducer redraws only when the text changes.
  const updateLine = (): void => {
    if (!deps.lockLine) return;
    const st = deps.runtime.getState();
    // Every LOAD passes through `loading` and resets the reducer's line, so forget ours too.
    if (st.kind === 'loading' || st.kind === 'idle' || st.kind === 'ended') { line = undefined; return; }
    if (st.kind !== 'playing' && st.kind !== 'buffering') return;
    const fresh = line === undefined || line.episodeId !== st.episodeId;
    if (!fresh && now() - line!.at < LOCK_LINE_EVERY_MS) return;
    const on = deps.lockComments ? deps.lockComments() : true;
    const social = socials.get(st.episodeId);
    const near = on && social ? commentNear(social, st.positionMs) : undefined;
    const text = near ? lockLineOf(near) : null;
    // A new episode starts with no line (LOAD resets it), so only a real line needs sending.
    const changed = fresh ? text !== null : text !== line!.text;
    line = { episodeId: st.episodeId, text, at: now() };
    if (changed) deps.lockLine(text);
  };

  const draw = (): void => {
    updateLine();
    const base = nowPlayingOf(deps.runtime.getState(), deps.lookup);
    const known = base ? comments.get(base.episodeId) : undefined;
    const card = base && known ? { ...base, comment: known } : base;
    if (sameCard(card, last)) return;
    last = card;
    latest = card;
    for (const s of deps.sinks) { try { s.show(card); } catch { /* one surface failing never stops the others */ } }
    if (base && !comments.has(base.episodeId) && deps.social) {
      comments.set(base.episodeId, null);
      const id = base.episodeId;
      void deps.social(id).then((s) => {
        if (s && live) { socials.set(id, s); if (line?.episodeId === id) line = { ...line, at: -Infinity }; }
        const c = s ? bestComment(s) : undefined;
        if (c && live) { comments.set(id, c); draw(); }
      }, () => undefined);
    }
  };

  const unsubscribe = deps.runtime.subscribe(draw);
  draw();
  return {
    current: () => last,
    dispose: () => { live = false; unsubscribe(); },
  };
}

/** The last card drawn, for a widget that asks while the app is alive (a resize, a re-add). */
let latest: NowPlaying | undefined;
export function outsideCard(): NowPlaying | undefined { return latest; }

/** The widget's play/pause, set by the running app; a widget tap with no app alive does nothing. */
let toggleHandler: (() => void) | undefined;
export function setOutsideToggle(fn: (() => void) | undefined): void { toggleHandler = fn; }
export function outsideToggle(): boolean { if (!toggleHandler) return false; toggleHandler(); return true; }

/** M20 US4: the widget's back / forward 5 min, set by the running app (`runtime.skip`). */
let skipHandler: ((deltaMs: -300_000 | 300_000) => void) | undefined;
export function setOutsideSkip(fn: ((deltaMs: -300_000 | 300_000) => void) | undefined): void { skipHandler = fn; }
export function outsideSkip(deltaMs: -300_000 | 300_000): boolean { if (!skipHandler) return false; skipHandler(deltaMs); return true; }
