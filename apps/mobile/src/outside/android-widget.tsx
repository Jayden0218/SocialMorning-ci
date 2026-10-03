// Draws the Android home-screen widget with episode and play/pause.
/**
 * M10b US9 — the Android home-screen widget (react-native-android-widget 0.22.1, MIT). It shows
 * the episode, its show, and play/pause. The widget is drawn by the app's JS, so it can only
 * show what a running app knows: with the app gone it says "Open SocialNet", and tapping it
 * opens the app. The name `NowPlaying` must match `app.json`'s widget entry.
 */
import { FlexWidget, TextWidget, requestWidgetUpdate, type WidgetTaskHandler } from 'react-native-android-widget';
import { colour } from '@/design';
import { outsideCard, outsideToggle, type OutsideSink } from './bridge';
import type { NowPlaying } from './now-playing';

export const WIDGET_NAME = 'NowPlaying';
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
        <FlexWidget clickAction="TOGGLE" accessibilityLabel={card.playing ? 'Pause' : 'Play'}
          style={{ height: 48, width: 48, borderRadius: 24, backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center' }}>
          <TextWidget text={card.playing ? '❚❚' : '▶'} style={{ fontSize: 18, color: c.accent }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

/** Registered at start-up (index.ts): draws on add/update/resize, and handles the button. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'TOGGLE') outsideToggle();
  renderWidget(<NowPlayingWidget card={outsideCard()} />);
};

/** The bridge's Android surface. */
export const androidWidgetSink: OutsideSink = {
  show: (card) => { void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <NowPlayingWidget card={card} /> }).catch(() => undefined); },
};
