// The notice threads you muted, each with Unmute, for Settings › Privacy.
/**
 * M22 US3 (FR-011, T016): a muted thread is a comment thread or a like-post you chose "Mute this"
 * for, from the ⋯ on a notice. Nothing from it is noticed or pushed until you unmute it here
 * (GET / DELETE /v1/me/muted-threads). Same card as "Muted users" above it.
 *
 * M31 W4-D (T053; design-pulse2 `muted-threads--toast`): one raise group (radius 22, 6 / 14 of padding), each row 10 above and below the notice's name in
 * Geist 500 14 on a 1.3 line with a 1 px line between rows, and the "Unmute" chip at its end (32 tall as drawn, its tap area 44 by `hitSlop`); there is no
 * glyph before the name (the drawing has none; F3 removed the old one). The states are one line of text-2 in the same group. The toasts are the kit's (`useToast`): "Unmuted. New notices from it will show again." and the failure line.
 */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { useToast } from '@/ui/shell/providers';
import { useM22SocialApi, type MutedThread } from '@/social/api-m22-social';

/** design-pulse2 `muted-threads--toast`: the group is raise, radius 22, 6 / 14 of padding; a row is 10 above and below, a 1 px line between rows; the chip is 32 tall. */
const GROUP = { borderRadius: ME_MOSAIC.radius, paddingVertical: 6, paddingHorizontal: ME_MOSAIC.pad };
const ROW = { paddingVertical: 10, gap: 10 };
const CHIP = { height: 32, paddingHorizontal: 14 };
/** The drawn chip is 32, so its tap area reaches 44 by `hitSlop` (6 above and below). */
const SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: MutedThread[] };

export function MutedThreads(): React.ReactElement {
  const api = useM22SocialApi();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    api.mutedThreads().then((items) => { if (live) setState({ kind: 'ok', items }); }).catch(() => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [api]);
  const unmute = (t: MutedThread) => {
    if (state.kind !== 'ok') return;
    const before = state.items;
    setState({ kind: 'ok', items: before.filter((x) => !(x.threadKind === t.threadKind && x.threadKey === t.threadKey)) });
    api.unmuteThread(t).then(() => toast('Unmuted. New notices from it will show again.')).catch(() => {
      setState({ kind: 'ok', items: before });
      toast("Couldn't unmute — try again when you're online.");
    });
  };
  const note = (text: string) => <Box style={{ paddingVertical: 14 }}><Type step="note" className="text-text2">{text}</Type></Box>;
  return (
    <Box testID="muted-threads" className="bg-raise" style={GROUP}>
      {state.kind === 'loading' ? note('Loading…')
        : state.kind === 'error' ? note("Couldn't load your muted threads.")
        : state.items.length === 0 ? note('No muted threads. Choose “Mute this” from the ⋯ on a notice to stop notices from one thread.')
        : state.items.map((t, k) => (
          <Box key={`${t.threadKind}:${t.threadKey}`} testID="muted-thread-row" className={`flex-row items-center ${k > 0 ? 'border-t border-line' : ''}`} style={ROW}>
            <Type step="compact" className="text-text font-medium flex-1" numberOfLines={2}>{t.title}</Type>
            <Pressable onPress={() => unmute(t)} accessibilityRole="button" accessibilityLabel={`Unmute ${t.title}`} hitSlop={SLOP} className="rounded-pill flex-row items-center justify-center border bg-raise border-line" style={CHIP}>
              <Type step="caption" className="text-text font-semibold" numberOfLines={1}>Unmute</Type>
            </Pressable>
          </Box>
        ))}
    </Box>
  );
}
