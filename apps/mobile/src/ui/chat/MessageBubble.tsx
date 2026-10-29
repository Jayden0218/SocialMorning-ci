// One chat message: theirs on a raise bubble, yours hot with void words on the right; an episode as a 236 card with Play.
/**
 * A chat message (owner, 2026-10-04). A shared episode is a small card — artwork, title, show — that opens the episode page.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#chat-thread--screen` `bubble`, `epMsg`): their messages are raise bubbles (radius 18,
 * the corner by the spine 6) at the spine's lane; yours are hot with void words, right-aligned, the lower-right corner 6; both up to
 * 236 wide, padding 10 / 13, Geist 15. An episode is its own 236 card (raise, a 1 px line, radius 18, padding 10): cover 44, title
 * in Geist 600 13, the show in mono 11, and a light 32 Play disc that plays it (a tap on the card opens the episode). Under your
 * newest message, "Seen" (mono 11) once they have opened the conversation. The drawing has no time on a bubble — the node's tick
 * says when — so the per-message clock is gone; `clockOf` stays for the spoken name.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { ChatMessage } from '@/social/chat-api';
import type { EpisodeCard } from '@/social/api';
import { CHAT } from './measures';

/** "14:05" on this phone's clock. */
export function clockOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EpisodeAttachment(props: { episode: EpisodeCard; mine?: boolean; onOpen: (e: EpisodeCard) => void; onPlay?: (e: EpisodeCard) => void }): React.ReactElement {
  return (
    <Box
      testID="chat-episode"
      className={`flex-row items-center bg-raise border border-line ${props.mine ? 'self-end' : 'self-start'}`}
      style={{ width: CHAT.bubbleMax, borderRadius: CHAT.bubbleRadius, padding: CHAT.episodePad, gap: CHAT.episodeGap }}
    >
      <Pressable
        onPress={() => props.onOpen(props.episode)}
        accessibilityRole="button"
        accessibilityLabel={`Open episode ${props.episode.title}, ${props.episode.showTitle}`}
        className="flex-1 flex-row items-center"
        style={{ gap: CHAT.episodeGap }}
      >
        <Artwork url={props.episode.imageUrl} size={CHAT.episodeCover} rounded="row" name={props.episode.showTitle} />
        <Box className="flex-1 min-w-0">
          <Type step="caption" className="text-text font-semibold" numberOfLines={2}>{props.episode.title}</Type>
          <Type step="tag" className="text-text3" numberOfLines={1}>{props.episode.showTitle}</Type>
        </Box>
      </Pressable>
      {props.onPlay ? (
        <Pressable
          onPress={() => props.onPlay?.(props.episode)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${props.episode.title}`}
          hitSlop={8}
          className="bg-text items-center justify-center"
          style={{ width: CHAT.episodePlay, height: CHAT.episodePlay, borderRadius: CHAT.episodePlay / 2, paddingLeft: 2 }}
        >
          <Icon name="play" size={12} color={colour.void} />
        </Pressable>
      ) : null}
    </Box>
  );
}

export function MessageBubble(props: { message: ChatMessage; showRead: boolean; onOpenEpisode: (e: EpisodeCard) => void; onPlayEpisode?: (e: EpisodeCard) => void }): React.ReactElement {
  const m = props.message;
  const mine = m.fromMe;
  return (
    <Box style={{ gap: CHAT.bubbleGap }} testID={mine ? 'chat-mine' : 'chat-theirs'}>
      {m.episode ? <EpisodeAttachment episode={m.episode} mine={mine} onOpen={props.onOpenEpisode} {...(props.onPlayEpisode ? { onPlay: props.onPlayEpisode } : {})} /> : null}
      {m.body !== '' ? (
        <Box
          testID="chat-bubble"
          className={mine ? 'bg-hot self-end' : 'bg-raise self-start'}
          style={{
            maxWidth: CHAT.bubbleMax,
            paddingVertical: CHAT.bubblePadY,
            paddingHorizontal: CHAT.bubblePadX,
            borderRadius: CHAT.bubbleRadius,
            ...(mine ? { borderBottomRightRadius: CHAT.bubbleTail } : { borderBottomLeftRadius: CHAT.bubbleTail }),
          }}
        >
          <Type step="body" className={mine ? 'text-void' : 'text-text'} selectable>{m.body}</Type>
        </Box>
      ) : null}
      {mine && props.showRead && m.read ? <Type step="tag" className="text-text3 self-end">Seen</Type> : null}
    </Box>
  );
}
