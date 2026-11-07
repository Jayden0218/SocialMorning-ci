// "Not liking these?" under For You, its form page, and the category tiles the interests page shares.
/**
 * M22 US5 (FR-017, FR-019). `GenreTiles`: Apple's categories from the bundled list (works with
 * no network), each a tile that is chosen or not. `RecFeedbackLink`: the line under For You
 * that opens the form page (app/onboarding/not-liking.tsx). `RecFeedbackForm`: four reasons
 * (too familiar, not my topics, too long, other) and a note and the chips to add or remove
 * categories; Send → `POST /v1/me/rec-feedback`, and For You changes on its next refresh.
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `genreTiles`, `interestsPage`, `onboarding-not-liking--screen`): the tiles are the
 * Mosaic of the interests page — two columns, 56 tall, radius 18, 8 apart: the icon (20, hot-text) and the name (Geist 600 13);
 * a chosen tile is the light fill with void words and a tick. "Not liking these?" is the Panel: under the edge labels WHAT'S WRONG,
 * MORE and CATEGORIES, the four reasons as a 2 × 2 of tiles (76, radius 22; the chosen one tinted and ringed in hot 1.5), the
 * "Tell us more…" box (radius 22, up to 300 characters, drawn for every reason — the note is sent with whichever is chosen),
 * "Tap to add or remove." over the categories as chips, and Send (light, 52) in the row under the title (disabled until a reason
 * is chosen). The reasons' icons are Ionicons stand-ins for the drawn ones.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { gutter, spacing } from '@/design';
import { authColour } from '@/design/tokens';
import { Chip } from '@/ui/kit/Chip';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { GENRES } from '@/discover/genres';
import { pickedInterests, savePicked, toggleGenre } from '@/discover/interests';
import { useM22DiscoverApi, type RecFeedbackReason } from '@/social/api-m22-discover';
import { DeckLink } from './Deck';

const NOTE_MAX = 300;

/** The interests page's Mosaic: two columns of 56 tiles (`genreTiles`). A chosen tile is light with a tick. */
export function GenreTiles(props: { picked: readonly number[]; onToggle: (id: number) => void }): React.ReactElement {
  const c = useColours();
  // `grid-template-columns: 1fr 1fr; gap: 8`: each tile is half the room less half the gap, and an odd last one stays in the first column.
  const { width } = useWindowDimensions();
  const tile = (width - gutter(width) * 2 - AUTH.genre.gap) / 2;
  return (
    <Box className="flex-row flex-wrap" style={{ gap: AUTH.genre.gap }}>
      {GENRES.map((g) => {
        const on = props.picked.includes(g.id);
        return (
          <Pressable
            key={g.id}
            onPress={() => props.onToggle(g.id)}
            // Defect 2 (2026-10-07): "checkbox" has no iOS trait, so the tiles were missing from the
            // accessibility tree. A button with the Selected trait is listed and read on both systems.
            accessibilityRole="button"
            accessibilityLabel={g.name}
            accessibilityState={{ selected: on }}
            className={`flex-row items-center ${on ? 'bg-text' : 'bg-raise'}`}
            style={{ width: tile, height: AUTH.genre.height, borderRadius: AUTH.genre.radius, paddingHorizontal: AUTH.genre.padX, gap: spacing.gap + 1 }}
          >
            <Icon name={g.icon} size={AUTH.genre.icon} color={on ? c.void : c.hotText} />
            <Type step="caption" className={on ? 'text-void flex-1 font-semibold' : 'text-text flex-1 font-semibold'} style={AUTH_TYPE.genre} numberOfLines={2}>{g.name}</Type>
            {on ? <Icon name="checkmark" size={AUTH.genre.tick} color={c.void} /> : null}
          </Pressable>
        );
      })}
    </Box>
  );
}

export function RecFeedbackLink(): React.ReactElement {
  return <DeckLink label="Not liking these?" accessibilityLabel="Not liking these? Tell us why" onPress={() => router.push('/onboarding/not-liking')} />;
}

