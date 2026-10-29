// Send feedback with type, text and up to 3 images; see what you sent.
/**
 * Send feedback (M10; images and direct delivery M10b US6): choose a kind, write it, add up to
 * 3 images, send. It goes straight to the owner's /mod page; if the server cannot be reached,
 * the email app is offered instead (without the images). "My feedback" lists what you sent.
 *
 * M17 T087 (`SettingsFeedback-B`): the two tabs became one link on the right of the back row
 * ("My feedback" with a count, or "Write feedback" back); the title names the open side under a
 * "Help and feedback" line. The kinds are a scrolling row of pills (radios, the chosen one dark);
 * the text box is a white card that writes in the serif; "n of 3 images" under it; and a white
 * bar at the bottom holds the image tiles (tap to remove, the × marks it), the dashed add tile
 * and the yellow Send. "My feedback" is a list of white cards. Same handlers throughout.
 *
 * M31 S-A (T060; design-pulse2 `settings-feedback--screen`, `--signed-out`, `--mine-empty`, `toast--settings-feedback`, `--email-fallback`, `--photo-permission`, `--photo-picker`; Panel):
 * "It is about" — the five kinds as 36 chips, the chosen one light; "Your feedback" — a text area of at least 150 (radius 22, raise) with "0 of 3 images" in mono 12 under it when
 * signed in; "Include recent errors" (only when the phone has recorded some) as a row with a switch. The title bar carries "Write feedback", the subtitle "Help and feedback" and, above
 * it, the **My feedback** chip with its count in a hot badge, which switches the view (the chip then says **Write feedback**). The page's bottom zone is the composer row: the picked
 * images as 52 tiles (✕ removes), the add-image square, and **Send** (light 52), enabled with a kind and 5+ characters. Sent items are tiles ("Kind · date" in mono, then up to 4
 * lines); none yet is the flat-curve empty state. The photo permission, the picker, the Mail app and the toasts are the phone's own or the toast host's.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { Image } from '@/ui/lib/image';
import Constants from 'expo-constants';
import { useState } from 'react';
import { openSystem } from '@/ui/kit/openLink';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { pickImages, type PickedImage } from '@/settings/feedback-images';
import { FEEDBACK_KINDS, type FeedbackKind } from '@/settings/faq';
import { FEEDBACK_MAX, feedbackMailto, listFeedback, rememberFeedback, errorLines, withErrors, type SentFeedback } from '@/settings/feedback';
import { recentErrors } from '@/telemetry/reportError';
import { Toggle } from '@/ui/kit/Toggle';
import { plural } from '@socialmorning/social-core';
import { APPEALS_KEY, refreshAppeals } from '@/social/links';
import { useSocial } from '@/social/context';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { shortDate } from '@/ui/kit/format';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { KeyboardPage, PageEmpty } from '@/ui/me/lists';
import { useStores, useToast } from '@/ui/shell/providers';
import { Sec, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const TILE = 52;
/** "My feedback" empty: 200 down, as drawn. */
const EMPTY_TOP = 200;
/** The chip above the title is 36 tall; the title bar puts 8 under it (10 drawn). */
const CHIP_ABOVE = 44;

