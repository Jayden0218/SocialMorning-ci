// Draws the Android home-screen widgets: now playing with play/pause, the playlist, the daily pick and this week's listening.
/**
 * M10b US9 — the Android home-screen widget (react-native-android-widget 0.22.1, MIT). It shows
 * the episode, its show, and play/pause. The widget is drawn by the app's JS, so it can only
 * show what a running app knows: with the app gone it says "Open SocialNet", and tapping it
 * opens the app. The name `NowPlaying` must match `app.json`'s widget entry.
 *
 * M20 US4 (FR-011): back 5 min and forward 5 min either side of play/pause, for skipping an
 * intro or an advert without opening the app. Same rules as in the app: back stops at 0,
 * forward past the end finishes the episode.
 *
 * M21 US11 (FR-104, research R9): three more widgets — `Playlist` (the next 3), `DailyPick` and
 * `WeekListening` (names = app.json's entries). They draw from the copies the app saves in the
 * settings table (src/outside/widget-data.ts), so a killed app still shows them: the handler
 * branches on `widgetInfo.widgetName` and reads those copies, opening the database itself when
 * the app is not running.
 */
import { FlexWidget, TextWidget, requestWidgetUpdate, type WidgetTaskHandler } from 'react-native-android-widget';
import { colour } from '@/design';
import type { SettingsStore } from '@/storage/types';
import { outsideCard, outsideSkip, outsideToggle, type OutsideSink } from './bridge';
import type { NowPlaying } from './now-playing';
import { WIDGET_KEYS, listeningLabel, readCopy, weekTotalMs, type DailyPickCopy, type PlaylistCopy, type WeekCopy, type WidgetDataSink } from './widget-data';

export const WIDGET_NAME = 'NowPlaying';
/** M21 US11: must match the `name`s in app.json's widget list. */
export const WIDGET_NAMES = { playlist: 'Playlist', dailyPick: 'DailyPick', week: 'WeekListening' } as const;
type Hex = `#${string}`;
const c = colour as unknown as Record<'background' | 'surface' | 'text' | 'muted' | 'accent', Hex>;

