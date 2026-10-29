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
 *
 * M24 fix F-P (US3): "System notices" (server key `system`, on by default) in its own card under
 * "From SocialNet" — the notices the admin sends no longer ride on "Popular content".
 *
 * M31 W6-B (`shell.html` `permission--notifications`): while the permission is off the tile is the tinted pre-prompt banner (hot at 16 %, not the raise fill) — it says "Notifications are off" and its tap asks the phone's settings.
 *
 * M31 S-B (T060 part 2; design-pulse2 `settings-push--screen`, `--signed-out`, `--open-settings`; layout Panel + Mosaic): on top the phone's state in a
 * tile (the bell in hot-text, "Notifications are allowed / are off / Not available in this build", "Set in your phone’s settings", and
 * "Open ↗" in hot-text; the whole tile opens the phone's settings); under MAIN the two large switch tiles (New episodes, Popular content, their
 * lines in mono under the names); under PEOPLE one group of six switch rows; under SOCIALNET the System notices row; under SHOWS the cover
 * tiles (`NotifyShows`). Signed out the switches are dimmed and "Sign in to receive notifications." is a tile where the shows would be.
 * Same prefs, API calls and handlers as before.
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
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
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { hit } from '@/design';
import { useM22SocialApi, type PushSwitch } from '@/social/api-m22-social';
import type { PrefName } from '@/settings/prefs';
import { BigGrid, BigSwitch, Line, Section, SettingsPage, SwitchRow, Tile } from '@/ui/settings/panel';
import { SET } from '@/ui/settings/measures';

/** M22: the six people-and-status switches — the server's key, this phone's pref, and the words. */
const PEOPLE: readonly { key: PushSwitch; pref: PrefName; label: string; line: string }[] = [
  { key: 'replies', pref: 'pushReplies', label: 'Replies', line: 'Replies to your comments, comments on your likes' },
  { key: 'likes', pref: 'pushLikes', label: 'Likes', line: 'Grouped: one notification per 10 minutes' },
  { key: 'follows', pref: 'pushFollows', label: 'New followers', line: 'When someone follows you' },
  { key: 'mentions', pref: 'pushMentions', label: 'Mentions', line: 'When someone @mentions you' },
  { key: 'statuses', pref: 'pushStatuses', label: 'Statuses', line: 'Replies and reactions on yours; new ones from people you follow' },
  { key: 'digest', pref: 'pushDigest', label: 'Weekly digest', line: 'PLUS: last week’s unplayed episodes, Monday noon' },
];
/** M24 fix F-P (US3): the system notices switch, sent and read like the six above. */
const SYSTEM: typeof PEOPLE = [
  { key: 'system', pref: 'pushSystem', label: 'System notices', line: 'Notices from SocialNet' },
];
const SWITCHES = [...PEOPLE, ...SYSTEM];

/** A group of switch rows (label, line, switch), a hairline between them. */
function SwitchRows(props: { rows: typeof PEOPLE; values: Record<PushSwitch, boolean>; onFlip: (p: (typeof PEOPLE)[number], v: boolean) => void; disabled: boolean }): React.ReactElement {
  return (
    <PanelGroup>
      {props.rows.map((p) => (
        <SwitchRow key={p.key} label={p.label} line={p.line} value={props.values[p.key]} onChange={(v) => props.onFlip(p, v)} disabled={props.disabled} />
      ))}
    </PanelGroup>
  );
}

/** One of the two large switch tiles: the icon and switch on top, the name and a mono line under. */
function SwitchCard(props: { icon: IconName; label: string; line: string; value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return <BigSwitch icon={props.icon} label={props.label} state={props.line} on={props.value} onChange={props.onChange} />;
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
  const [people, setPeople] = useState<Record<PushSwitch, boolean>>(() => Object.fromEntries(SWITCHES.map((p) => [p.key, getPref(stores.settings, p.pref)])) as Record<PushSwitch, boolean>);
  useFocusEffect(useCallback(() => {
    if (!listener) return undefined;
    let live = true;
    m22.pushSwitches().then((server) => {
      if (!live) return;
      setPeople((now) => {
        const next = { ...now };
        for (const p of SWITCHES) {
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
    <SettingsPage title="Notifications">
      {/* The phone's own permission: only the system can change it, so the tile opens its settings. */}
      <Section>
        <Pressable
          onPress={() => { void Linking.openSettings(); }}
          disabled={unavailable}
          accessibilityRole="button"
          accessibilityLabel="Allow notifications"
          accessibilityValue={{ text: state }}
          accessibilityHint="Opens your phone’s settings"
          accessibilityState={{ disabled: unavailable }}
          className={`${status === 'granted' || unavailable ? 'bg-raise' : 'bg-hotSoft'} flex-row items-center`}
          style={{ minHeight: hit.min, borderRadius: SET.radius, paddingVertical: SET.bigPad, paddingHorizontal: SET.tilePad, gap: SET.rowGap }}
        >
          <Icon name="notifications-outline" size={SET.rowIcon} color={c.hotText} />
          <Box className="flex-1">
            <Type step="row" className="text-text">{state}</Type>
            <Line>{unavailable ? 'Your phone’s settings can’t be opened from here' : 'Set in your phone’s settings'}</Line>
          </Box>
          {unavailable ? null : (
            <Box className="flex-row items-center" style={{ gap: SET.openGap }}>
              <Type step="caption" className="text-hotText font-semibold">Open</Type>
              <Icon name="open-outline" size={SET.openIcon} color={c.hotText} />
            </Box>
          )}
        </Pressable>
      </Section>
      <Section label="Main">
        <BigGrid testID="push-main">
          <SwitchCard icon="albums-outline" label="New episodes" line="When a show you follow publishes" value={episodes} onChange={(v) => { setEpisodes(v); save({ newEpisodes: v, popular }); }} />
          <SwitchCard icon="notifications-outline" label="Popular content" line="The day's pick, at most once a day" value={popular} onChange={(v) => { setPopular(v); save({ newEpisodes: episodes, popular: v }); }} />
        </BigGrid>
      </Section>
      <Section label="People"><SwitchRows rows={PEOPLE} values={people} onFlip={flip} disabled={!listener} /></Section>
      <Section label="SocialNet"><SwitchRows rows={SYSTEM} values={people} onFlip={flip} disabled={!listener} /></Section>
      {listener ? <NotifyShows load={loadShows} save={m12.setNotifyShow} titleOf={(f) => stores.feeds.getShow(f)?.title} artOf={(f) => stores.feeds.getShow(f)?.imageUrl} disabled={!episodes} /> : null}
      {!listener ? <Section><Tile><Type step="body" className="text-text font-medium">Sign in to receive notifications.</Type></Tile></Section> : null}
    </SettingsPage>
  );
}
