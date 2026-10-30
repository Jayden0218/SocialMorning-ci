// "Not liking these?" under For You, its form, and the category tiles the interests page shares.
/**
 * M22 US5 (FR-017, FR-019). `GenreTiles`: Apple's categories from the bundled list (works with
 * no network), each a 48 pt tile that is chosen or not. `RecFeedbackLink`: the line under For You
 * that opens the form page (app/onboarding/not-liking.tsx). `RecFeedbackForm`: four reasons
 * (too familiar, not my topics, too long, other + text) and the tiles to add or remove
 * categories; Send → `POST /v1/me/rec-feedback`, and For You changes on its next refresh.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Button } from '@/ui/kit/Button';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { GENRES } from '@/discover/genres';
import { pickedInterests, savePicked, toggleGenre } from '@/discover/interests';
import { useM22DiscoverApi, type RecFeedbackReason } from '@/social/api-m22-discover';

const TAP = { minHeight: hit.min };
const NOTE_MAX = 300;

export function GenreTiles(props: { picked: readonly number[]; onToggle: (id: number) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="flex-row flex-wrap gap-gap">
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
            className={`flex-row items-center gap-2 px-row rounded-pill border ${on ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
            style={TAP}
          >
            <Icon name={g.icon} size={18} color={on ? c.onPrimary : c.accent} />
            <Text className={on ? 'text-onPrimary text-body font-semibold' : 'text-text text-body'}>{g.name}</Text>
          </Pressable>
        );
      })}
    </Box>
  );
}

/** The line under For You. */
export function RecFeedbackLink(): React.ReactElement {
  return (
    <Pressable onPress={() => router.push('/onboarding/not-liking')} accessibilityRole="link" accessibilityLabel="Not liking these? Tell us why" className="self-start justify-center px-screen-x" style={TAP}>
      <Text className="text-accent text-meta font-semibold">Not liking these?</Text>
    </Pressable>
  );
}

const REASONS: readonly { id: RecFeedbackReason; label: string }[] = [
  { id: 'familiar', label: 'Too familiar' },
  { id: 'topics', label: 'Not my topics' },
  { id: 'long', label: 'Too long' },
  { id: 'other', label: 'Something else' },
];

export function RecFeedbackForm(props: { onSent: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const api = useM22DiscoverApi();
  const toast = useToast();
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
    <Box className="gap-section">
      <Eyebrow>What's wrong?</Eyebrow>
      <Box className="gap-gap">
        {REASONS.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setReason(r.id)}
            accessibilityRole="radio"
            accessibilityLabel={r.label}
            accessibilityState={{ selected: reason === r.id }}
            className={`flex-row items-center gap-row px-section rounded-row border ${reason === r.id ? 'bg-accentTint border-accent' : 'bg-surface border-border'}`}
            style={TAP}
          >
            <Icon name={reason === r.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r.id ? c.accent : c.muted} />
            <Text className="text-text text-body flex-1">{r.label}</Text>
          </Pressable>
        ))}
      </Box>
      {reason === 'other' ? (
        <Textarea className="bg-surface border border-border rounded-row min-h-24 h-auto">
          <TextareaInput value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline placeholder="Tell us more…" placeholderTextColor={c.muted} textAlignVertical="top" accessibilityLabel="Tell us more" className="p-section text-text text-body" />
        </Textarea>
      ) : null}
      <Eyebrow>Categories you like</Eyebrow>
      <Text className="text-muted text-meta">Tap to add or remove.</Text>
      <GenreTiles picked={picked} onToggle={(id) => setPicked((p) => toggleGenre(p, id))} />
      <Button label="Send" onPress={() => void send()} disabled={!reason} busy={busy} accessibilityLabel="Send what's wrong with For You" />
    </Box>
  );
}
