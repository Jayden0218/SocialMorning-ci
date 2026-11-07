// Saved moments as a deck of cards; play from there, edit the note, delete.
/**
 * Saved moments (M10): the times you saved while listening, each with its note. Tapping
 * one plays the episode from that moment. Notes can be edited or the moment deleted.
 * The reference sells this as PLUS; here it is free (constitution: everything free).
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `moments--screen`, `moments--empty`, `moments--edit-note`,
 * `toast--moments`; layout pattern Deck): a row of 290 × 360 cards that snap one at a time, with dots under them. A
 * card's cover is 130 tall with the moment's time on it in Unbounded 800 32; under it the show, the episode's title
 * (Unbounded 700 16) and your note in italics — or "No note"; tapping the note opens the editor. The foot holds Edit
 * note and Delete moment (40 circles) and the light "From 12:32" pill, which plays the episode from there. Editing turns
 * the foot into the note field (a hot 1.5 ring) with Cancel and Save. A moment whose episode left the phone has a grey
 * cover and "Episode not on this phone" in hot text; Play says so in a toast. The title bar is low: "Saved moments", the
 * count and a search circle that opens the field above it. Same actions, names and handlers as before.
 *
 * Not as drawn: no RN text-shadow blur on the cover's time beyond the scrim shadow; the keyboard lifts the whole page.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { deleteMoment, editMoment, listMoments, NOTE_MAX, type Moment } from '@/me/moments';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { mmss } from '@/ui/kit/format';
import { useStores, useToast } from '@/ui/shell/providers';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { CoverBand } from '@/ui/discover/Deck';
import { plural } from '@socialmorning/social-core';
// M22 US17 item 16 / FR-027: the same search as History.
import { matchesAll } from '@/me/history';
import { ME_TYPE } from '@/ui/me/measures';
import { CardDeck, DRAWN, emptyTop, KeyboardPage, LIST, PageEmpty, round, SearchField, slop } from '@/ui/me/lists';

/** The deck's card: 360 tall, radius 26, a line round it; the cover is 130; the body pads 14 with 8 between parts. */
const CARD = { height: 360, radius: 26, cover: 130, pad: 14, gap: spacing.gap, tool: 40, from: 44 } as const;
/** The deck starts 110 from the top of the drawn phone, 60 under its status bar. */
const DECK_TOP = 110;

