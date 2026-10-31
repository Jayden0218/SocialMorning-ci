// Privacy: private listening, what others see of you (4 switches), muted users, and blocked listeners.
/**
 * Privacy (隐私设置, M10). "Keep my listening private" is M4's switch (it was on Account):
 * your listens, listening time and recently played are hidden from others; comments and
 * clips stay public. Blocked listeners are managed from here.
 *
 * M17 T093 (`SettingsPrivacy-B`): the switch is a card — icon, serif title, the line, then a
 * row that says the current state beside the app's own toggle; "Always public" chips under it;
 * Blocked listeners is a card with the count as a serif figure. Same API call and link.
 *
 * M21 US10 (T110): a "What others see" card with four switches — hide my listening badge, hide
 * my sticker library, hide my profile decorations, keep my subscriptions private — each sent
 * alone as PATCH /v1/me (`hideBadge`, `hideStickers`, `hideDecorations`, `privateSubscriptions`,
 * the server fields US8 adds), put back if the server refuses. Then "Muted users" (US6): the
 * listeners you muted, each with Unmute (GET /v1/me/mutes, DELETE /v1/me/mutes/:id).
 * M22 US3: then "Muted threads" (src/ui/social/MutedThreads.tsx).
 * M25 SB: then "Download my data" (an emailed 24-hour link to a JSON copy; once a day).
 *
 * M31 S-B (T060 part 2; design-pulse2 `settings-privacy--screen`, `--signed-out`, `--muted-empty`, `--muted-loading`, `--muted-error`,
 * `toast--settings-privacy`, `toast--often-listened-switch`, `toast--muted-threads`; layout Panel): under LISTENING the hero tile —
 * the eye 28 in hot-text, "Keep my listening private" in Unbounded 19, its line, a rule, then the state in mono 13 beside the switch —
 * and the "Always public:" chips (Comments, Clips); under OTHERS SEE one group of five rows (the four switches and Hide "Often listened",
 * lines kept); MUTED USERS (avatar 36, name, a quiet Unmute pill; Loading… with two ghost rows, the alert line, or the empty sentence
 * inside the same tile); THREADS (the Muted threads group, unchanged); MY DATA (the download icon, "Download my data" in Unbounded 17, the
 * line and a quiet "Email me a link" — "Asking…" while busy); BLOCKED (one row at the foot with the count in mono). Signed out shows
 * only the hero's sign-in sentence, the chips and Blocked. Same API calls, toasts and names; the title is low in the bottom bar.
 * Not as drawn: the count is the phone's own block list (blocks are kept on the phone), shown whenever signed in.
 */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { Avatar } from '@/ui/kit/Avatar';
import { InfoGhost } from '@/ui/show/InfoGroup';
import { PanelGroup } from '@/ui/me/Panel';
import { privacySwitchesOf, useProfileApi, type PrivacySwitches } from '@/social/profile-api';
import { useCommentExtrasApi, type MutedListener } from '@/social/comment-extras-api';
import { MutedThreads } from '@/ui/social/MutedThreads';
import { OftenListenedSwitch } from '@/ui/settings/OftenListenedSwitch';
import { useAccountApi } from '@/social/account-api';
import { ApiError } from '@/social/api';
import { LinkRow, QuietPill, Section, SettingsPage, SwitchRow, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';

type SwitchName = keyof PrivacySwitches;
/** M21 US10: the four "What others see" switches, in the order they are drawn. */
const SWITCHES: readonly { name: SwitchName; label: string; line: string }[] = [
  { name: 'hideBadge', label: 'Hide my listening badge', line: 'The 100h+ / 500h+ / 1000h+ pill beside your comments' },
  { name: 'hideStickers', label: 'Hide my sticker library', line: 'Others cannot open the stickers you collected' },
  { name: 'hideDecorations', label: 'Hide my profile decorations', line: 'Stickers you placed on your profile header' },
  { name: 'privateSubscriptions', label: 'Keep my subscriptions private', line: 'Your profile does not list the shows you follow' },
];

/** M21 US10: the four switches, read from GET /v1/me and each saved alone; the fifth row is "Often listened". */
function WhatOthersSee(): React.ReactElement {
  const profile = useProfileApi();
  const toast = useToast();
  const [values, setValues] = useState<Required<PrivacySwitches> | undefined>();
  useEffect(() => {
    let live = true;
    profile.me().then((l) => { if (live) setValues(privacySwitchesOf(l)); }).catch(() => undefined);
    return () => { live = false; };
  }, [profile]);
  const change = (name: SwitchName, v: boolean) => {
    setValues((s) => (s ? { ...s, [name]: v } : s));
    const patch: PrivacySwitches = {};
    patch[name] = v;
    profile.update(patch).catch(() => {
      setValues((s) => (s ? { ...s, [name]: !v } : s));
      toast("Couldn't save that — try again when you're online.");
    });
  };
  return (
    <PanelGroup>
      {SWITCHES.map((sw) => (
        <SwitchRow key={sw.name} label={sw.label} line={sw.line} value={values?.[sw.name] ?? false} onChange={(v) => change(sw.name, v)} disabled={values === undefined} />
      ))}
      {/* M22 US17 item 6 */}
      <OftenListenedSwitch />
    </PanelGroup>
  );
}

type MutedState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: MutedListener[] };

