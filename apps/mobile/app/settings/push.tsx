// Push notification settings: phone permission, new episodes, popular content, per show.
/**
 * Notifications (推送设置, M10; sent since M10b US3). The first row is the phone's own
 * permission — only the system can change it, so the switch opens the system settings.
 * "New episodes" and "Popular content" are the server's switches too: each change is sent
 * (`PUT /v1/me/push-prefs`), so turning one off stops it on every device.
 * M12 FR-093: under them, a switch per subscribed show (`NotifyShows`), off while
 * "New episodes" itself is off.
 *
 * M17 T094 (`SettingsPush-B`): the phone's permission is a tinted banner that says the state and
 * opens the phone's settings ("Open"); the two switches are side-by-side cards with a serif
 * title; the shows are a 2-column grid of cards. Same prefs, API calls and handlers.
 *
 * M22 US1 (FR-002, T013): six more switches under "People and statuses" — Replies, Likes, New
 * followers, Mentions, Statuses and the PLUS Weekly digest — all on by default. Each change is
 * kept on this phone and sent alone (`PUT /v1/me/push-prefs` with that one key); on open the
 * server's values win, so a change on another device shows here.
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useSocial } from '@/social/context';
import { expoNotify } from '@/notify/expo';
import type { PermissionState } from '@/notify/permission';
import { getPref, setPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { NotifyShows } from '@/ui/settings/NotifyShows';
import { useM12Api } from '@/social/m12-api';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { hit, size } from '@/design';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { useM22SocialApi, type PushSwitch } from '@/social/api-m22-social';
import type { PrefName } from '@/settings/prefs';

const TAP = { minHeight: hit.min };
const ROW = { minHeight: size.row };

/** M22: the six people-and-status switches — the server's key, this phone's pref, and the words. */
const PEOPLE: readonly { key: PushSwitch; pref: PrefName; label: string; line: string }[] = [
  { key: 'replies', pref: 'pushReplies', label: 'Replies', line: 'Replies to your comments, comments on your likes' },
  { key: 'likes', pref: 'pushLikes', label: 'Likes', line: 'Grouped: one notification per 10 minutes' },
  { key: 'follows', pref: 'pushFollows', label: 'New followers', line: 'When someone follows you' },
  { key: 'mentions', pref: 'pushMentions', label: 'Mentions', line: 'When someone @mentions you' },
  { key: 'statuses', pref: 'pushStatuses', label: 'Statuses', line: 'Replies and reactions on yours; new ones from people you follow' },
  { key: 'digest', pref: 'pushDigest', label: 'Weekly digest', line: 'PLUS: last week’s unplayed episodes, Monday noon' },
];

/** One of the two switches, as a card: icon and toggle on top, the serif title and line under. */
function SwitchCard(props: { icon: IconName; label: string; line: string; value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Card className="flex-1 py-row gap-1">
      <Box className="flex-row items-center justify-between">
        <Icon name={props.icon} size={22} color={c.accent} />
        <Toggle value={props.value} onChange={props.onChange} label={props.label} />
      </Box>
      <Text className="text-text text-title font-display">{props.label}</Text>
      <Text className="text-muted text-xs pb-1">{props.line}</Text>
    </Card>
  );
}

