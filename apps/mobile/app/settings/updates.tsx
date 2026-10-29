// Check for updates (GitHub APK builds only): compares with the latest release, checks the download's SHA-256, then offers the install.
/**
 * M22 US17 item 9 (T077). Android APK copies only: the APK is published as a GitHub Release on
 * the public CI mirror (scripts/release.sh, repo Jayden0218/SocialMorning-ci). This page reads
 * `releases/latest` from GitHub's public API, compares its tag with this app's version, and
 * offers the APK when it is newer. On an iPhone the App Store updates the app, so the page only
 * says so and its links (Settings › About, Help) are hidden.
 *
 * What's new: after an update, start-up (src/ui/shell/startupExtras.ts) opens this page once
 * with `?whatsNew=1`, and the release's notes are shown at the top.
 *
 * M25 L3d (security audit #23, Play policy): only a build made for GitHub Releases shows any of
 * this (`updaterShown`, src/ui/shell/updater.ts); a store build says the store updates it. The APK
 * is no longer handed to the browser: the app downloads it into its cache, hashes it (SHA-256,
 * expo-file-system's native digest) and compares it with the hash the owner publishes on the
 * API's /get page (and the release notes' line, when present). Only a match is offered for
 * install (Android's package installer, through expo-intent-launcher); anything else is deleted.
 * NOT VERIFIED on a phone.
 *
 * M31 S-B (T060; design-pulse2 `settings-updates--screen` — iPhone, and Android with a downloaded update; layout Panel): iPhone (and a store copy) is one tile: the
 * download mark in hot-text and the one line in Geist 500 16. An APK copy shows a version tile — "This app: version …" in mono, the state line, "Version x is
 * ready" in Unbounded 26 with the notes, the green checksum line in mono — then "Download and check the update" / "Install the update" (light, full width) and
 * "Check again" (quiet), then the Play Store line in 12. After an update "What's new in …" is its own tile on top. Same checks, refusals and names.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { Line, Section, SettingsPage, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';
import { apiBaseUrl } from '@/social/base-url';
import { RELEASES_LATEST, isNewer, parseRelease, type Release } from '@/ui/shell/startupExtras';
import { VERDICT_TEXT, distributionOf, shaFromGetPage, shaFromNotes, updaterShown, verdict } from '@/ui/shell/updater';

type Check = { kind: 'checking' } | { kind: 'failed' } | { kind: 'done'; release: Release };
type Fetching = { kind: 'idle' } | { kind: 'working'; line: string } | { kind: 'refused'; line: string } | { kind: 'ready'; file: File };

type IntentLauncher = { startActivityAsync(action: string, params?: { data?: string; flags?: number; type?: string }): Promise<unknown> };
function launcher(): IntentLauncher | null {
  try { return require('expo-intent-launcher') as IntentLauncher; } catch { return null; }
}

/** Android's Intent.FLAG_GRANT_READ_URI_PERMISSION: the installer may read our cached file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_TYPE = 'application/vnd.android.package-archive';

/** The hash the owner published on /get (Vercel's RELEASE_SHA256); undefined when there is none. */
async function publishedSha(): Promise<string | undefined> {
  try {
    const r = await fetch(`${apiBaseUrl()}/get`);
    return r.ok ? shaFromGetPage(await r.text()) : undefined;
  } catch {
    return undefined;
  }
}

function StoreNote(props: { line: string }): React.ReactElement {
  const c = useColours();
  return (
    <SettingsPage title="Check for updates">
      <Box style={{ height: SET.storeTop }} />
      <Section>
        <Tile>
          <Icon name="download-outline" size={SET.heroIcon} color={c.hotText} />
          <Type step="row" className="text-text font-medium" style={SET_TYPE.store}>{props.line}</Type>
        </Tile>
      </Section>
    </SettingsPage>
  );
}

