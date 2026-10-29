// Appeal: the moderation actions against me (a removal or my suspension), each appealable once.
/**
 * M24 US6. Opened from a "was removed" system notice, or from the sign-in screen when the account
 * is suspended. Each card says what happened; one not appealed yet has a box (≤ 1000 characters)
 * and Send. After sending it shows the appeal's state. A suspended listener has no session, so the
 * calls carry the token the suspension answer gave (src/social/appeals-api.ts).
 *
 * M31 W6-B (T071; design-pulse2 shell.html `appeal--screen`, `--nothing-to-appeal`, `--signed-out`, `toast--appeal`): Panel with a
 * paused-curve stage. The curve with a gap (46 bars, 64 tall) 20 under the status bar; the decision cards from 106, 28 in from the
 * left (the edge label "Decisions" in that lane); each card raise, radius 22, padding 16: a mono caps caption, what happened (15), and —
 * not appealed yet — the box (min 110, radius 16, hot border on focus) with a mono counter "74 / 1000". ONE "Send appeal" pill (light, 48) sits
 * in the bottom zone under the title and sends the card whose box has focus (the first open card until one is focused); it is dimmed while
 * the box is empty or a send runs. An appealed card shows its state line with a clock in hot-text. Nothing to appeal: a 96 glowing check
 * tile and the sentence. Signed out: the sentence in a raise card with a lock. Loading: ghost rows. Every action is as before.
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Box } from '@/ui/lib/box';
import { colour, gutter, radius, spacing } from '@/design';
import { drawnType } from '@/design/type-px';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { GapCurve } from '@/ui/kit/GapCurve';
import { Icon } from '@/ui/kit/Icon';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { GlowTile } from '@/ui/me/lists';
import { GhostLines } from '@/ui/settings/hub-parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { APPEAL_TOKEN_KEY } from '@/social/context';
import { ApiError } from '@/social/api';
import { APPEAL_TEXT_MAX, useAppealsApi, type Appealable } from '@/social/appeals-api';
import { appealCaption, appealState } from '@/ui/appeal/lines';
import { APPEAL, below, pausedType } from '@/ui/paused/measures';

const CAPS = { textTransform: 'uppercase' as const };
const SIGN_IN_LINE = 'Sign in to see what you can appeal.';

export default function AppealScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const token = useCallback(() => stores.settings.get(APPEAL_TOKEN_KEY) || undefined, [stores]);
  const api = useAppealsApi(token);
  const [items, setItems] = useState<Appealable[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>(undefined);
  /** The card whose box was last touched; the first open card until then. */
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const load = useCallback(async () => {
    try { setItems(await api.list()); setFailed(undefined); }
    catch (e) { setItems([]); setFailed(e instanceof ApiError && e.code === 'unauthenticated' ? SIGN_IN_LINE : "Couldn't load your appeals. Try again later."); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const send = async (a: Appealable) => {
    const text = (texts[a.actionId] ?? '').trim();
    if (!text) return;
    setBusy(a.actionId);
    try { await api.send(a.actionId, text); toast('Appeal sent.'); await load(); }
    catch (e) { toast(e instanceof ApiError && e.code === 'conflict' ? 'You already appealed this.' : "Couldn't send. Try again."); }
    finally { setBusy(undefined); }
  };
  const open = (items ?? []).filter((a) => !a.appeal);
  const target = open.find((a) => a.actionId === focus) ?? open[0];
  const targetText = target ? (texts[target.actionId] ?? '').trim() : '';
  const signedOut = failed === SIGN_IN_LINE;
  const top = insets?.top ?? 0;
  return (
    <PushedPage
      title="Appeal"
      subtitle="Tell us why we should look again. You can appeal each decision once."
      tone="none"
      {...(target ? {
        below: <PulseButton label="Send appeal" kind="light" icon="arrow-forward" busy={busy === target.actionId} disabled={busy !== undefined || !targetText} full onPress={() => { void send(target); }} />,
        belowHeight: APPEAL.send,
      } : {})}
    >
      {(layout) => (
        <Box className="flex-1">
          {/* The glow is drawn at the drawing's own place for this page (-200, 35 %). */}
          <PageGlow top={APPEAL.glowTop} strength={APPEAL.glowStrength} />
          <Box className="absolute" style={{ left: side, right: side, top: below(layout.top, APPEAL.curveTop) }} accessible={false} importantForAccessibility="no-hide-descendants">
            <GapCurve count={APPEAL.curveCount} height={APPEAL.curveHeight} gapFrom={APPEAL.gapFrom} gapTo={APPEAL.gapTo} />
          </Box>
          <EdgeLabel label="Decisions" top={below(top, APPEAL.edgeTop)} />
          <ScrollView
            className="absolute"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ left: APPEAL.cardsLeft, right: APPEAL.cardsRight, top: below(layout.top, APPEAL.cardsTop), bottom: 0 }}
            contentContainerStyle={{ gap: APPEAL.cardGap, paddingBottom: layout.reserve }}
          >
            {items === undefined ? <Box accessible accessibilityLabel="Loading" accessibilityLiveRegion="polite"><GhostLines /></Box> : null}
            {failed && !signedOut ? <Type step="body" className="text-hotText" style={pausedType.sign16}>{failed}</Type> : null}
            {signedOut ? (
              <Box style={{ marginTop: APPEAL.lockTop }}>
                <Card><Icon name="lock-closed-outline" size={APPEAL.lockIcon} color={colour.hotText} /><Type step="body" className="text-hotText font-medium" style={pausedType.sign16}>{SIGN_IN_LINE}</Type></Card>
              </Box>
            ) : null}
            {items !== undefined && items.length === 0 && !failed ? (
              <Box testID="appeal-nothing" className="items-center text-center" style={{ marginTop: APPEAL.doneTop, gap: APPEAL.doneGap }}>
                <GlowTile icon="checkmark" size={APPEAL.doneTile} rotate={APPEAL.doneTilt} />
                <Type step="title" className="text-text text-center" accessibilityRole="header">Nothing to appeal</Type>
                <Type step="caption" className="text-text2 text-center">No removals or suspensions on your account.</Type>
              </Box>
            ) : null}
            {(items ?? []).map((a) => {
              const state = appealState(a);
              const text = texts[a.actionId] ?? '';
              return (
                <Card key={a.actionId}>
                  <Type step="tag" className="text-text3" style={[drawnType.trackEyebrow, CAPS]}>{appealCaption(a)}</Type>
                  <Type step="body" className="text-text font-medium">{a.what}</Type>
                  {state.sent ? (
                    <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
                      <Icon name="time-outline" size={16} color={colour.hotText} />
                      <Type step="caption" className="text-hotText font-medium">{state.text}</Type>
                    </Box>
                  ) : (
                    <>
                      <Textarea className="bg-raise2 h-auto" style={{ minHeight: APPEAL.boxMin, borderRadius: APPEAL.boxRadius, borderWidth: 1, borderColor: editing === a.actionId ? colour.hot : colour.line }}>
                        <TextareaInput
                          placeholderTextColor={colour.text3}
                          keyboardAppearance="dark"
                          className="align-top text-text font-medium"
                          style={{ padding: APPEAL.boxPad, ...pausedType.box }}
                          placeholder="Why should we look again?"
                          value={text}
                          onFocus={() => { setFocus(a.actionId); setEditing(a.actionId); }}
                          onBlur={() => setEditing((e) => (e === a.actionId ? undefined : e))}
                          onChangeText={(t) => setTexts((x) => ({ ...x, [a.actionId]: t.slice(0, APPEAL_TEXT_MAX) }))}
                          multiline
                          maxLength={APPEAL_TEXT_MAX}
                          accessibilityLabel={`Your appeal: ${a.what}`}
                        />
                      </Textarea>
                      <Box className="flex-row justify-between">
                        <Type step="caption" className="text-text3" style={pausedType.small12}>{state.text}</Type>
                        <Type step="mono" className="text-text3">{`${text.length} / ${APPEAL_TEXT_MAX}`}</Type>
                      </Box>
                    </>
                  )}
                </Card>
              );
            })}
          </ScrollView>
        </Box>
      )}
    </PushedPage>
  );
}

/** A decision card: raise, a line border, radius 22, padding 16, 10 between its lines. */
function Card(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box testID="appeal-card" className="bg-raise border border-line" style={{ borderRadius: radius.artworkLarge, padding: APPEAL.cardPad, gap: APPEAL.cardInner }}>
      {props.children}
    </Box>
  );
}