/** M21 US10 (US6's mutes): who you muted, each with Unmute. */
function MutedUsers(): React.ReactElement {
  const extras = useCommentExtrasApi();
  const toast = useToast();
  const c = useColours();
  const [state, setState] = useState<MutedState>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    extras.mutes().then((items) => { if (live) setState({ kind: 'ok', items }); }).catch(() => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [extras]);
  const unmute = (m: MutedListener) => {
    if (state.kind !== 'ok') return;
    const before = state.items;
    setState({ kind: 'ok', items: before.filter((x) => x.id !== m.id) });
    extras.unmute(m.id).then(() => toast(`${m.name} is unmuted.`)).catch(() => {
      setState({ kind: 'ok', items: before });
      toast("Couldn't unmute — try again when you're online.");
    });
  };
  const pad = { padding: SET.tilePad };
  return (
    <Box testID="muted-users" className="bg-raise overflow-hidden" style={{ borderRadius: SET.radius }}>
      {state.kind === 'loading' ? (
        <Box style={[pad, { gap: SET.tileGap }]} accessibilityLiveRegion="polite">
          <Type step="mono" className="text-text2" style={SET_TYPE.mono13}>Loading…</Type>
          <InfoGhost rows={2} />
        </Box>
      )
        : state.kind === 'error' ? (
          <Box className="flex-row items-center" style={[pad, { gap: SET.tileGap }]} accessibilityLiveRegion="polite">
            <Icon name="alert-circle-outline" size={20} color={c.hotText} />
            <Type step="note" className="flex-1 text-hotText">Couldn't load the listeners you muted.</Type>
          </Box>
        )
        : state.items.length === 0 ? <Type step="note" className="text-text2 font-normal" style={pad}>You have not muted anyone. Mute someone from the ⋯ on their comment; they are never told.</Type>
        : state.items.map((m, k) => (
          <Box key={m.id} testID="muted-row" className={`flex-row items-center ${k > 0 ? 'border-t border-line' : ''}`} style={{ paddingVertical: SET.mutedRowPadY, paddingHorizontal: SET.rowPadX, gap: SET.rowGap }}>
            <Avatar url={m.avatarUrl} name={m.name} size={SET.mutedAvatar} />
            <Type step="row" className="text-text flex-1" numberOfLines={1}>{m.name}</Type>
            <QuietPill label="Unmute" accessibilityLabel={`Unmute ${m.name}`} height={SET.pillUnmute} onPress={() => unmute(m)} />
          </Box>
        ))}
    </Box>
  );
}

/**
 * M25 SB: "Download my data" — the server emails a 24-hour link to a JSON copy of everything this
 * account keeps (profile, subscriptions, positions, comments, clips, statuses, lists, purchases,
 * tips). Once a day; the server says so when it is too soon.
 */
