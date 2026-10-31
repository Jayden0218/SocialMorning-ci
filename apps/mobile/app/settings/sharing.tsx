// Which outside companies get your data, what they get, and why.
/**
 * Third-party sharing list (第三方信息共享清单, M10): every outside party that receives
 * something because you use SocialNet — written from what the app and server actually
 * call. No advertising or analytics SDK is in the app.
 *
 * M17 T095 (`SettingsSharing-B`): the "no advertising" sentence leads as a serif statement;
 * the parties are a numbered list (serif accent numbers, hairlines between) with "Shared" and
 * "Why" side by side under each name. Same parties, same words, same spoken labels.
 *
 * M31 S-B (T060; design-pulse2 `settings-sharing--screen`; layout Panel; title 28): a lead tile — the block mark in hot-text and "No advertising or
 * analytics companies receive anything from SocialNet." in Unbounded 17 — then "The 5 parties that do, and why:" and one tile per party: its number
 * in mono hot-text, the name in Geist 600 15 and who it is in text-3, and two columns, SHARED and WHY (mono caps 11 over Geist 12 / 17 in text-2).
 * Each tile is read as one sentence. No actions besides back. Same parties and words.
 */
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { Line, Section, SettingsPage, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';

const PARTIES: { name: string; who: string; what: string; why: string }[] = [
  { name: 'Podcast publishers', who: 'Each show’s own feed and audio host', what: 'Your IP address and app name, when a feed or episode is fetched', why: 'To play and download episodes — SocialNet never hosts audio' },
  { name: 'Apple Podcasts directory', who: 'Apple Inc. (iTunes Search API)', what: 'Your search terms and the charts requested, sent by our server (not your phone)', why: 'Search, charts and categories' },
  { name: 'Vercel', who: 'Vercel Inc.', what: 'Requests to the SocialNet server (IP address, the request)', why: 'Runs the SocialNet server' },
  { name: 'Neon', who: 'Neon Inc. (Singapore region)', what: 'Your account, comments, follows, subscriptions and listening stats', why: 'Stores SocialNet’s database' },
  { name: 'Google (Gmail)', who: 'Google LLC', what: 'Your email address and the sign-in code sent to it', why: 'Emailing your one-time sign-in code' },
];

export default function SharingScreen(): React.ReactElement {
  const c = useColours();
  return (
    <SettingsPage title="Third-party sharing" size={28}>
      <Section>
        <Tile>
          <Icon name="ban-outline" size={SET.leadIcon} color={c.hotText} />
          <Type step="heading" className="text-text" style={SET_TYPE.lead}>No advertising or analytics companies receive anything from SocialNet.</Type>
        </Tile>
      </Section>
      <Section><Line>{`The ${PARTIES.length} parties that do, and why:`}</Line></Section>
      {PARTIES.map((p, i) => (
        <Section key={p.name}>
          <Tile accessible accessibilityLabel={`${p.name}. ${p.who}. Shared: ${p.what}. Why: ${p.why}`} style={{ padding: SET.partyPad }}>
            <Box className="flex-row" style={{ gap: SET.tileGap }}>
              <Type step="mono" className="text-hotText" style={SET_TYPE.mono13}>{String(i + 1)}</Type>
              <Type step="row" className="text-text flex-1">
                {p.name}
                <Type step="row" className="text-text3 font-normal">{` · ${p.who}`}</Type>
              </Type>
            </Box>
            <Box className="flex-row" style={{ gap: SET.tileGap }}>
              <Box className="flex-1" style={{ gap: SET.partyCapGap }}>
                <Type step="tag" className="text-text3" style={SET_TYPE.caps}>Shared</Type>
                <Type step="caption" className="text-text2 font-normal" style={SET_TYPE.party}>{p.what}</Type>
              </Box>
              <Box className="flex-1" style={{ gap: SET.partyCapGap }}>
                <Type step="tag" className="text-text3" style={SET_TYPE.caps}>Why</Type>
                <Type step="caption" className="text-text2 font-normal" style={SET_TYPE.party}>{p.why}</Type>
              </Box>
            </Box>
          </Tile>
        </Section>
      ))}
    </SettingsPage>
  );
}
