/**
 * M10b US9 — the iPhone surfaces. The widget (`targets/widget`, SwiftUI) reads the card from
 * the shared App Group through @bacons/apple-targets' `ExtensionStorage`; the lock screen's
 * live activity comes from expo-live-activity (iOS 16.2+). Both packages are iOS-only.
 */
import type { OutsideSink } from './bridge';

/** Must match `app.json` → `ios.entitlements` and `targets/widget/expo-target.config.js`. */
export const APP_GROUP = 'group.app.socialmorning.mobile';
export const CARD_KEY = 'nowPlaying';

type Storage = { set(key: string, value: Record<string, string | number> | undefined): void };
type Targets = { ExtensionStorage: (new (group: string) => Storage) & { reloadWidget(name?: string): void } };
type Live = {
  startActivity(state: { title: string; subtitle?: string; progressBar: Record<string, never> }, config?: { deepLinkUrl?: string }): string | undefined;
  updateActivity(id: string, state: { title: string; subtitle?: string; progressBar: Record<string, never> }): void;
  stopActivity(id: string, state: { title: string; subtitle?: string; progressBar: Record<string, never> }): void;
};

/** The widget: the card as flat strings, then a timeline reload. */
export function iosWidgetSink(targets: Targets): OutsideSink {
  const storage = new targets.ExtensionStorage(APP_GROUP);
  return {
    show: (card) => {
      storage.set(CARD_KEY, card ? {
        episodeId: card.episodeId, title: card.title, show: card.show, playing: card.playing ? 1 : 0,
        comment: card.comment ? `“${card.comment.body}” — ${card.comment.author}` : '',
      } : undefined);
      targets.ExtensionStorage.reloadWidget();
    },
  };
}

/** The lock screen: started on play, updated on change, stopped when nothing is loaded. */
export function liveActivitySink(live: Live): OutsideSink {
  let id: string | undefined;
  return {
    show: (card) => {
      if (!card) { if (id) live.stopActivity(id, { title: 'SocialNet', progressBar: {} }); id = undefined; return; }
      const state = { title: card.title, subtitle: card.comment ? `“${card.comment.body}” — ${card.comment.author}` : card.show, progressBar: {} as Record<string, never> };
      if (id) live.updateActivity(id, state);
      else if (card.playing) id = live.startActivity(state, { deepLinkUrl: '/player' });
    },
  };
}
