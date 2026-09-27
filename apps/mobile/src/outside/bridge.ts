/**
 * M10b US9 — feeds the outside surfaces from the player. It redraws only when what they show
 * changes (episode, play/pause, the best comment) — never on a position TICK, which would
 * wake the widget every second. The best comment is fetched once per episode.
 */
import type { PlayerRuntime } from '../playback/store';
import type { Social } from '../social/api';
import { bestComment, nowPlayingOf, sameCard, type NowPlaying } from './now-playing';

/** One outside surface: the Android widget, the iOS widget, the live activity. */
export type OutsideSink = { show(card: NowPlaying | undefined): void };

export type OutsideBridge = { dispose(): void; current(): NowPlaying | undefined };

export function createOutsideBridge(deps: {
  runtime: Pick<PlayerRuntime, 'getState' | 'subscribe'>;
  lookup: (episodeId: string) => { title: string; show: string } | undefined;
  /** The episode's social answer; failures leave the card without a comment. */
  social?: (episodeId: string) => Promise<Social | undefined>;
  sinks: readonly OutsideSink[];
}): OutsideBridge {
  let last: NowPlaying | undefined;
  const comments = new Map<string, NowPlaying['comment'] | null>();
  let live = true;

  const draw = (): void => {
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