const REASONS: readonly { id: RecFeedbackReason; label: string; icon: IconName }[] = [
  { id: 'familiar', label: 'Too familiar', icon: 'repeat-outline' },
  { id: 'topics', label: 'Not my topics', icon: 'pricetag-outline' },
  { id: 'long', label: 'Too long', icon: 'time-outline' },
  { id: 'other', label: 'Something else', icon: 'ellipsis-horizontal' },
];

/** A section on the Panel: its edge label in the 28 lane at the left, the content beside it. */
function Sec(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box>
      <EdgeLabel label={props.label} top={2} left={-AUTH.panel.lane + 6} />
      {props.children}
    </Box>
  );
}

/** The whole "Not liking these?" page: the reasons, the note, the categories, and Send in the row under the title. */
export function RecFeedbackForm(props: { onSent: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours();
  const api = useM22DiscoverApi();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [before] = useState(() => pickedInterests(stores.settings));
  const [picked, setPicked] = useState<number[]>(before);
  const [reason, setReason] = useState<RecFeedbackReason | undefined>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    const add = picked.filter((g) => !before.includes(g));
    const remove = before.filter((g) => !picked.includes(g));
    try {
      await api.recFeedback({ reason, ...(note.trim() ? { note: note.trim().slice(0, NOTE_MAX) } : {}), ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) });
      savePicked(stores.settings, picked);
      toast('Thanks — For You will change on its next refresh.');
      props.onSent();
    } catch {
      toast("Couldn't send — try again when you're online.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <OverlayPage
      title="Not liking these?"
      subtitle="Your answer changes For You on its next refresh."
      size={28}
      onBack={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
      foot={<PulseButton label="Send" accessibilityLabel="Send what's wrong with For You" kind="light" height={AUTH.foot.button} className="flex-1" disabled={!reason} busy={busy} onPress={() => void send()} />}
    >
      {(l) => (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: l.top + AUTH.bodyTop, paddingBottom: l.reserve, paddingLeft: AUTH.panel.lane, paddingRight: Math.min(gutter(width), spacing.section), gap: AUTH.bodyGap }}>
          <Sec label="What's wrong">
            <Box className="flex-row flex-wrap justify-between" style={{ rowGap: AUTH.panel.tileGap }}>
              {REASONS.map((r) => {
                const on = reason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setReason(r.id)}
                    accessibilityRole="radio"
                    accessibilityLabel={r.label}
                    accessibilityState={{ selected: on }}
                    className="justify-between"
                    style={{ width: '48.5%', height: AUTH.reason.height, borderRadius: AUTH.reason.radius, paddingVertical: AUTH.reason.padY, paddingHorizontal: AUTH.reason.padX, backgroundColor: on ? authColour.reasonOn : c.raise, ...(on ? { borderWidth: AUTH.reason.ring, borderColor: c.hot } : null) }}
                  >
                    <Icon name={r.icon} size={AUTH.reason.icon} color={on ? c.hotText : c.text} />
                    <Type step="compact" className="text-text" style={AUTH_TYPE.reason}>{r.label}</Type>
                  </Pressable>
                );
              })}
            </Box>
          </Sec>
          <Sec label="More">
            <Textarea className="bg-raise border-0 h-auto" style={{ minHeight: AUTH.note.minHeight, borderRadius: AUTH.note.radius }}>
              <TextareaInput value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline placeholder="Tell us more…" placeholderTextColor={c.text3} textAlignVertical="top" keyboardAppearance="dark" accessibilityLabel="Tell us more" className="text-text font-medium" style={{ padding: AUTH.note.pad, ...AUTH_TYPE.field }} />
            </Textarea>
          </Sec>
          <Sec label="Categories">
            <Box style={{ gap: spacing.gap }}>
              <Type step="caption" className="text-text2" style={AUTH_TYPE.fieldNote}>Tap to add or remove.</Type>
              <Box className="flex-row flex-wrap" style={{ gap: spacing.gap }}>
                {GENRES.map((g) => <Chip key={g.id} label={g.name} chosen={picked.includes(g.id)} onPress={() => setPicked((p) => toggleGenre(p, g.id))} />)}
              </Box>
            </Box>
          </Sec>
        </ScrollView>
      )}
    </OverlayPage>
  );
}
