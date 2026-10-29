// Help: send feedback, contact support, common questions filtered by topic.
/**
 * Help and feedback (帮助与反馈, M10): SocialNet's common questions (tap to read the
 * answer), then "Send feedback" and "Contact support". M6's "Report a problem" lives here.
 *
 * M17 (`SettingsHelp-B`): the two ways to reach us come first, as two cards side by side —
 * Send feedback on the yellow fill, Contact support on white. Under "Common questions" a row of
 * chips filters the questions by their tag; the questions sit in one card, each with its tag
 * as a small pill. Same links, same handlers, same names.
 *
 * M31 S-A (T060; design-pulse2 `settings-help--screen`, `--answer-open`, `--contact-support`; Mosaic + Panel): two large tiles side by side — **Send feedback** (the light tile, void
 * words) and **Contact support** ("Report a problem by email"; it reads "Contact support (offline)" and dims when the address has not loaded). "Questions": tag chips (All + each
 * tag), then the questions as rows in one group tile — the question 15 / 600, its tag as a mono 10 pill, a chevron; a tap opens the answer in place (the chevron turns down).
 * "Not working?": Check network, and on Android "Playback stops when the screen is off?". Edge labels QUESTIONS · NOT WORKING?.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { openSystem } from '@/ui/kit/openLink';
import { Link } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useFaq } from '@/config/content';
import { MarkdownBlocks } from '@/ui/content/Markdown';
import { appealsMailto, APPEALS_KEY, refreshAppeals } from '@/social/links';
import { useSocial } from '@/social/context';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Chip } from '@/ui/kit/Chip';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { BigGrid, BigTile, Sec, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const ALL = 'All';

export default function HelpScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  // M17: keyed by the question, so a filter does not open a different answer.
  const [open, setOpen] = useState<string | undefined>();
  const [tag, setTag] = useState<string>(ALL);
  // M23 US9: the saved address at once, the server's once it answers (cancelled on unmount).
  const [fresh] = useLoad(() => refreshAppeals(api, stores).then((to) => ({ to })), [api, stores], 'help.appeals');
  const appeals = fresh.kind === 'ok' ? fresh.to : stores.settings.get(APPEALS_KEY) || undefined;
  const mail = appealsMailto(appeals);
  // M25 A8: the server's questions (Admin › Content), the bundled ones when it cannot be reached.
  const faq = useFaq();
  const tags = useMemo(() => [ALL, ...Array.from(new Set(faq.map((f) => f.tag)))], [faq]);
  const shown = tag === ALL ? faq : faq.filter((f) => f.tag === tag);
  return (
    <PushedPage title="Help and feedback" size={28}>
      {(layout) => (
        <SetPage layout={layout}>
          <BigGrid>
            <Link href="/settings/feedback" asChild accessibilityLabel="Send feedback">
              <BigTile light plain icon="create-outline" label="Send feedback" line="Tell us what went wrong or what you would like" accessibilityLabel="Send feedback, Tell us what went wrong or what you would like" accessibilityRole="link" />
            </Link>
            <BigTile plain icon="headset-outline" label={mail ? 'Contact support' : 'Contact support (offline)'} line="Report a problem by email" dim={!mail} onPress={() => { if (mail) void openSystem(mail).catch(() => undefined); }} disabled={!mail} accessibilityLabel="Report a problem to support" accessibilityState={{ disabled: !mail }} />
          </BigGrid>

          <Sec label="Questions">
            <Box style={{ gap: SET.tileGap }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerStyle={{ gap: 6 }}>
                {tags.map((t) => (
                  <Chip key={t} tone="dark" label={t} chosen={tag === t} onPress={() => setTag(t)} accessibilityLabel={`Show ${t === ALL ? 'all questions' : `${t} questions`}`} />
                ))}
              </ScrollView>
              <PanelGroup>
                {shown.map((f) => {
                  const isOpen = open === f.q;
                  return (
                    <SetRow
                      key={f.q}
                      label={f.q}
                      onPress={() => setOpen(isOpen ? undefined : f.q)}
                      accessibilityState={{ expanded: isOpen }}
                      accessibilityLabel={f.q}
                      right={(
                        <Box className="flex-row items-center" style={{ gap: 6 }}>
                          <Box className="bg-raise2" style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                            <Type step="badge" className="text-text2" style={SET_TYPE.tag10}>{f.tag}</Type>
                          </Box>
                          <Icon name={isOpen ? 'chevron-down' : 'chevron-forward'} size={SET.chevron} color={colour.text3} />
                        </Box>
                      )}
                      sub={isOpen ? <Box style={{ marginTop: 8 }}><MarkdownBlocks blocks={f.blocks} small /></Box> : null}
                    />
                  );
                })}
              </PanelGroup>
            </Box>
          </Sec>

          {/* M22 US17 (T077, T078): the network check, and the Android battery helper. */}
          <Sec label="Not working?">
            <PanelGroup>
              <Link href="/settings/network" asChild accessibilityLabel="Check network"><SetRow icon="trending-up-outline" label="Check network" line="Test our server, a feed host and an audio host" /></Link>
              {Platform.OS === 'android' ? (
                <Link href="/settings/background" asChild accessibilityLabel="Playback stops when the screen is off?"><SetRow icon="moon-outline" label="Playback stops when the screen is off?" line="Android only · Let SocialNet keep playing in the background" /></Link>
              ) : null}
            </PanelGroup>
          </Sec>
        </SetPage>
      )}
    </PushedPage>
  );
}
