// Help: send feedback, contact support, common questions filtered by topic.
/**
 * Help and feedback (帮助与反馈, M10): SocialNet's common questions (tap to read the
 * answer), then "Send feedback" and "Contact support". M6's "Report a problem" lives here.
 *
 * M17 (`SettingsHelp-B`): the two ways to reach us come first, as two cards side by side —
 * Send feedback on the yellow fill, Contact support on white. Under "Common questions" a row of
 * chips filters the questions by their tag; the questions sit in one card, each with its tag
 * as a small pill. Same links, same handlers, same names.
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { Link } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { size } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { FAQ } from '@/settings/faq';
import { appealsMailto, APPEALS_KEY, refreshAppeals } from '@/social/links';
import { useSocial } from '@/social/context';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Chip } from '@/ui/kit/Chip';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };
/** The two contact cards: tall enough for the icon above the title. */
const TILE = { minHeight: 112 };
const ALL = 'All';

export default function HelpScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  // M17: keyed by the question, so a filter does not open a different answer.
  const [open, setOpen] = useState<string | undefined>();
  const [tag, setTag] = useState<string>(ALL);
  const [appeals, setAppeals] = useState<string | undefined>(() => stores.settings.get(APPEALS_KEY) || undefined);
  useEffect(() => { void refreshAppeals(api, stores).then(setAppeals); }, [api, stores]);
  const mail = appealsMailto(appeals);
  const tags = useMemo(() => [ALL, ...Array.from(new Set(FAQ.map((f) => f.tag)))], []);
  const shown = tag === ALL ? FAQ : FAQ.filter((f) => f.tag === tag);
  return (
    <>
    <PageHeader title="Help and feedback" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-row">
      <Box className="flex-row gap-row">
        <Link href="/settings/feedback" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Send feedback, Tell us what went wrong or what you would like" className="flex-1 bg-primary rounded-row p-section justify-between" style={TILE}>
            <Icon name="create-outline" size={24} color={c.onPrimary} />
            <Box className="mt-row">
              <Text className="text-onPrimary text-title font-display">Send feedback</Text>
              <Text className="text-onPrimary text-micro mt-0.5">Tell us what went wrong or what you would like</Text>
            </Box>
          </Pressable>
        </Link>
        <Pressable onPress={() => { if (mail) void Linking.openURL(mail); }} disabled={!mail} accessibilityRole="button" accessibilityState={{ disabled: !mail }} accessibilityLabel="Report a problem to support"
          className={`flex-1 bg-surface border border-border rounded-row p-section justify-between ${mail ? '' : 'opacity-50'}`} style={TILE}>
          <Icon name="headset-outline" size={24} color={c.accent} />
          <Box className="mt-row">
            <Text className="text-text text-title font-display">{mail ? 'Contact support' : 'Contact support (offline)'}</Text>
            <Text className="text-muted text-micro mt-0.5">Report a problem by email</Text>
          </Box>
        </Pressable>
      </Box>

      <Text className="text-text text-base font-display-semibold mt-1" accessibilityRole="header">Common questions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-screen-x" contentContainerClassName="px-screen-x gap-gap">
        {tags.map((t) => (
          <Chip key={t} label={t} chosen={tag === t} onPress={() => setTag(t)} accessibilityLabel={`Show ${t === ALL ? 'all questions' : `${t} questions`}`} />
        ))}
      </ScrollView>

      <Card padded={false}>
        {shown.map((f, i) => {
          const isOpen = open === f.q;
          return (
            <Box key={f.q}>
              {i > 0 ? <CardDivider /> : null}
              <Pressable onPress={() => setOpen(isOpen ? undefined : f.q)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={f.q} className="flex-row items-center gap-gap px-section py-1.5" style={TAP}>
                <Text className="text-text text-body font-semibold flex-1">{f.q}</Text>
                <Box className="bg-accentTint rounded-pill px-2 py-0.5">
                  <Text className="text-accent text-micro">{f.tag}</Text>
                </Box>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={c.muted} />
              </Pressable>
              {isOpen ? <Text className="text-muted text-meta px-section pb-section leading-[20px]">{f.a}</Text> : null}
            </Box>
          );
        })}
      </Card>
    </ScrollView>
    </>
  );
}
