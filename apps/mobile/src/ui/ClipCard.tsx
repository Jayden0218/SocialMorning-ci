/** One clip: caption, author (a profile link), range, and the actions the viewer may take. */
import { Pressable, Text, View } from 'react-native';
import { tabular } from '../design';
import { Link } from 'expo-router';
import type { Clip } from '../social/api';
import { mmss } from './format';

export type ClipCardProps = {
  clip: Clip;
  pending?: boolean;
  onPlay?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
};

export function ClipCard(props: ClipCardProps): React.ReactElement {
  const { clip } = props;
  // M6 (FR-002/FR-013): a clip the viewer reported, or one moderation removed, keeps its place as a line of text.
  if (clip.reported || clip.removed) {
    return (
      <View className="py-2.5 border-b-hairline border-separator gap-1">
        <Text className="text-muted">{clip.reported ? 'You reported this' : 'Removed by moderation'}</Text>
      </View>
    );
  }
  return (
    <View className="py-2.5 border-b-hairline border-separator gap-1" accessibilityLabel={`Clip ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`}>
      <Pressable onPress={props.onPlay} disabled={!props.onPlay} accessibilityRole="button">
        <Text className="font-semibold text-text" style={tabular}>{mmss(clip.startMs)} – {mmss(clip.endMs)}{props.pending ? ' · sending…' : ''}{clip.deleted ? ' · removed' : ''}</Text>
        {clip.caption ? <Text className="text-sm text-text">{clip.caption}</Text> : null}
      </Pressable>
      <View className="flex-row gap-4 items-center">
        {clip.author.displayName !== null && !props.pending ? (
          <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
            {/* A name is not an action (owner's K1 note, 2026-09-25): it takes the text colour, not the accent. */}
            <Pressable accessibilityRole="link"><Text className="text-text">by {clip.author.displayName}</Text></Pressable>
          </Link>
        ) : <Text className="text-muted">{props.pending ? 'by you' : 'by a deleted account'}</Text>}
        {props.onShare ? <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this clip"><Text className="text-accent">Share</Text></Pressable> : null}
        {props.onDelete ? <Pressable onPress={props.onDelete} accessibilityRole="button" accessibilityLabel="Delete this clip"><Text className="text-accent">Delete</Text></Pressable> : null}
        {props.onReport ? <Pressable onPress={props.onReport} accessibilityRole="button" accessibilityLabel="Report this clip"><Text className="text-muted">Report</Text></Pressable> : null}
      </View>
    </View>
  );
}

