// One chat message: yours on the right in yellow, theirs on the left in white; an episode as a card.
/**
 * A chat message (owner, 2026-10-04). Your messages sit on the right on the yellow primary
 * colour, theirs on the left on white with a hairline border. A shared episode is a small card
 * inside the bubble — artwork, show, title — that opens the episode page. Under your newest
 * message, "Read" once the other person has opened the conversation.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import type { ChatMessage } from '@/social/chat-api';
import type { EpisodeCard } from '@/social/api';

const TAP = { minHeight: hit.min };
const MAX = { maxWidth: '80%' as const };

/** "14:05" on this phone's clock. */
export function clockOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EpisodeAttachment(props: { episode: EpisodeCard; onOpen: (e: EpisodeCard) => void }): React.ReactElement {
  return (
    <Pressable
      onPress={() => props.onOpen(props.episode)}
      accessibilityRole="button"
      accessibilityLabel={`Open episode ${props.episode.title}, ${props.episode.showTitle}`}
      className="flex-row items-center gap-row bg-surface border border-border rounded-row p-2"
      style={TAP}
    >
      <Artwork url={props.episode.imageUrl} size={44} rounded="row" name={props.episode.showTitle} />
      <Box className="flex-1">
        <Text className="text-muted text-xs" numberOfLines={1}>{props.episode.showTitle}</Text>
        <Text className="text-text text-sm font-bold" numberOfLines={2}>{props.episode.title}</Text>
      </Box>
    </Pressable>
  );
}

export function MessageBubble(props: { message: ChatMessage; showRead: boolean; onOpenEpisode: (e: EpisodeCard) => void }): React.ReactElement {
  const m = props.message;
  const mine = m.fromMe;
  return (
    <Box className={`px-screen-x py-1 ${mine ? 'items-end' : 'items-start'}`}>
      <Box className={`rounded-row px-row py-2 gap-2 ${mine ? 'bg-primary' : 'bg-surface border border-border'}`} style={MAX}>
        {m.episode ? <EpisodeAttachment episode={m.episode} onOpen={props.onOpenEpisode} /> : null}
        {m.body !== '' ? <Text className={mine ? 'text-onPrimary text-body' : 'text-text text-body'} selectable>{m.body}</Text> : null}
      </Box>
      <Text className="text-muted text-micro mt-0.5">{props.showRead && m.read ? `${clockOf(m.createdAt)} · Read` : clockOf(m.createdAt)}</Text>
    </Box>
  );
}