export default function PushSettings(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [status, setStatus] = useState<PermissionState | 'unavailable'>('undetermined');
  const { api, listener } = useSocial();
  const [popular, setPopular] = useState(() => getPref(stores.settings, 'popularPush'));
  const [episodes, setEpisodes] = useState(() => getPref(stores.settings, 'newEpisodePush'));
  const save = (next: { newEpisodes: boolean; popular: boolean }) => {
    setPref(stores.settings, 'newEpisodePush', next.newEpisodes);
    setPref(stores.settings, 'popularPush', next.popular);
    if (listener) void api.pushPrefs(next).catch(reportAndDrop('push.prefs'));
  };
  // M22 US1: the six people-and-status switches; on open the server's values win.
  const m22 = useM22SocialApi();
  const [people, setPeople] = useState<Record<PushSwitch, boolean>>(() => Object.fromEntries(PEOPLE.map((p) => [p.key, getPref(stores.settings, p.pref)])) as Record<PushSwitch, boolean>);
  useFocusEffect(useCallback(() => {
    if (!listener) return undefined;
    let live = true;
    m22.pushSwitches().then((server) => {
      if (!live) return;
      setPeople((now) => {
        const next = { ...now };
        for (const p of PEOPLE) {
          const v = server[p.key];
          if (typeof v === 'boolean') { next[p.key] = v; setPref(stores.settings, p.pref, v); }
        }
        return next;
      });
    }, () => undefined);
    return () => { live = false; };
  }, [listener, m22, stores.settings]));
  const flip = (p: (typeof PEOPLE)[number], v: boolean) => {
    setPeople((now) => ({ ...now, [p.key]: v }));
    setPref(stores.settings, p.pref, v);
    if (listener) void m22.setPushSwitches({ [p.key]: v }).catch(reportAndDrop('push.switches'));
  };
  const m12 = useM12Api();
  const loadShows = useCallback(() => m12.notifyShows(), [m12]);
  useFocusEffect(useCallback(() => {
    let live = true;
    expoNotify.status().then((s) => { if (live) setStatus(s); }, () => { if (live) setStatus('unavailable'); });
    return () => { live = false; };
  }, []));
  const unavailable = status === 'unavailable';
  const state = unavailable ? 'Not available in this build' : status === 'granted' ? 'Notifications are allowed' : 'Notifications are off';
  return (
    <>
    <PageHeader title="Notifications" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-row">
      {/* The phone's own permission: only the system can change it, so the banner opens its settings. */}
      <Pressable
        onPress={() => { void Linking.openSettings(); }}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel="Allow notifications"
        accessibilityValue={{ text: state }}
        accessibilityHint="Opens your phone’s settings"
        accessibilityState={{ disabled: unavailable }}
        className="bg-accentTint rounded-row flex-row items-center gap-row px-section py-row"
        style={TAP}
      >
        <Icon name="phone-portrait-outline" size={22} color={c.accent} />
        <Box className="flex-1">
          <Text className="text-text text-body font-bold">{state}</Text>
          <Text className="text-muted text-xs mt-0.5">{unavailable ? 'Your phone’s settings can’t be opened from here' : 'Set in your phone’s settings'}</Text>
        </Box>
        {unavailable ? null : (
          <Box className="flex-row items-center gap-1">
            <Text className="text-accent text-meta font-bold">Open</Text>
            <Icon name="open-outline" size={14} color={c.accent} />
          </Box>
        )}
      </Pressable>
      <Box className="flex-row gap-row">
        <SwitchCard icon="albums-outline" label="New episodes" line="When a show you follow publishes" value={episodes} onChange={(v) => { setEpisodes(v); save({ newEpisodes: v, popular }); }} />
        <SwitchCard icon="notifications-outline" label="Popular content" line="The day's pick, at most once a day" value={popular} onChange={(v) => { setPopular(v); save({ newEpisodes: episodes, popular: v }); }} />
      </Box>
      <Eyebrow className="mt-row">People and statuses</Eyebrow>
      <Card padded={false} className="px-section">
        {PEOPLE.map((p, i) => (
          <Box key={p.key} className={`flex-row items-center gap-row py-2 ${i < PEOPLE.length - 1 ? 'border-b-hairline border-separator' : ''}`} style={ROW}>
            <Box className="flex-1">
              <Text className="text-text text-body font-semibold">{p.label}</Text>
              <Text className="text-muted text-xs mt-0.5">{p.line}</Text>
            </Box>
            <Toggle value={people[p.key]} onChange={(v) => flip(p, v)} label={p.label} disabled={!listener} />
          </Box>
        ))}
      </Card>
      {listener ? <NotifyShows load={loadShows} save={m12.setNotifyShow} titleOf={(f) => stores.feeds.getShow(f)?.title} artOf={(f) => stores.feeds.getShow(f)?.imageUrl} disabled={!episodes} /> : null}
      {!listener ? <Text className="text-muted text-xs mt-row">Sign in to receive notifications.</Text> : null}
    </ScrollView>
    </>
  );
}
