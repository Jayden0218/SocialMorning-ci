// Check for updates (Android): compares this app with the latest release and offers the download; shows What's new once.
/**
 * M22 US17 item 9 (T077). Android APK copies only: the APK is published as a GitHub Release on
 * the public CI mirror (scripts/release.sh, repo Jayden0218/SocialMorning-ci). This page reads
 * `releases/latest` from GitHub's public API, compares its tag with this app's version, and
 * offers the APK when it is newer. On an iPhone the App Store updates the app, so the page only
 * says so and its links (Settings › About, Help) are hidden.
 *
 * What's new: after an update, start-up (src/ui/shell/startupExtras.ts) opens this page once
 * with `?whatsNew=1`, and the release's notes are shown at the top.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
import { RELEASES_LATEST, isNewer, parseRelease, type Release } from '@/ui/shell/startupExtras';

type Check = { kind: 'checking' } | { kind: 'failed' } | { kind: 'done'; release: Release };

export default function UpdatesScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ whatsNew?: string }>();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const [check, setCheck] = useState<Check>({ kind: 'checking' });
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
  useEffect(() => { if (Platform.OS === 'android') run(); }, [run]);

  if (Platform.OS !== 'android') {
    return (
      <>
      <PageHeader title="Check for updates" />
      <Box className="flex-1 bg-background px-screen-x pt-section">
        <Text className="text-muted text-body">On iPhone, the App Store keeps SocialNet up to date.</Text>
      </Box>
      </>
    );
  }

  const release = check.kind === 'done' ? check.release : undefined;
  const newer = release !== undefined && isNewer(release.version, version);
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
        </Box>
      </Card>
      {release && newer && release.apkUrl ? (
        <Button label="Download the update" onPress={() => void Linking.openURL(release.apkUrl ?? release.pageUrl)} />
      ) : null}
      {release && newer && !release.apkUrl ? (
        <Button label="Open the release page" onPress={() => void Linking.openURL(release.pageUrl)} />
      ) : null}
      {check.kind !== 'checking' ? <Button label="Check again" kind="secondary" onPress={run} /> : null}
      <Text className="text-muted text-xs">Android asks before installing an app from outside the Play Store.</Text>
    </ScrollView>
    </>
  );
}