export function NowPlayingWidget(props: { card: NowPlaying | undefined }): React.JSX.Element {
  const card = props.card;
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={card ? `${card.title}, ${card.show}` : 'Open SocialNet'}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.background, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', flexGap: 12 }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 2 }}>
        <TextWidget text={card?.title ?? 'Open SocialNet'} maxLines={2} truncate="END" style={{ fontSize: 15, fontWeight: '600', color: c.text }} />
        <TextWidget text={card?.show ?? 'Nothing playing'} maxLines={1} truncate="END" style={{ fontSize: 12, color: c.muted }} />
        {card?.comment ? <TextWidget text={`“${card.comment.body}” — ${card.comment.author}`} maxLines={2} truncate="END" style={{ fontSize: 12, color: c.text }} /> : null}
      </FlexWidget>
      {card ? (
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
          <FlexWidget clickAction="SKIP_BACK_5" accessibilityLabel="Back 5 minutes"
            style={{ height: 40, width: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
            <TextWidget text="−5m" style={{ fontSize: 12, fontWeight: '600', color: c.text }} />
          </FlexWidget>
          <FlexWidget clickAction="TOGGLE" accessibilityLabel={card.playing ? 'Pause' : 'Play'}
            style={{ height: 48, width: 48, borderRadius: 24, backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center' }}>
            <TextWidget text={card.playing ? '❚❚' : '▶'} style={{ fontSize: 18, color: c.accent }} />
          </FlexWidget>
          <FlexWidget clickAction="SKIP_FWD_5" accessibilityLabel="Forward 5 minutes"
            style={{ height: 40, width: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
            <TextWidget text="+5m" style={{ fontSize: 12, fontWeight: '600', color: c.text }} />
          </FlexWidget>
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

const CARD = { height: 'match_parent', width: 'match_parent', backgroundColor: c.background, borderRadius: 16, padding: 12, flexDirection: 'column', flexGap: 4 } as const;
const EYEBROW = { fontSize: 12, color: c.muted } as const;

export function PlaylistWidget(props: { copy: PlaylistCopy }): React.JSX.Element {
  const items = props.copy.items.slice(0, 3);
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={items.length ? `Up next: ${items.map((e) => e.title).join(', ')}` : 'Your playlist is empty'} style={CARD}>
      <TextWidget text="Up next" style={EYEBROW} />
      {items.length === 0 ? <TextWidget text="Your playlist is empty" style={{ fontSize: 15, fontWeight: '600', color: c.text }} /> : null}
      {items.map((e) => (
        <FlexWidget key={e.episodeId} style={{ flexDirection: 'column' }}>
          <TextWidget text={e.title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '600', color: c.text }} />
          <TextWidget text={e.show} maxLines={1} truncate="END" style={{ fontSize: 11, color: c.muted }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

export function DailyPickWidget(props: { copy: DailyPickCopy }): React.JSX.Element {
  const p = props.copy.pick;
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={p ? `Today's pick: ${p.title}, ${p.show}` : "Open SocialNet for today's pick"} style={CARD}>
      <TextWidget text="Today's pick" style={EYEBROW} />
      <TextWidget text={p ? p.title : "Open SocialNet for today's pick"} maxLines={3} truncate="END" style={{ fontSize: 15, fontWeight: '600', color: c.text }} />
      {p ? <TextWidget text={p.show} maxLines={1} truncate="END" style={{ fontSize: 12, color: c.muted }} /> : null}
      {p?.why ? <TextWidget text={p.why} maxLines={2} truncate="END" style={{ fontSize: 12, color: c.text }} /> : null}
    </FlexWidget>
  );
}

export function WeekListeningWidget(props: { copy: WeekCopy; now: number }): React.JSX.Element {
  const label = listeningLabel(weekTotalMs(props.copy, props.now));
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={`Listening this week: ${label}`} style={CARD}>
      <TextWidget text="Listening this week" style={EYEBROW} />
      <TextWidget text={label} maxLines={1} style={{ fontSize: 22, fontWeight: '700', color: c.text }} />
      <TextWidget text="On this phone, from Monday" style={{ fontSize: 11, color: c.muted }} />
    </FlexWidget>
  );
}

/** The app's own settings store while it runs (providers.tsx); else one opened here, once. */
let liveSettings: Pick<SettingsStore, 'get'> | undefined;
let ownSettings: Pick<SettingsStore, 'get'> | null | undefined;
export function setWidgetSettings(s: Pick<SettingsStore, 'get'> | undefined): void { liveSettings = s; }
function savedSettings(): Pick<SettingsStore, 'get'> | undefined {
  if (liveSettings) return liveSettings;
  if (ownSettings === undefined) {
    try {
      const sql = require('@/storage/sqlite') as typeof import('@/storage/sqlite');
      ownSettings = sql.createSqliteSettingsStore(sql.openDatabase());
    } catch { ownSettings = null; }
  }
  return ownSettings ?? undefined;
}

/** What one of the three new widgets draws, from the saved copies. Undefined = not one of them. */
export function savedWidget(name: string, settings: Pick<SettingsStore, 'get'> | undefined, now: number): React.JSX.Element | undefined {
  const read = <T,>(key: string, fallback: T): T => (settings ? readCopy(settings, key, fallback) : fallback);
  if (name === WIDGET_NAMES.playlist) return <PlaylistWidget copy={read<PlaylistCopy>(WIDGET_KEYS.playlist, { items: [] })} />;
  if (name === WIDGET_NAMES.dailyPick) return <DailyPickWidget copy={read<DailyPickCopy>(WIDGET_KEYS.dailyPick, { pick: null })} />;
  if (name === WIDGET_NAMES.week) return <WeekListeningWidget copy={read<WeekCopy>(WIDGET_KEYS.week, { days: {} })} now={now} />;
  return undefined;
}

/** Registered at start-up (index.ts): draws on add/update/resize, and handles the button. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  // M21 US11: the three new widgets draw from the saved copies (a killed app included).
  if (widgetInfo.widgetName !== WIDGET_NAME) {
    const saved = savedWidget(widgetInfo.widgetName, savedSettings(), Date.now());
    if (saved) renderWidget(saved);
    return;
  }
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'TOGGLE') outsideToggle();
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'SKIP_BACK_5') outsideSkip(-300_000);
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'SKIP_FWD_5') outsideSkip(300_000);
  renderWidget(<NowPlayingWidget card={outsideCard()} />);
};

/** The bridge's Android surface. */
export const androidWidgetSink: OutsideSink = {
  show: (card) => { void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <NowPlayingWidget card={card} /> }).catch(() => undefined); },
};

/** M21 US11: the three new widgets, redrawn when the app saves a changed copy. */
export const androidWidgetDataSink: WidgetDataSink = {
  playlist: (copy) => { void requestWidgetUpdate({ widgetName: WIDGET_NAMES.playlist, renderWidget: () => <PlaylistWidget copy={copy} /> }).catch(() => undefined); },
  dailyPick: (copy) => { void requestWidgetUpdate({ widgetName: WIDGET_NAMES.dailyPick, renderWidget: () => <DailyPickWidget copy={copy} /> }).catch(() => undefined); },
  week: (copy) => { void requestWidgetUpdate({ widgetName: WIDGET_NAMES.week, renderWidget: () => <WeekListeningWidget copy={copy} now={Date.now()} /> }).catch(() => undefined); },
};