export default function FeedbackScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const stores = useStores();
  const toast = useToast();
  const [tab, setTab] = useState<'write' | 'mine'>('write');
  const [kind, setKind] = useState<FeedbackKind | undefined>();
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<SentFeedback[]>(() => listFeedback(stores.settings));
  // M23 US9: the saved address at once, the server's once it answers (cancelled on unmount).
  const [fresh] = useLoad(() => refreshAppeals(api, stores).then((addr) => ({ addr })), [api, stores], 'feedback.appeals');
  const to = fresh.kind === 'ok' ? fresh.addr : stores.settings.get(APPEALS_KEY) || undefined;
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  // M23 US8: the phone's last errors go with the message only when the listener says so (off at first).
  const errorCount = recentErrors(20).length;
  const [includeErrors, setIncludeErrors] = useState(false);
  const ready = kind !== undefined && body.trim().length >= 5 && !busy;
  const addImages = () => {
    void pickImages(3 - images.length).then((r) => {
      if (r.kind === 'denied') toast('Allow photo access for SocialNet in your phone’s Settings to add images.');
      else if (r.kind === 'ok') setImages((cur) => [...cur, ...r.images].slice(0, 3));
      else if (r.kind === 'too-big') { setImages((cur) => [...cur, ...r.kept].slice(0, 3)); toast('One image was too large even after shrinking, and was left out.'); }
    }, () => toast('Could not open your photos.'));
  };

  const done = (k: FeedbackKind) => {
    rememberFeedback(stores.settings, k, body, Date.now());
    setSent(listFeedback(stores.settings));
    setBody('');
    setKind(undefined);
    setImages([]);
  };
  const send = () => {
    if (!ready || !kind) return;
    const k = kind;
    const version = Constants.expoConfig?.version ?? '?';
    setBusy(true);
    // M23 US8: the errors go in the route's own `errors` field; the email fallback writes them under the text.
    const errors = includeErrors ? recentErrors(20) : [];
    const text = withErrors(body, errors);
    api.sendFeedback({
      kind: k, body: body.trim(), appVersion: version,
      ...(listener ? { images: images.map((i) => ({ mime: 'image/jpeg' as const, base64: i.base64 })) } : {}),
      ...(errors.length > 0 ? { errors: errorLines(errors) } : {}),
    })
      .then(() => { done(k); toast('Sent. Thank you.'); })
      .catch(() => {
        // Offline or refused: the email app still works (without the images).
        if (!to) { toast('Could not send — check your connection.'); return; }
        void openSystem(feedbackMailto(to, k, text, version)).then((ok) => { if (ok) { done(k); toast('Opened your email app — send the message from there.'); } else toast('Could not send — check your connection.'); }, () => toast('Could not send — check your connection.'));
      })
      .finally(() => setBusy(false));
  };

  const other = tab === 'write' ? 'mine' : 'write';
  // The chip above the title: the other view's name, with the count of what was sent on "My feedback".
  const chip = (
    <Box className="flex-row justify-end">
      {([other] as const).map((t) => (
        <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="button" {...(t === 'mine' ? { accessibilityHint: `${sent.length} sent` } : {})} accessibilityLabel={t === 'write' ? 'Write feedback' : 'My feedback'} hitSlop={6} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: 36, paddingHorizontal: 14, gap: 6 }}>
          <Type step="caption" className="text-text font-semibold">{t === 'write' ? 'Write feedback' : 'My feedback'}</Type>
          {t === 'mine' && sent.length > 0 ? (
            <Box className="bg-hot items-center justify-center" style={{ minWidth: 20, height: 20, borderRadius: 9, paddingHorizontal: 6 }}>
              <Type step="tag" className="text-void font-semibold">{String(sent.length)}</Type>
            </Box>
          ) : null}
        </Pressable>
      ))}
    </Box>
  );
  const foot = tab === 'write' ? (
    <Box className="flex-row items-center" style={{ gap: SET.tileGap }}>
      {images.map((img, i) => (
        <Pressable key={img.uri + i} onPress={() => setImages((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove image ${i + 1}`} style={{ width: TILE, height: TILE }}>
          <Image source={{ uri: img.uri }} className="bg-raise" style={{ width: TILE, height: TILE, borderRadius: 16 }} />
          <Box className="absolute bg-text items-center justify-center" style={{ top: -6, right: -6, width: 20, height: 20, borderRadius: 10 }} accessible={false}>
            <Icon name="close" size={12} color={colour.void} />
          </Box>
        </Pressable>
      ))}
      {/* M23: pictures need sign-in (the server answers 401 without one). */}
      {listener && images.length < 3 ? (
        <Pressable onPress={addImages} accessibilityRole="button" accessibilityLabel="Add an image" className="bg-raise items-center justify-center" style={{ width: TILE, height: TILE, borderRadius: 16 }}>
          <Icon name="image-outline" size={22} color={colour.text} />
        </Pressable>
      ) : null}
      <Box className="flex-1" />
      <PulseButton label="Send" onPress={send} disabled={!ready} busy={busy} height={TILE} padX={34} />
    </Box>
  ) : undefined;
  return (
    <KeyboardPage>
      <PushedPage title={tab === 'write' ? 'Write feedback' : 'My feedback'} subtitle="Help and feedback" size={28} extra={chip} extraAbove={CHIP_ABOVE} {...(foot ? { below: foot, belowHeight: TILE } : {})}>
        {(layout) => (
          <SetPage layout={layout}>
            {tab === 'write' ? (
              <>
                <Sec label="About">
                  <Box className="flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Kind of feedback">
                    {FEEDBACK_KINDS.map((k) => (
                      <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} accessibilityLabel={k} hitSlop={6} className={`rounded-pill items-center justify-center border ${kind === k ? 'bg-text border-text' : 'bg-raise border-line'}`} style={{ height: 36, paddingHorizontal: 14 }}>
                        <Type step="caption" className={kind === k ? 'text-void font-semibold' : 'text-text font-semibold'}>{k}</Type>
                      </Pressable>
                    ))}
                  </Box>
                </Sec>
                <Sec label="Write">
                  <Box style={{ gap: 8 }}>
                    <Box className="bg-raise" style={{ minHeight: 150, borderRadius: SET.radius, padding: SET.tilePad }}>
                      <Textarea className="border-0 bg-transparent h-auto w-auto min-h-0">
                        <TextareaInput value={body} onChangeText={setBody} maxLength={FEEDBACK_MAX} multiline placeholder="Write here…" placeholderTextColor={colour.text3} textAlignVertical="top" accessibilityLabel="Your feedback" className="text-text" style={[SET_TYPE.lede15, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                      </Textarea>
                    </Box>
                    {listener ? <Type step="mono" className="text-text2" style={SET_TYPE.mono12}>{`${images.length} of 3 images`}</Type> : null}
                  </Box>
                </Sec>
                {errorCount > 0 ? (
                  <Sec label="Extra">
                    <PanelGroup>
                      <SetRow label="Include recent errors" line={`The last ${plural(errorCount, 'error')} this phone saw: where, what and the app version. Nothing personal.`} right={<Toggle value={includeErrors} onChange={setIncludeErrors} label="Include recent errors" />} />
                    </PanelGroup>
                  </Sec>
                ) : null}
              </>
            ) : sent.length === 0 ? (
              <>
                <Box style={{ height: EMPTY_TOP }} />
                <PageEmpty top={0} title="Nothing sent yet" line="What you send is listed here, newest first." />
              </>
            ) : (
              <Box style={{ gap: SET.gap }}>
                {sent.map((item) => (
                  <SetCard key={String(item.at)} testID="sent-card" gap={4}>
                    <Type step="mono" className="text-text2" style={SET_TYPE.mono12}>{`${item.kind} · ${shortDate(item.at)}`}</Type>
                    <Type step="body" className="text-text" numberOfLines={4}>{item.body}</Type>
                  </SetCard>
                ))}
              </Box>
            )}
          </SetPage>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