export default function UpdatesScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ whatsNew?: string }>();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const shown = updaterShown(Platform.OS, distributionOf(Constants.expoConfig?.extra));
  const [check, setCheck] = useState<Check>({ kind: 'checking' });
  const [fetching, setFetching] = useState<Fetching>({ kind: 'idle' });
  const run = useCallback(() => {
    setCheck({ kind: 'checking' });
    void fetch(RELEASES_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: unknown) => {
        const release = parseRelease(body);
        setCheck(release ? { kind: 'done', release } : { kind: 'failed' });
      })
      .catch(() => setCheck({ kind: 'failed' }));
  }, []);
  useEffect(() => { if (shown) run(); }, [run, shown]);

  if (Platform.OS !== 'android') return <StoreNote line="On iPhone, the App Store keeps SocialNet up to date." />;
  if (!shown) return <StoreNote line="The store you installed SocialNet from keeps it up to date." />;

  const release = check.kind === 'done' ? check.release : undefined;
  const newer = release !== undefined && isNewer(release.version, version);

  const download = async (apkUrl: string, notes: string): Promise<void> => {
    setFetching({ kind: 'working', line: 'Downloading…' });
    const target = new File(Paths.cache, 'socialnet-update.apk');
    try {
      const published = await publishedSha();
      if (!published) { setFetching({ kind: 'refused', line: VERDICT_TEXT['no-published-hash'] }); return; }
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(apkUrl, target, { idempotent: true });
      setFetching({ kind: 'working', line: 'Checking the download…' });
      const v = verdict(published, shaFromNotes(notes), await file.digest('SHA-256'));
      if (!v.ok) {
        try { file.delete(); } catch { /* already gone */ }
        setFetching({ kind: 'refused', line: VERDICT_TEXT[v.reason] });
        return;
      }
      setFetching({ kind: 'ready', file });
    } catch {
      setFetching({ kind: 'refused', line: 'The download failed. Check your connection and try again.' });
    }
  };

  const install = (file: File): void => {
    const intents = launcher();
    // `contentUri` (Android): the file through expo-file-system's FileProvider, readable by the installer.
    const uri = file.contentUri;
    if (!intents || !uri) { setFetching({ kind: 'refused', line: 'This phone could not open the installer.' }); return; }
    void intents.startActivityAsync('android.intent.action.VIEW', { data: uri, flags: FLAG_GRANT_READ_URI_PERMISSION, type: APK_TYPE })
      .catch(() => setFetching({ kind: 'refused', line: 'This phone could not open the installer.' }));
  };

  return (
    <SettingsPage title="Check for updates">
      {params.whatsNew === '1' && release && !newer && release.notes ? (
        <Section>
          <Tile>
            <Type step="lede" className="text-text" style={SET_TYPE.step} accessibilityRole="header">{`What's new in ${version}`}</Type>
            <Type step="body" className="text-text">{release.notes}</Type>
          </Tile>
        </Section>
      ) : null}
      <Section>
        <Tile>
          <Type step="mono" className="text-text2" style={SET_TYPE.mono13}>{`This app: version ${version}`}</Type>
          {check.kind === 'checking' ? <Type step="body" className="text-text">Checking…</Type> : null}
          {check.kind === 'failed' ? <Type step="body" className="text-text">Could not reach GitHub. Check your connection and try again.</Type> : null}
          {release && !newer ? <Type step="body" className="text-text">You have the latest version.</Type> : null}
          {release && newer ? (
            <>
              <Type step="heading" className="text-text" style={SET_TYPE.version26} accessibilityRole="header">{`Version ${release.version} is ready`}</Type>
              {release.notes ? <Type step="caption" className="text-text2 font-normal" style={SET_TYPE.notes19}>{release.notes}</Type> : null}
            </>
          ) : null}
          {fetching.kind === 'working' || fetching.kind === 'refused' ? (
            <Type step="body" className="text-text" accessibilityLiveRegion="polite">{fetching.line}</Type>
          ) : null}
          {fetching.kind === 'ready' ? <Type step="mono" className="text-ok" style={SET_TYPE.line12}>Checked: the download matches the published checksum.</Type> : null}
        </Tile>
      </Section>
      {release && newer && release.apkUrl && fetching.kind !== 'ready' ? (
        <Section>
          <PulseButton
            label="Download and check the update"
            busy={fetching.kind === 'working'}
            full
            onPress={() => { if (fetching.kind !== 'working' && release.apkUrl) void download(release.apkUrl, release.notes); }}
          />
        </Section>
      ) : null}
      {fetching.kind === 'ready' ? <Section><PulseButton label="Install the update" full onPress={() => install(fetching.file)} /></Section> : null}
      {check.kind !== 'checking' ? <Section><PulseButton label="Check again" kind="quiet" full onPress={run} /></Section> : null}
      <Section><Line>Android asks before installing an app from outside the Play Store.</Line></Section>
    </SettingsPage>
  );
}
