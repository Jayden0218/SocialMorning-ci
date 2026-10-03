// What the host added: announcements, polls, hosts, links and contacts.
/**
 * M11 — what a show's creator set in the Studio, on the show page: their announcements, their
 * polls, and the hosts and links they listed (specs/011-m11-studio FR-020..FR-024), and their
 * contacts (M14 US3).
 *
 * Fetched after the feed has drawn the page. If the call fails, nothing here renders and the
 * page stays exactly as the feed made it (Principle IV).
 *
 * M17 (`Show-B`, `Episode-B`): announcements and polls are white Editorial cards (thin border,
 * 16 pt corners) with an accent eyebrow; a poll's question is in the serif. Props unchanged.
 */
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useSocial } from '@/social/context';
import type { ShowExtras as Extras, ShowPoll } from '@/social/api';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { TAP } from '@/ui/kit/TopBar';
import { plural } from '@socialmorning/social-core';

/** The creator's extras for a show, or undefined until (or unless) they arrive. */
export function useShowExtras(feedUrl: string): [Extras | undefined, (p: ShowPoll) => void] {
  const { api } = useSocial();
  const [x, setX] = useState<Extras | undefined>();
  useEffect(() => {
    let live = true;
    if (feedUrl) api.showExtras(feedUrl).then((r) => { if (live) setX(r); }, () => undefined);
    return () => { live = false; };
  }, [api, feedUrl]);
  const replacePoll = (p: ShowPoll) => setX((cur) => (cur ? { ...cur, polls: cur.polls.map((q) => (q.id === p.id ? p : q)) } : cur));
  return [x, replacePoll];
}

/** Only an https link from the creator is ever opened. */
/** The eyebrow's spaced capitals (as `Eyebrow`). */
const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };

const openLink = (url: string) => { if (/^https:\/\//.test(url)) void Linking.openURL(url).catch(() => undefined); };

const CONTACT_LABEL: Record<string, string> = {
  website: 'Website', email: 'Email', wechat: 'WeChat', wechat_official: 'WeChat Official Account', weibo: 'Weibo', jike: 'Jike', xiaohongshu: 'Xiaohongshu',
};

/** A link type opens (https only), an email opens mail, a WeChat ID is shown to copy by hand. */
function Contact({ type, value }: { type: string; value: string }): React.ReactElement {
  const label = CONTACT_LABEL[type] ?? type;
  const target = type === 'email' ? `mailto:${value}` : /^https:\/\//.test(value) ? value : null;
  if (!target) return <Text className="text-sm text-muted">{`${label}: ${value}`}</Text>;
  return (
    <Pressable onPress={() => { void Linking.openURL(target).catch(() => undefined); }} accessibilityRole="link" accessibilityLabel={`${label}, opens ${value}`} className="justify-center" style={TAP}>
      <Text className="text-sm text-accent">{`${label} ↗`}</Text>
    </Pressable>
  );
}

/**
 * `noAnnouncements`: the show page draws the newest one itself as a card under its header
 * (show/AnnouncementCard — owner, 2026-10-01), so it asks this block to leave them out.
 */
export function ShowExtrasBlock({ extras, onPoll, episodeId, noAnnouncements }: { extras: Extras; onPoll: (p: ShowPoll) => void; episodeId?: string; noAnnouncements?: boolean }): React.ReactElement | null {
  const polls = extras.polls.filter((p) => (episodeId ? p.episodeId === episodeId : true));
  const announcements = episodeId || noAnnouncements ? [] : extras.announcements;
  const hosts = episodeId ? null : extras.overrides?.hosts ?? null;
  const links = episodeId ? null : extras.overrides?.links ?? null;
  const contacts = episodeId ? null : extras.overrides?.contacts ?? null;
  if (announcements.length === 0 && polls.length === 0 && !hosts?.length && !links?.length && !contacts?.length) return null;
  return (
    <Box className="gap-section">
      {announcements.map((a) => (
        <Box key={a.id} className="bg-surface border border-border rounded-row px-section py-row gap-1" accessibilityRole="summary">
          <Text className="text-micro font-bold text-accent" style={CAPS}>From the host</Text>
          <Text className="text-sm font-display-semibold text-text">{a.body}</Text>
        </Box>
      ))}
      {polls.map((p) => <Poll key={p.id} poll={p} onChange={onPoll} />)}
      {hosts?.length ? <Text className="text-sm text-muted">{`Hosted by ${hosts.join(', ')}`}</Text> : null}
      {links?.length ? (
        <Box className="flex-row flex-wrap gap-4">
          {links.map((l) => (
            <Pressable key={l.url} onPress={() => openLink(l.url)} accessibilityRole="link" accessibilityLabel={`${l.label}, opens ${l.url}`} className="justify-center" style={TAP}>
              <Text className="text-sm text-accent">{`${l.label} ↗`}</Text>
            </Pressable>
          ))}
        </Box>
      ) : null}
      {contacts?.length ? (
        <Box className="flex-row flex-wrap gap-4">
          {contacts.map((c) => <Contact key={`${c.type}:${c.value}`} type={c.type} value={c.value} />)}
        </Box>
      ) : null}
    </Box>
  );
}

function Poll({ poll, onChange }: { poll: ShowPoll; onChange: (p: ShowPoll) => void }): React.ReactElement {
  const { api, listener } = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const voted = poll.myVote !== undefined && poll.myVote !== null;
  const showResult = voted || !poll.open;
  const vote = async (idx: number) => {
    setBusy(true); setError(undefined);
    try { onChange(await api.votePoll(poll.id, idx)); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <Box className="bg-surface border border-border rounded-row px-section py-row gap-2">
      <Text className="text-micro font-bold text-accent" style={CAPS}>{poll.open ? 'Poll from the host' : 'Poll closed'}</Text>
      <Text className="text-title font-display-semibold text-text">{poll.question}</Text>
      {poll.options.map((o) => {
        const share = poll.total ? o.votes / poll.total : 0;
        const mine = poll.myVote === o.idx;
        return showResult ? (
          <Box key={o.idx} className="gap-1" accessible accessibilityLabel={`${o.label}: ${Math.round(share * 100)} percent${mine ? ', your vote' : ''}`}>
            <Box className="flex-row justify-between">
              <Text className={mine ? 'text-sm font-bold text-text' : 'text-sm text-text'}>{mine ? `${o.label} ✓` : o.label}</Text>
              <Text className="text-sm text-muted">{`${Math.round(share * 100)}%`}</Text>
            </Box>
            <Box className="h-2 rounded-pill bg-track overflow-hidden"><Box className="h-2 rounded-pill bg-accent" style={{ width: `${share * 100}%` }} /></Box>
          </Box>
        ) : (
          <Pressable key={o.idx} disabled={busy || !listener} onPress={() => { void vote(o.idx); }} accessibilityRole="button" accessibilityLabel={`Vote ${o.label}`}
            className="border border-border rounded-pill px-section justify-center bg-surface" style={TAP}>
            <Text className="text-body font-semibold text-text">{o.label}</Text>
          </Pressable>
        );
      })}
      {!listener && poll.open && !voted ? <Text className="text-xs text-muted">Sign in to vote.</Text> : null}
      {showResult ? <Text className="text-xs text-muted">{`${plural(poll.total, 'vote')}`}</Text> : null}
      {error ? <Text className="text-xs text-accent">{error}</Text> : null}
    </Box>
  );
}
