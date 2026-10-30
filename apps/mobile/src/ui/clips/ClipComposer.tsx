// Make a clip: set start and end while listening, preview, add caption, save.
/**
 * The clip composer (M4 US1, clarified: two buttons while listening). Reads the player's
 * live position for "Start here" / "End here"; Preview plays the range through the
 * runtime's clip mode; Save hands the range to `clips.create`.
 *
 * M17 (`ClipNew-B`): "From <episode>", then a range card (the length in serif, "Now at",
 * a strip showing the range, its edges and the play position), then Start and End side by
 * side as two cards (serif time, −5 s / +5 s pills, a tinted "Start here" / "End here"
 * pill), the caption box, and Preview + Save as a bar at the foot. The strip is drawn from
 * the range alone — the app has no waveform data, so it shows no fake peaks.
 */
import { useState } from 'react';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { BusyContent } from '@/ui/kit/BusyContent';
import { ScrollView } from '@/ui/lib/scroll-view';
import { usePlayer, usePlayerState, type PlayableEpisode } from '@/playback/store';
import { canSave, endHere, nudgeEdge, openComposer, problemText, setCaption, startHere, type ComposerState } from '@/graph/composer';
import { mmss } from '@/ui/kit/format';
import { hit, tabular } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Icon } from '@/ui/kit/Icon';

export type ClipComposerProps = {
  episode: PlayableEpisode;
  initialPositionMs: number;
  /** M22 US9: lines picked in the transcript — the composer opens on this range with this caption. */
  initialRange?: { startMs: number; endMs: number };
  initialCaption?: string;
  onSave: (s: ComposerState) => void;
  saving: boolean;
};

const TAP = { minHeight: hit.min };
const NUDGE = 'flex-1 border border-border rounded-pill items-center justify-center';
const HERE = 'bg-accentTint rounded-pill items-center justify-center';

/** The strip's window: the range with some context either side, inside the episode. */
function windowOf(lo: number, hi: number, durationMs?: number): { from: number; to: number } {
  const pad = Math.max(15_000, Math.round((hi - lo) * 0.5));
  const from = Math.max(0, lo - pad);
  const to = durationMs && durationMs > 0 ? Math.min(durationMs, hi + pad) : hi + pad;
  return { from, to: Math.max(to, from + 1) };
}

