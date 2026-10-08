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
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
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
  return (
    <>
    <PageHeader title="Check for updates" />
    <Box className="flex-1 bg-background px-screen-x pt-section">
      <Text className="text-muted text-body">{props.line}</Text>
    </Box>
    </>
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
    <>
    <PageHeader title="Check for updates" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-row">
      {params.whatsNew === '1' && release && !newer && release.notes ? (
        <Card>
          <Box className="py-row gap-gap">
            <Text className="text-text text-base font-display" accessibilityRole="header">{`What's new in ${version}`}</Text>
            <Text className="text-text text-body">{release.notes}</Text>
          </Box>
        </Card>
      ) : null}
      <Card>
        <Box className="py-row gap-gap">
          <Text className="text-muted text-xs">{`This app: version ${version}`}</Text>
          {check.kind === 'checking' ? <Text className="text-text text-body">Checking…</Text> : null}
          {check.kind === 'failed' ? <Text className="text-text text-body">Could not reach GitHub. Check your connection and try again.</Text> : null}
          {release && !newer ? <Text className="text-text text-body">You have the latest version.</Text> : null}
          {release && newer ? (
            <>
              <Text className="text-text text-title font-display" accessibilityRole="header">{`Version ${release.version} is ready`}</Text>
              {release.notes ? <Text className="text-muted text-body">{release.notes}</Text> : null}
            </>
          ) : null}
          {fetching.kind === 'working' || fetching.kind === 'refused' ? (
            <Text className="text-text text-body" accessibilityLiveRegion="polite">{fetching.line}</Text>
          ) : null}
          {fetching.kind === 'ready' ? <Text className="text-text text-body">Checked: the download matches the published checksum.</Text> : null}
        </Box>
      </Card>
      {release && newer && release.apkUrl && fetching.kind !== 'ready' ? (
        <Button
          label="Download and check the update"
          busy={fetching.kind === 'working'}
          onPress={() => { if (fetching.kind !== 'working' && release.apkUrl) void download(release.apkUrl, release.notes); }}
        />
      ) : null}
      {fetching.kind === 'ready' ? <Button label="Install the update" onPress={() => install(fetching.file)} /> : null}
      {check.kind !== 'checking' ? <Button label="Check again" kind="secondary" onPress={run} /> : null}
      <Text className="text-muted text-xs">Android asks before installing an app from outside the Play Store.</Text>
    </ScrollView>
    </>
  );
}