function DownloadMyData(): React.ReactElement {
  const account = useAccountApi();
  const toast = useToast();
  const c = useColours();
  const [busy, setBusy] = useState(false);
  const ask = () => {
    if (busy) return;
    setBusy(true);
    account.requestDataExport()
      .then((r) => toast(`We emailed you a link. It works for ${r.expiresInHours} hours.`))
      .catch((e: unknown) => toast(e instanceof ApiError && e.code !== 'network' ? e.message : "Couldn't ask for your data — try again when you're online."))
      .finally(() => setBusy(false));
  };
  return (
    <Tile>
      <Icon name="download-outline" size={SET.heroIcon} color={c.hotText} />
      <Type step="heading" className="text-text" style={SET_TYPE.title17} accessibilityRole="header">Download my data</Type>
      <Type step="caption" className="text-text2 font-normal" style={SET_TYPE.line12}>A copy of what SocialNet keeps about you, as a file: your profile, subscriptions, listening, comments, clips, statuses, lists, purchases and tips. We email you a link; it works for 24 hours. Once a day.</Type>
      <QuietPill label={busy ? 'Asking…' : 'Email me a link'} accessibilityLabel="Email me a link to my data" height={SET.pillMail} busy={busy} alignSelf="flex-start" onPress={ask} />
    </Tile>
  );
}

/** A static chip (the drawn `.chip`): 36 tall, raise with a 1 px line, Geist 600 13. Not a control. */
function StaticChip(props: { label: string }): React.ReactElement {
  return (
    <Box className="bg-raise border border-line rounded-pill items-center justify-center" style={{ height: SET.chipHeight, paddingHorizontal: SET.pillPad }}>
      <Type step="caption" className="text-text font-semibold">{props.label}</Type>
    </Box>
  );
}

export default function PrivacySettings(): React.ReactElement {
  const { api, listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [priv, setPriv] = useState(() => stores.settings.get('me.privateListening') === '1');
  useEffect(() => {
    if (!listener) return;
    // A8: a late answer for a signed-out or replaced account must not write the mirror.
    let live = true;
    void api.me().then((me) => {
      if (!live || me.privateListening === undefined) return;
      setPriv(me.privateListening);
      stores.settings.set('me.privateListening', me.privateListening ? '1' : '0');
    }).catch(() => undefined); // offline: the mirror stands
    return () => { live = false; };
  }, [api, listener, stores]);
  const blocked = stores.blocks.all().filter((b) => b.pending >= 0).length;
  const setPrivacy = async (v: boolean) => {
    setPriv(v);
    try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); } catch { setPriv(!v); }
  };
  return (
    <SettingsPage title="Privacy">
      <Section label="Listening">
        <Tile testID="privacy-hero">
          <Icon name="eye-off-outline" size={SET.heroIcon} color={c.hotText} />
          <Type step="heading" className="text-text" style={SET_TYPE.hero19} accessibilityRole="header">Keep my listening private</Type>
          <Type step="caption" className="text-text2 font-normal">Others will not see what you listen to, your listening time or recently played. Comments and clips stay public.</Type>
          <Box className="bg-line" style={{ height: 1 }} accessible={false} importantForAccessibility="no-hide-descendants" />
          {listener ? (
            <Box className="flex-row items-center" style={{ gap: SET.tileGap }}>
              <Type step="mono" className="text-text flex-1" style={SET_TYPE.mono13}>{priv ? 'On — your listening is private' : 'Off — your listening is visible'}</Type>
              <Toggle value={priv} onChange={(v) => { void setPrivacy(v); }} label="Keep my listening private" />
            </Box>
          ) : <Type step="note" className="text-text">Sign in to choose who sees your listening.</Type>}
        </Tile>
      </Section>

      <Section>
        <Box className="flex-row flex-wrap items-center" style={{ gap: SET.footGap - 2 }} accessible accessibilityLabel="Always public: comments and clips">
          <Type step="mono" className="text-text3">Always public:</Type>
          <StaticChip label="Comments" />
          <StaticChip label="Clips" />
        </Box>
      </Section>

      {listener ? (
        <>
          <Section label="Others see"><WhatOthersSee /></Section>
          <Section label="Muted users"><MutedUsers /></Section>
          {/* M22 US3 (FR-011): the notice threads muted from a notice's ⋯. */}
          <Section label="Threads" spoken="Muted threads"><MutedThreads /></Section>
          <Section label="My data"><DownloadMyData /></Section>
        </>
      ) : null}

      <Section label="Blocked">
        <PanelGroup>
          <LinkRow href="/settings/blocked" icon="person-remove-outline" label="Blocked listeners" line="Manage who you blocked" accessibilityValue={String(blocked)} {...(listener ? { right: <Type step="mono" className="text-text" style={SET_TYPE.mono15}>{String(blocked)}</Type> } : {})} />
        </PanelGroup>
      </Section>
    </SettingsPage>
  );
}