export function ClipComposer(props: ClipComposerProps): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const state = usePlayerState();
  const position: number = 'positionMs' in state && typeof state.positionMs === 'number' ? state.positionMs : props.initialPositionMs;
  const [s, setS] = useState<ComposerState>(() => openComposer(props.episode.id, props.initialPositionMs, props.episode.durationMs, {
    ...(props.initialRange ? { range: props.initialRange } : {}),
    ...(props.initialCaption ? { caption: props.initialCaption } : {}),
  }));
  const length = Math.round((s.range.endMs - s.range.startMs) / 1000);
  const lo = Math.min(s.range.startMs, s.range.endMs);
  const hi = Math.max(s.range.startMs, s.range.endMs);
  const w = windowOf(lo, hi, props.episode.durationMs);
  const span = w.to - w.from;
  const pct = (ms: number): `${number}%` => `${Math.min(100, Math.max(0, ((ms - w.from) / span) * 100))}%`;
  const width: `${number}%` = `${Math.max(1, ((hi - lo) / span) * 100)}%`;
  const nowIn = position >= w.from && position <= w.to;
  const blocked = !canSave(s) || props.saving;
  return (
    <Box className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-1 pb-section gap-row" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text className="text-muted text-body" numberOfLines={2}>From <Text className="text-text text-body font-bold">{props.episode.title}</Text></Text>

        <Card className="pt-section pb-row gap-gap">
          <Box className="flex-row justify-between items-baseline">
            <Text className="text-text text-hero font-display" style={tabular} accessibilityLabel={`Clip range ${mmss(s.range.startMs)} to ${mmss(s.range.endMs)}, ${length} seconds`}>{length} s</Text>
            <Text className="text-muted text-meta" style={tabular}>Now at {mmss(position)}</Text>
          </Box>
          <Box className="h-11 justify-center" accessible={false}>
            <Box className="h-2 rounded-pill bg-track" />
            <Box className="absolute h-7 rounded-row bg-accent" style={{ left: pct(lo), width }} />
            <Box className="absolute top-0 bottom-0 w-[3px] rounded-pill bg-text" style={{ left: pct(lo) }} />
            <Box className="absolute top-0 bottom-0 w-[3px] rounded-pill bg-text" style={{ left: pct(hi) }} />
            {nowIn ? <Box className="absolute -top-1 -bottom-1 w-px bg-primary" style={{ left: pct(position) }} /> : null}
          </Box>
          <Box className="flex-row justify-between">
            <Text className="text-muted text-xs" style={tabular}>{mmss(w.from)}</Text>
            <Text className="text-muted text-xs" style={tabular}>{mmss(w.to)}</Text>
          </Box>
        </Card>

        <Box className="flex-row gap-gap">
          <Card className="flex-1 py-section gap-gap">
            <Eyebrow>Start</Eyebrow>
            <Text className="text-text text-lg font-display" style={tabular}>{mmss(s.range.startMs)}</Text>
            <Box className="flex-row gap-gap">
              <Pressable
                className={NUDGE}
                style={TAP}
                onPress={() => setS(nudgeEdge(s, 'start', -1))}
                accessibilityRole="button"
                accessibilityLabel="Start 5 seconds earlier"
              >
                <Text className="text-text text-body font-semibold">−5 s</Text>
              </Pressable>
              <Pressable
                className={NUDGE}
                style={TAP}
                onPress={() => setS(nudgeEdge(s, 'start', 1))}
                accessibilityRole="button"
                accessibilityLabel="Start 5 seconds later"
              >
                <Text className="text-text text-body font-semibold">+5 s</Text>
              </Pressable>
            </Box>
            <Pressable
              className={HERE}
              style={TAP}
              onPress={() => setS(startHere(s, position))}
              accessibilityRole="button"
              accessibilityLabel="Start here"
            >
              <Text className="text-accent text-body font-bold">Start here</Text>
            </Pressable>
          </Card>
          <Card className="flex-1 py-section gap-gap">
            <Eyebrow>End</Eyebrow>
            <Text className="text-text text-lg font-display" style={tabular}>{mmss(s.range.endMs)}</Text>
            <Box className="flex-row gap-gap">
              <Pressable
                className={NUDGE}
                style={TAP}
                onPress={() => setS(nudgeEdge(s, 'end', -1))}
                accessibilityRole="button"
                accessibilityLabel="End 5 seconds earlier"
              >
                <Text className="text-text text-body font-semibold">−5 s</Text>
              </Pressable>
              <Pressable
                className={NUDGE}
                style={TAP}
                onPress={() => setS(nudgeEdge(s, 'end', 1))}
                accessibilityRole="button"
                accessibilityLabel="End 5 seconds later"
              >
                <Text className="text-text text-body font-semibold">+5 s</Text>
              </Pressable>
            </Box>
            <Pressable
              className={HERE}
              style={TAP}
              onPress={() => setS(endHere(s, position))}
              accessibilityRole="button"
              accessibilityLabel="End here"
            >
              <Text className="text-accent text-body font-bold">End here</Text>
            </Pressable>
          </Card>
        </Box>

        {s.problem ? <Text className="text-accent text-body">{problemText[s.problem]}</Text> : null}

        <Box className="gap-gap">
          <Text className="text-text text-meta font-bold">Caption <Text className="text-muted text-meta font-medium">(optional)</Text></Text>
          <Textarea className="bg-surface border border-border rounded-row min-h-[72px] h-auto">
          <TextareaInput
            placeholderTextColor={c.muted}
            className="p-row text-body text-text"
            placeholder="Caption (optional)"
            value={s.caption}
            onChangeText={(t) => setS(setCaption(s, t))}
            maxLength={200}
            multiline
            accessibilityLabel="Caption"
          />
          </Textarea>
          <Text className="text-muted text-xs text-right" style={tabular}>{s.caption.length} / 200</Text>
        </Box>
      </ScrollView>

      <Box className="flex-row gap-gap items-center px-screen-x py-row bg-background border-t-hairline border-separator">
        <Pressable
          className="flex-row gap-gap bg-surface border border-border rounded-pill px-section items-center justify-center"
          style={TAP}
          onPress={() => player.playClip(props.episode, s.range)}
          accessibilityRole="button"
          accessibilityLabel="Preview"
        >
          <Icon name="play" size={14} color={c.text} />
          <Text className="text-text text-body font-bold">Preview</Text>
        </Pressable>
        <Pressable
          className={`flex-1 bg-primary rounded-pill px-section items-center justify-center ${blocked && !props.saving ? 'opacity-40' : ''}`}
          style={TAP}
          disabled={blocked}
          onPress={() => props.onSave(s)}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked, busy: props.saving === true }}
        >
          <BusyContent busy={props.saving === true} barClassName="bg-onPrimary">
            <Text className="text-onPrimary text-body font-bold">Save</Text>
          </BusyContent>
        </Pressable>
      </Box>
    </Box>
  );
}
