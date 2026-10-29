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
 *
 * M31 W3-A (T040; design-pulse2 show `About` view and the episode's Notes): Pulse tiles — raise, radius 20, 14 of padding; the eyebrow in
 * mono 11 hot-text capitals; the host's words Geist 14/20; a poll's question in Unbounded 18, its options 48 tall pills with a 1 px line
 * and, once voted, a bar 8 tall (hot on the idle track) under the label and share; links and contacts hot-text with ↗. Same words, labels,
 * handlers.
 */
import { useEffect, useState } from 'react';
import { useOpenLink } from '@/ui/kit/useOpenLink';
import { useSocial } from '@/social/context';
import type { ShowExtras as Extras, ShowPoll } from '@/social/api';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { TAP } from '@/ui/kit/TopBar';
import { player } from '@/design/tokens';
import { plural } from '@socialmorning/social-core';

/** The creator's extras for a show, or undefined until (or unless) they arrive. */
export function useShowExtras(feedUrl: string, images?: { image?: string | undefined; episodeImage?: string | undefined }): [Extras | undefined, (p: ShowPoll) => void] {
  const { api } = useSocial();
  const [x, setX] = useState<Extras | undefined>();
  // M21: the covers the page draws, so the answer carries their tint (strings, so the effect does not re-run per render).
  const image = images?.image;
  const episodeImage = images?.episodeImage;
  useEffect(() => {
    let live = true;
    if (feedUrl) api.showExtras(feedUrl, image || episodeImage ? { image, episodeImage } : undefined).then((r) => { if (live) setX(r); }, () => undefined);
    return () => { live = false; };
  }, [api, feedUrl, image, episodeImage]);
  const replacePoll = (p: ShowPoll) => setX((cur) => (cur ? { ...cur, polls: cur.polls.map((q) => (q.id === p.id ? p : q)) } : cur));
  return [x, replacePoll];
}

/** Only an https link from the creator is ever opened. */
/** A tile: raise, radius 20, 14 of padding (the drawing's Mosaic tile). */
const TILE = { borderRadius: player.panelRadius, padding: player.panelPad };
/** The eyebrow: mono 11, capitals, tracked (`.cap`). */
const CAPS = { textTransform: 'uppercase' as const, letterSpacing: player.capTracking };
/** The bar of a result: 8 tall. */
const BAR = { height: 8 };

// M22 US7 (FR-025): the creator's https links open in the in-app browser.

const CONTACT_LABEL: Record<string, string> = {
  website: 'Website', email: 'Email', wechat: 'WeChat', wechat_official: 'WeChat Official Account', weibo: 'Weibo', jike: 'Jike', xiaohongshu: 'Xiaohongshu',
};

/** A link type opens (https only), an email opens mail, a WeChat ID is shown to copy by hand. */
function Contact({ type, value }: { type: string; value: string }): React.ReactElement {
  const { open } = useOpenLink();
  const label = CONTACT_LABEL[type] ?? type;
  const target = type === 'email' ? `mailto:${value}` : /^https:\/\//.test(value) ? value : null;
  if (!target) return <Type step="caption" className="text-text2">{`${label}: ${value}`}</Type>;
  return (
    <Pressable onPress={() => { void open(target); }} accessibilityRole="link" accessibilityLabel={`${label}, opens ${value}`} className="justify-center" style={TAP}>
      <Type step="caption" className="text-hotText font-semibold">{`${label} ↗`}</Type>
    </Pressable>
  );
}

/**
 * `noAnnouncements`: the show page draws the newest one itself as a card under its header
 * (show/AnnouncementCard — owner, 2026-10-01), so it asks this block to leave them out.
 */
export function ShowExtrasBlock({ extras, onPoll, episodeId, noAnnouncements }: { extras: Extras; onPoll: (p: ShowPoll) => void; episodeId?: string; noAnnouncements?: boolean }): React.ReactElement | null {
  const { open } = useOpenLink();
  const openLink = (url: string) => { if (/^https:\/\//.test(url)) void open(url); };
  const polls = extras.polls.filter((p) => (episodeId ? p.episodeId === episodeId : true));
  const announcements = episodeId || noAnnouncements ? [] : extras.announcements;
  const hosts = episodeId ? null : extras.overrides?.hosts ?? null;
  const links = episodeId ? null : extras.overrides?.links ?? null;
  const contacts = episodeId ? null : extras.overrides?.contacts ?? null;
  if (announcements.length === 0 && polls.length === 0 && !hosts?.length && !links?.length && !contacts?.length) return null;
  return (
    <Box className="gap-section">
      {announcements.map((a) => (
        <Box key={a.id} className="bg-raise gap-hair" style={TILE} accessibilityRole="summary">
          <Type step="tag" className="text-hotText" style={CAPS}>From the host</Type>
          <Type step="note" className="text-text">{a.body}</Type>
        </Box>
      ))}
      {polls.map((p) => <Poll key={p.id} poll={p} onChange={onPoll} />)}
      {hosts?.length ? <Type step="caption" className="text-text2">{`Hosted by ${hosts.join(', ')}`}</Type> : null}
      {links?.length ? (
        <Box className="flex-row flex-wrap gap-section">
          {links.map((l) => (
            <Pressable key={l.url} onPress={() => openLink(l.url)} accessibilityRole="link" accessibilityLabel={`${l.label}, opens ${l.url}`} className="justify-center" style={TAP}>
              <Type step="caption" className="text-hotText font-semibold">{`${l.label} ↗`}</Type>
            </Pressable>
          ))}
        </Box>
      ) : null}
      {contacts?.length ? (
        <Box className="flex-row flex-wrap gap-section">
          {contacts.map((c) => <Contact key={`${c.type}:${c.value}`} type={c.type} value={c.value} />)}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The options this listener chose. M24 fix F-P (US14): a multiple-choice poll sends `myVotes`
 * (every chosen option); a single-choice one `myVote`. An older server sends only `myVote`.
 */
export function chosenOptions(poll: Pick<ShowPoll, 'myVote' | 'myVotes'>): ReadonlySet<number> {
  if (poll.myVotes) return new Set(poll.myVotes);
  return new Set(poll.myVote === undefined || poll.myVote === null ? [] : [poll.myVote]);
}

function Poll({ poll, onChange }: { poll: ShowPoll; onChange: (p: ShowPoll) => void }): React.ReactElement {
  const { api, listener } = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const multi = poll.multi === true;
  const chosen = chosenOptions(poll);
  const voted = chosen.size > 0;
  const showResult = voted || !poll.open;
  // A multiple-choice poll's share is of the listeners who voted (each may choose several).
  const base = multi ? (poll.voters ?? poll.total) : poll.total;
  const vote = async (idx: number) => {
    setBusy(true); setError(undefined);
    try { onChange(await api.votePoll(poll.id, idx)); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <Box className="bg-raise gap-gap" style={TILE}>
      <Type step="tag" className="text-hotText" style={CAPS}>{poll.open ? (multi ? 'Poll from the host · choose any' : 'Poll from the host') : 'Poll closed'}</Type>
      <Type step="lede" className="text-text">{poll.question}</Type>
      {poll.options.map((o) => {
        const share = base ? Math.min(1, o.votes / base) : 0;
        const mine = chosen.has(o.idx);
        // M20 US9 (FR-052): while the poll is open, a result row is tappable to change the vote.
        // M24 fix F-P (US14): on a multiple-choice poll every row toggles — chosen ones too.
        const change = voted && poll.open && listener && (multi || !mine) ? () => { void vote(o.idx); } : undefined;
        const hint = multi ? (change ? (mine ? ', chosen, tap to remove' : ', tap to add') : mine ? ', chosen' : '') : mine ? ', your vote' : change ? ', tap to change your vote' : '';
        return showResult ? (
          <Pressable key={o.idx} disabled={busy || change === undefined} onPress={change} className="gap-hair" style={change ? TAP : undefined}
            accessibilityRole={change ? 'button' : undefined}
            accessibilityState={change ? { selected: mine } : undefined}
            accessibilityLabel={`${o.label}: ${Math.round(share * 100)} percent${hint}`}>
            <Box className="flex-row justify-between">
              <Type step="caption" className={mine ? 'text-text font-bold' : 'text-text'}>{mine ? `${o.label} ✓` : o.label}</Type>
              <Type step="caption" className="text-text2">{`${Math.round(share * 100)}%`}</Type>
            </Box>
            <Box className="rounded-pill bg-barIdle overflow-hidden" style={BAR}><Box className="rounded-pill bg-hot" style={{ ...BAR, width: `${share * 100}%` }} /></Box>
          </Pressable>
        ) : (
          <Pressable key={o.idx} disabled={busy || !listener} onPress={() => { void vote(o.idx); }} accessibilityRole="button" accessibilityLabel={`Vote ${o.label}`}
            className="border border-line rounded-pill px-section justify-center bg-raise2" style={TAP}>
            <Type step="row" className="text-text">{o.label}</Type>
          </Pressable>
        );
      })}
      {!listener && poll.open && !voted ? <Type step="tag" className="text-text3">Sign in to vote.</Type> : null}
      {showResult ? <Type step="tag" className="text-text3">{multi
        ? `${plural(base, 'voter')}${voted && poll.open ? ' · tap an answer to add or remove it' : ''}`
        : `${plural(poll.total, 'vote')}${voted && poll.open ? ' · tap another answer to change your vote' : ''}`}</Type> : null}
      {error ? <Type step="tag" className="text-hotText">{error}</Type> : null}
    </Box>
  );
}