export default function MomentsScreen(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const toast = useToast();
  const [rows, setRows] = useState<Moment[]>(() => listMoments(stores.settings));
  const [editing, setEditing] = useState<{ id: string; note: string } | undefined>();
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  // M32 T091: each moment's episode and show title are read when the rows change, not on every render.
  const lookup = useMemo(() => new Map(rows.map((m) => {
    const e = stores.feeds.getEpisode(m.episodeId);
    const show = e ? stores.feeds.getShow(e.feedUrl) : undefined;
    return [m.episodeId, { e, show, showTitle: show?.title }] as const;
  })), [rows, stores]);
  const shown = useMemo(() => rows.filter((m) => {
    const l = lookup.get(m.episodeId);
    return matchesAll(term, [l?.e?.title, l?.showTitle, m.note]);
  }), [rows, lookup, term]);
  const reload = useCallback(() => setRows(listMoments(stores.settings)), [stores]);
  useFocusEffect(reload);

  const play = (m: Moment) => {
    const p = toPlayable(stores, m.episodeId);
    if (!p) { toast("That episode isn't on this phone any more."); return; }
    // The episode page's pattern: load, then seek to the moment.
    player.load(p, 'play');
    player.seek(m.atMs);
  };

  const card = (item: Moment) => {
    const l = lookup.get(item.episodeId);
    const e = l?.e;
    const show = l?.show;
    const missing = e === undefined;
    const editingThis = editing?.id === item.id;
    return (
      <Box testID="moment-card" className="bg-raise border border-line overflow-hidden" style={{ height: CARD.height, borderRadius: CARD.radius }}>
        <Box style={{ height: CARD.cover }} className={missing ? 'bg-raise2' : ''}>
          {missing ? null : <CoverBand url={e.imageUrl ?? show?.imageUrl} name={show?.title ?? e.title} height={CARD.cover} />}
          <Type step="hero" className="text-text absolute" style={[ME_TYPE.momentTime, { left: spacing.row, bottom: spacing.row, textShadowColor: colour.scrim, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 }]} accessible={false}>{mmss(item.atMs)}</Type>
        </Box>
        <Box className="flex-1" style={{ padding: CARD.pad, gap: CARD.gap }}>
          <Type step="caption" className={missing ? 'text-hotText' : 'text-text2'} style={ME_TYPE.node12} numberOfLines={1}>{missing ? 'Episode not on this phone' : show?.title ?? ''}</Type>
          <Type step="lede" className="text-text" style={ME_TYPE.cardTitle16} numberOfLines={2}>{e?.title ?? 'Episode not on this phone'}</Type>
          {editingThis ? (
            <>
              <Textarea className="bg-raise2 border-hot h-auto" style={{ borderRadius: 14, borderWidth: 1.5, minHeight: 70 }}>
                <TextareaInput value={editing.note} onChangeText={(note) => setEditing({ id: item.id, note })} maxLength={NOTE_MAX} multiline autoFocus placeholder="Your note" placeholderTextColor={colour.text3} accessibilityLabel="Note" className="text-text text-pulse-body" style={{ padding: spacing.row - 2 }} />
              </Textarea>
              <Box className="flex-row mt-auto" style={{ gap: spacing.gap }}>
                <Pressable onPress={() => setEditing(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="flex-1 bg-raise items-center justify-center rounded-pill" style={{ height: CARD.tool }}><Type step="row" className="text-text">Cancel</Type></Pressable>
                <Pressable onPress={() => { editMoment(stores.settings, item.id, editing.note); setEditing(undefined); reload(); }} accessibilityRole="button" accessibilityLabel="Save note" className="flex-1 bg-text items-center justify-center rounded-pill" style={{ height: CARD.tool }}><Type step="row" className="text-void">Save</Type></Pressable>
              </Box>
            </>
          ) : (
            <>
              <Pressable onPress={() => setEditing({ id: item.id, note: item.note })} accessibilityRole="button" accessibilityLabel={`${item.note || 'No note'}. Edit note`} hitSlop={spacing.hair}>
                {item.note ? <Type step="quote" className="text-quote italic" numberOfLines={4}>{`“${item.note}”`}</Type> : <Type step="quote" className="text-text3 italic" numberOfLines={1}>No note</Type>}
              </Pressable>
              <Box className="flex-row items-center mt-auto" style={{ gap: spacing.gap }}>
                <Pressable onPress={() => setEditing({ id: item.id, note: item.note })} accessibilityRole="button" accessibilityLabel="Edit note" hitSlop={slop(CARD.tool)} className="bg-raise2 items-center justify-center" style={round(CARD.tool)}>
                  <Icon name="pencil-outline" size={18} color={colour.text} />
                </Pressable>
                <Pressable onPress={() => { deleteMoment(stores.settings, item.id); reload(); }} accessibilityRole="button" accessibilityLabel="Delete moment" hitSlop={slop(CARD.tool)} className="bg-raise2 items-center justify-center" style={round(CARD.tool)}>
                  <Icon name="trash-outline" size={18} color={colour.text} />
                </Pressable>
                <Box className="flex-1" />
                <Pressable onPress={() => play(item)} accessibilityRole="button" accessibilityLabel={`Play ${e?.title ?? 'episode'} from ${mmss(item.atMs)}`} className="bg-text flex-row items-center justify-center rounded-pill" style={{ height: CARD.from, paddingHorizontal: spacing.section, gap: spacing.hair + 2 }}>
                  <Icon name="play" size={14} color={colour.void} />
                  <Type step="row" className="text-void">{`From ${mmss(item.atMs)}`}</Type>
                </Pressable>
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <KeyboardPage>
      <PushedPage
        title="Saved moments"
        {...(rows.length > 0 ? { subtitle: plural(rows.length, 'moment') } : {})}
        actions={rows.length > 0 ? [{ icon: 'search-outline', label: 'Search your saved moments', onPress: () => { if (searching) setTerm(''); setSearching(!searching); } }] : []}
        {...(searching ? { extra: <SearchField value={term} onChange={setTerm} placeholder="Search your saved moments" autoFocus />, extraAbove: LIST.field + spacing.gap } : {})}
      >
        {(layout) => (
          <Box className="flex-1" style={{ paddingTop: layout.top + (DECK_TOP - DRAWN.status) }}>
            {shown.length === 0 ? (
              <PageEmpty
                top={emptyTop(260) - (DECK_TOP - DRAWN.listTop)}
                title={rows.length > 0 ? 'Nothing matches' : 'No saved moments'}
                {...(rows.length > 0 ? {} : { line: 'No saved moments — tap “Save moment” while listening' })}
              />
            ) : (
              <CardDeck count={shown.length} height={CARD.height} label="Saved moments" card={(i) => card(shown[i]!)} />
            )}
          </Box>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
