/**
 * The clip composer (M4 US1, clarified: two buttons while listening). Reads the player's
 * live position for "Start here" / "End here"; Preview plays the range through the
 * runtime's clip mode; Save hands the range to `clips.create`.
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { usePlayer, usePlayerState, type PlayableEpisode } from '../playback/store';
import { canSave, endHere, nudgeEdge, openComposer, problemText, setCaption, startHere, type ComposerState } from '../graph/composer';
import { mmss } from './format';
import { colour, tabular } from '../design';

export type ClipComposerProps = {
  episode: PlayableEpisode;
  initialPositionMs: number;
  onSave: (s: ComposerState) => void;
  saving: boolean;
};

export function ClipComposer(props: ClipComposerProps): React.ReactElement {
  const player = usePlayer();
  const state = usePlayerState();
  const position: number = 'positionMs' in state && typeof state.positionMs === 'number' ? state.positionMs : props.initialPositionMs;
  const [s, setS] = useState<ComposerState>(() => openComposer(props.episode.id, props.initialPositionMs, props.episode.durationMs));
  const length = Math.round((s.range.endMs - s.range.startMs) / 1000);
  return (
    <View className="p-4 gap-2.5">
      <Text className="text-[18px] font-semibold text-text" numberOfLines={2}>{props.episode.title}</Text>
      <Text className="text-[22px] text-text" style={tabular} accessibilityLabel="Clip range">{mmss(s.range.startMs)} – {mmss(s.range.endMs)} · {length} s</Text>
      <Text className="text-muted">Now at {mmss(position)}</Text>
      <View className="flex-row gap-2 items-center flex-wrap">
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(startHere(s, position))} accessibilityRole="button"><Text>Start here</Text></Pressable>
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(nudgeEdge(s, 'start', -1))} accessibilityRole="button" accessibilityLabel="Start 5 seconds earlier"><Text>−5 s</Text></Pressable>
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(nudgeEdge(s, 'start', 1))} accessibilityRole="button" accessibilityLabel="Start 5 seconds later"><Text>+5 s</Text></Pressable>
      </View>
      <View className="flex-row gap-2 items-center flex-wrap">
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(endHere(s, position))} accessibilityRole="button"><Text>End here</Text></Pressable>
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(nudgeEdge(s, 'end', -1))} accessibilityRole="button" accessibilityLabel="End 5 seconds earlier"><Text>−5 s</Text></Pressable>
        <Pressable className="border border-separator rounded-[20px] px-[14px] py-2" onPress={() => setS(nudgeEdge(s, 'end', 1))} accessibilityRole="button" accessibilityLabel="End 5 seconds later"><Text>+5 s</Text></Pressable>
      </View>
      {s.problem ? <Text className="text-accent">{problemText[s.problem]}</Text> : null}
      <TextInput
        placeholderTextColor={colour.muted}
        className="border border-separator rounded-lg p-2.5 min-h-[60px] text-sm text-text"
        placeholder="Caption (optional)"
        value={s.caption}
        onChangeText={(t) => setS(setCaption(s, t))}
        maxLength={200}
        multiline
        accessibilityLabel="Caption"
      />
      <Text className="text-muted">{s.caption.length} / 200</Text>
      <View className="flex-row gap-2 items-center flex-wrap">
        <Pressable className="border border-separator rounded-3xl px-[18px] py-2.5" onPress={() => player.playClip(props.episode, s.range)} accessibilityRole="button"><Text>Preview</Text></Pressable>
        <Pressable className={`bg-accent rounded-3xl px-[22px] py-2.5 ${!canSave(s) || props.saving ? 'opacity-40' : ''}`} disabled={!canSave(s) || props.saving} onPress={() => props.onSave(s)} accessibilityRole="button">
          <Text className="text-text font-semibold">{props.saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

