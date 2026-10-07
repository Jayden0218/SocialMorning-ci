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
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { hit } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { privacySwitchesOf, useProfileApi, type PrivacySwitches } from '@/social/profile-api';
import { useCommentExtrasApi, type MutedListener } from '@/social/comment-extras-api';
import { MutedThreads } from '@/ui/social/MutedThreads';

const TAP = { minHeight: hit.min };

type SwitchName = keyof PrivacySwitches;
/** M21 US10: the four "What others see" switches, in the order they are drawn. */
const SWITCHES: readonly { name: SwitchName; label: string; line: string }[] = [
  { name: 'hideBadge', label: 'Hide my listening badge', line: 'The 100h+ / 500h+ / 1000h+ pill beside your comments' },
  { name: 'hideStickers', label: 'Hide my sticker library', line: 'Others cannot open the stickers you collected' },
  { name: 'hideDecorations', label: 'Hide my profile decorations', line: 'Stickers you placed on your profile header' },
  { name: 'privateSubscriptions', label: 'Keep my subscriptions private', line: 'Your profile does not list the shows you follow' },
];

/** M21 US10: the four switches, read from GET /v1/me and each saved alone. */
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
    <Card>
      {SWITCHES.map((sw, i) => (
        <Box key={sw.name}>
          {i > 0 ? <CardDivider /> : null}
          <Box className="flex-row items-center gap-row py-row" style={TAP}>
            <Box className="flex-1">
              <Text className="text-text text-body font-semibold">{sw.label}</Text>
              <Text className="text-muted text-xs mt-0.5">{sw.line}</Text>
            </Box>
            <Toggle value={values?.[sw.name] ?? false} onChange={(v) => change(sw.name, v)} label={sw.label} disabled={values === undefined} />
          </Box>
        </Box>
      ))}
    </Card>
  );
}

type MutedState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: MutedListener[] };

/** M21 US10 (US6's mutes): who you muted, each with Unmute. */
function MutedUsers(): React.ReactElement {
  const extras = useCommentExtrasApi();
  const toast = useToast();
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
  return (
    <Card>
      {state.kind === 'loading' ? <Text className="text-muted text-body py-row">Loading…</Text>
        : state.kind === 'error' ? <Text className="text-muted text-body py-row">Couldn't load the listeners you muted.</Text>
        : state.items.length === 0 ? <Text className="text-muted text-body py-row">You have not muted anyone. Mute someone from the ⋯ on their comment; they are never told.</Text>
        : state.items.map((m, i) => (
          <Box key={m.id}>
            {i > 0 ? <CardDivider /> : null}
            <Box className="flex-row items-center gap-row py-row" style={TAP}>
              <Avatar url={m.avatarUrl} name={m.name} size={36} />
              <Text className="text-text text-body font-semibold flex-1" numberOfLines={1}>{m.name}</Text>
              <Pressable onPress={() => unmute(m)} accessibilityRole="button" accessibilityLabel={`Unmute ${m.name}`} className="px-row rounded-pill border border-border items-center justify-center" style={TAP}>
                <Text className="text-text text-meta font-semibold">Unmute</Text>
              </Pressable>
            </Box>
          </Box>
        ))}
    </Card>
  );
}

export default function PrivacySettings(): React.ReactElement {
  const { api, listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [priv, setPriv] = useState(() => stores.settings.get('me.privateListening') === '1');
  useEffect(() => {
    if (!listener) return;
    void api.me().then((me) => {
      if (me.privateListening === undefined) return;
      setPriv(me.privateListening);
      stores.settings.set('me.privateListening', me.privateListening ? '1' : '0');
    }).catch(() => undefined); // offline: the mirror stands
  }, [api, listener, stores]);
  const blocked = stores.blocks.all().filter((b) => b.pending >= 0).length;
  const setPrivacy = async (v: boolean) => {
    setPriv(v);
    try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); } catch { setPriv(!v); }
  };
  return (
    <>
    <PageHeader title="Privacy" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
      <Card className="py-section gap-gap">
        <Icon name="eye-off-outline" size={28} color={c.accent} />
        <Text className="text-text text-base font-display" accessibilityRole="header">Keep my listening private</Text>
        <Text className="text-muted text-body">Others will not see what you listen to, your listening time or recently played. Comments and clips stay public.</Text>
        <CardDivider />
        {listener ? (
          <Box className="flex-row items-center gap-row" style={TAP}>
            <Text className="text-text text-body font-semibold flex-1">{priv ? 'On — your listening is private' : 'Off — your listening is visible'}</Text>
            <Toggle value={priv} onChange={(v) => { void setPrivacy(v); }} label="Keep my listening private" />
          </Box>
        ) : <Text className="text-muted text-body py-row">Sign in to choose who sees your listening.</Text>}
      </Card>

      <Box className="flex-row items-center gap-gap" accessible accessibilityLabel="Always public: comments and clips">
        <Text className="text-muted text-meta">Always public:</Text>
        <Box className="bg-accentTint rounded-pill px-row py-1.5"><Text className="text-accent text-meta font-bold">Comments</Text></Box>
        <Box className="bg-accentTint rounded-pill px-row py-1.5"><Text className="text-accent text-meta font-bold">Clips</Text></Box>
      </Box>

      {listener ? (
        <>
          <Text className="text-text text-base font-display-semibold" accessibilityRole="header">What others see</Text>
          <WhatOthersSee />
          <Text className="text-text text-base font-display-semibold" accessibilityRole="header">Muted users</Text>
          <MutedUsers />
          {/* M22 US3 (FR-011): the notice threads muted from a notice's ⋯. */}
          <Text className="text-text text-base font-display-semibold" accessibilityRole="header">Muted threads</Text>
          <MutedThreads iconColour={c.accent} />
        </>
      ) : null}

      <Card>
        <Link href="/settings/blocked" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Blocked listeners" accessibilityValue={{ text: String(blocked) }} className="flex-row items-center gap-section py-section" style={TAP}>
            {blocked > 0
              ? <Text className="text-text text-hero font-display">{String(blocked)}</Text>
              : <Icon name="person-remove-outline" size={24} color={c.accent} />}
            <Box className="flex-1">
              <Text className="text-text text-body font-bold">Blocked listeners</Text>
              <Text className="text-muted text-xs mt-0.5">Manage who you blocked</Text>
            </Box>
            <Icon name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
        </Link>
      </Card>
    </ScrollView>
    </>
  );
}
