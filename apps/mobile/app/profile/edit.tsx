// Edit profile: photo, name, short bio, optional age range, gender, birthday and industry, and whether likes are public.
/**
 * M19 T013 (US1, FR-001–FR-008): your own profile, edited. A square photo (picked with the
 * system crop, shrunk to 400 px and ≤ 200 KB on the phone), the name (1–30), a short bio
 * (≤ 160), an age range and a gender — both optional, never shown on the profile, creators see
 * only totals of 10 or more — and the "Likes are public" switch. Save sends the text first,
 * then the photo, then says so and goes back.
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile-edit--screen`, `--signed-out`, `--load-failed`, `--toast`; layout pattern Panel): your photo
 * (88, a 3 light ring) over the chips "Change photo" (or "Add photo") and "Remove photo"; under the edge labels "About you" and "Private" the
 * fields are tiles (radius 20, padding 12 / 14): Name (count, hot "A name is needed"), Bio (count), Age range and Gender as small chips, then
 * Birthday and Industry; "Likes are public" is a tile with its switch after Gender. The title bar is back, "Edit profile" (26) and a hot
 * Save on the right, dimmed until something changed and while the name is empty or the birthday malformed. Signed out: a lock disc and
 * "Sign in to edit your profile." with a light Sign in; a failed load: the disc, "Couldn't load your profile right now." and Retry.
 * Leaving with changes drops them (today's behaviour). Not as drawn: Save is 48 tall (the drawing's 44 is under the touch floor).
 * M21 US8 (FR-075): an optional birthday (typed as YYYY-MM-DD — our own field, no system date
 * picker) and industry (≤ 40). Both are private: the server returns them to you alone (G-M21-10).
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Input, InputField } from '@/ui/lib/input';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { colour } from '@/design';
import { goBack } from '@/ui/kit/PageHeader';
import { PushedPage } from '@/ui/kit/PushedPage';
import { PageGlow } from '@/ui/kit/PageGlow';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { Loader } from '@/ui/kit/Loader';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { AGE_RANGES, BIO_MAX, GENDERS, INDUSTRY_MAX, NAME_MAX, birthdayOk, useProfileApi, type AgeRange, type Gender } from '@/social/profile-api';
import { avatarBytes, pickAvatar } from '@/social/avatar-image';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { DRAWN, KeyboardPage } from '@/ui/me/lists';
import { CenterBlock, IconBlock } from '@/ui/profile/parts';
import { CameraMark, ChipText, FieldTile, PhotoRing, photoChip, smallChip } from '@/ui/profile/EditParts';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';

const AGE_LABEL: Record<AgeRange, string> = { under18: 'Under 18', '18-24': '18–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55+': '55+' };
const GENDER_LABEL: Record<Gender, string> = { woman: 'Woman', man: 'Man', another: 'Another', unsaid: 'Prefer not to say' };

const asAge = (v: string | null | undefined): AgeRange | null => ((AGE_RANGES as readonly string[]).includes(v ?? '') ? (v as AgeRange) : null);
const asGender = (v: string | null | undefined): Gender | null => ((GENDERS as readonly string[]).includes(v ?? '') ? (v as Gender) : null);

type Photo = { kind: 'server'; url?: string } | { kind: 'picked'; uri: string } | { kind: 'removed' };
/** What the form held when it loaded: Save stays dim until something differs from it. */
type Saved = { name: string; bio: string; age: AgeRange | null; gender: Gender | null; likesPublic: boolean; birthday: string; industry: string };

export default function EditProfileScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const { listener, refreshListener } = useSocial();
  const profileApi = useProfileApi();
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'error'>('loading');
  const [name, setName] = useState(listener?.displayName ?? '');
  const [bio, setBio] = useState('');
  const [age, setAge] = useState<AgeRange | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [likesPublic, setLikesPublic] = useState(true);
  const [birthday, setBirthday] = useState('');
  const [industry, setIndustry] = useState('');
  const [photo, setPhoto] = useState<Photo>({ kind: 'server' });
  const [saved, setSaved] = useState<Saved | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = () => {
    setLoaded('loading');
    profileApi.me().then((me) => {
      setName(me.displayName);
      setBio(me.bio ?? '');
      setAge(asAge(me.ageRange));
      setGender(asGender(me.gender));
      setLikesPublic(me.likesPublic !== false);
      setBirthday(me.birthday ?? '');
      setIndustry(me.industry ?? '');
      setPhoto(me.avatarUrl ? { kind: 'server', url: me.avatarUrl } : { kind: 'server' });
      setSaved({ name: me.displayName, bio: me.bio ?? '', age: asAge(me.ageRange), gender: asGender(me.gender), likesPublic: me.likesPublic !== false, birthday: me.birthday ?? '', industry: me.industry ?? '' });
      setLoaded('ok');
    }).catch(() => setLoaded('error'));
  };
  useEffect(() => { if (listener) load(); }, [listener?.listenerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownUrl = photo.kind === 'picked' ? photo.uri : photo.kind === 'server' ? photo.url : undefined;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const bday = birthday.trim();
  const bdayOk = bday === '' || birthdayOk(bday, new Date());
  const changed = photo.kind !== 'server' || saved === undefined || name !== saved.name || bio !== saved.bio || age !== saved.age || gender !== saved.gender
    || likesPublic !== saved.likesPublic || birthday !== saved.birthday || industry !== saved.industry;

  const choosePhoto = async () => {
    setError(undefined);
    try {
      const r = await pickAvatar();
      if (r.kind === 'ok') setPhoto({ kind: 'picked', uri: r.uri });
      else if (r.kind === 'denied') setError('Allow photo access in the phone settings to choose a photo.');
      else if (r.kind === 'too-big') setError('That photo is too large even after shrinking — try another.');
    } catch {
      setError("Couldn't open that photo — try another.");
    }
  };

  const save = async () => {
    if (!nameOk || !bdayOk || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const me = await profileApi.update({ displayName: trimmed, bio: bio.trim().slice(0, BIO_MAX), ageRange: age, gender, likesPublic,
        birthday: bday === '' ? null : bday, industry: industry.trim() === '' ? null : industry.trim().slice(0, INDUSTRY_MAX) });
      if (photo.kind === 'picked') await profileApi.uploadAvatar(await avatarBytes(photo.uri));
      else if (photo.kind === 'removed') await profileApi.removeAvatar();
      // The name shown across the app (Me, comments you write) comes from the signed-in row.
      const row = stores.auth.get();
      if (row) { stores.auth.set({ listenerId: row.listenerId, displayName: me.displayName || trimmed, email: row.email }, row.signedInAt); refreshListener(); }
      toast('Profile saved');
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? (e.code === 'network' ? "Couldn't reach the server — try again." : e.status === 413 ? 'That photo is too large.' : e.message) : "That didn't save — try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveButton = <PulseButton label="Save" kind="hot" onPress={() => void save()} disabled={!nameOk || !bdayOk || !changed} busy={busy} />;
  const lane = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: PROFILE.fieldGap } as const;
  const chips = { flexDirection: 'row', flexWrap: 'wrap', gap: PROFILE.chipGap } as const;

  return (
    <KeyboardPage>
      <PushedPage title="Edit profile" size={26} tone="none" {...(listener && loaded === 'ok' ? { right: saveButton } : {})}>
        {(layout) => {
          const top = layout.top + (PROFILE.photoTop - DRAWN.status);
          if (!listener) {
            return <Box className="flex-1"><CenterBlock top={layout.top} drawn={250}><IconBlock icon="lock-closed-outline" line="Sign in to edit your profile."><PulseButton label="Sign in" kind="light" onPress={() => router.push('/auth/sign-in')} full /></IconBlock></CenterBlock></Box>;
          }
          if (loaded === 'loading') return <Box className="flex-1 items-center" style={{ paddingTop: top }}><Loader /></Box>;
          if (loaded === 'error') {
            return <Box className="flex-1"><CenterBlock top={layout.top} drawn={260}><IconBlock icon="wifi" failure line="Couldn't load your profile right now."><PulseButton label="Retry" kind="light" onPress={load} full /></IconBlock></CenterBlock></Box>;
          }
          return (
            <Box className="flex-1">
              <PageGlow top={-260} strength={0.3} />
              <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve, gap: PROFILE.formTop - PROFILE.photoTop - PROFILE.photo - PROFILE.photoGap - PROFILE.photoChip }}>
                <Box className="items-center" style={{ gap: PROFILE.photoGap }} testID="photo-block">
                  <PhotoRing url={shownUrl} name={trimmed || listener.displayName} />
                  <Box className="flex-row" style={{ gap: PROFILE.chipGap + 2 }}>
                    <Pressable onPress={() => void choosePhoto()} accessibilityRole="button" accessibilityLabel={shownUrl ? 'Change photo' : 'Add photo'} {...photoChip}>
                      <CameraMark />
                      <Type step="caption" className="text-text font-semibold">{shownUrl ? 'Change photo' : 'Add photo'}</Type>
                    </Pressable>
                    {shownUrl ? (
                      <Pressable onPress={() => setPhoto({ kind: 'removed' })} accessibilityRole="button" accessibilityLabel="Remove photo" {...photoChip}>
                        <Type step="caption" className="text-text2 font-semibold">Remove photo</Type>
                      </Pressable>
                    ) : null}
                  </Box>
                </Box>

                <Box style={{ gap: PROFILE.fieldGap }}>
                  <Box>
                    <EdgeLabel label="About you" top={PROFILE.labelTop - 2} />
                    <Box style={lane}>
                      <FieldTile label="Name" note={`${trimmed.length === 0 ? 'A name is needed · ' : ''}${name.length} / ${NAME_MAX}`} noteHot={!nameOk}>
                        <Input className="border-0 h-auto w-auto bg-transparent">
                          <InputField placeholderTextColor={colour.text3} placeholder="Your name" value={name} onChangeText={(t) => setName(t.slice(0, NAME_MAX))} maxLength={NAME_MAX} accessibilityLabel="Name" className="text-text font-medium" style={[PROFILE_TYPE.field16, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                        </Input>
                      </FieldTile>
                      <FieldTile label="Bio" note={`${bio.length} / ${BIO_MAX}`}>
                        <Textarea className="border-0 h-auto w-auto bg-transparent min-h-0">
                          <TextareaInput placeholderTextColor={colour.text3} placeholder="A line about you (optional)" value={bio} onChangeText={(t) => setBio(t.slice(0, BIO_MAX))} maxLength={BIO_MAX} multiline textAlignVertical="top" accessibilityLabel="Bio" className="text-text" style={[PROFILE_TYPE.bio15, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                        </Textarea>
                      </FieldTile>
                      <FieldTile label="Age range">
                        <Box style={chips}>
                          {AGE_RANGES.map((a) => (
                            <Pressable key={a} onPress={() => setAge(age === a ? null : a)} accessibilityRole="button" accessibilityLabel={`Age ${AGE_LABEL[a]}`} {...smallChip(age === a)}><ChipText chosen={age === a}>{AGE_LABEL[a]}</ChipText></Pressable>
                          ))}
                          <Pressable onPress={() => setAge(null)} accessibilityRole="button" accessibilityLabel="Age: prefer not to say" {...smallChip(age === null)}><ChipText chosen={age === null}>Prefer not to say</ChipText></Pressable>
                        </Box>
                      </FieldTile>
                      <FieldTile label="Gender" note="Never shown on your profile. Creators see only totals of 10 or more.">
                        <Box style={chips}>
                          {GENDERS.map((g) => (
                            <Pressable key={g} onPress={() => setGender(gender === g ? null : g)} accessibilityRole="button" accessibilityLabel={`Gender: ${GENDER_LABEL[g]}`} {...smallChip(gender === g)}><ChipText chosen={gender === g}>{GENDER_LABEL[g]}</ChipText></Pressable>
                          ))}
                        </Box>
                      </FieldTile>
                      <Box testID="likes-tile" className="flex-row items-center bg-raise" style={{ borderRadius: PROFILE.tileRadius, paddingVertical: PROFILE.tilePadY, paddingHorizontal: PROFILE.tilePadX, gap: PROFILE.tilePadX }}>
                        <Box className="flex-1">
                          <Type step="chip" className="text-text2" style={PROFILE_TYPE.label12}>Likes are public</Type>
                          <Type step="caption" className="text-text3" style={PROFILE_TYPE.note12}>People who follow you see the episodes you like.</Type>
                        </Box>
                        <Toggle value={likesPublic} onChange={setLikesPublic} label="Likes are public" />
                      </Box>
                    </Box>
                  </Box>

                  {/* M21 US8 (FR-075): both optional, both private — never on your profile. */}
                  <Box>
                    <EdgeLabel label="Private" top={PROFILE.labelTop - 2} />
                    <Box style={lane}>
                      <FieldTile label="Birthday" {...(bdayOk ? {} : { note: 'Write it as year-month-day, e.g. 1995-04-21.', noteHot: true })}>
                        <Input className="border-0 h-auto w-auto bg-transparent">
                          <InputField placeholderTextColor={colour.text3} placeholder="YYYY-MM-DD (optional)" value={birthday} onChangeText={(t) => setBirthday(t.replace(/[^0-9-]/g, '').slice(0, 10))} maxLength={10} keyboardType="numbers-and-punctuation" accessibilityLabel="Birthday, year-month-day" className="text-text font-mono" style={[PROFILE_TYPE.mono15, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                        </Input>
                      </FieldTile>
                      <FieldTile label="Industry" note={`Private: only you see your birthday and industry. ${industry.length} / ${INDUSTRY_MAX}`}>
                        <Input className="border-0 h-auto w-auto bg-transparent">
                          <InputField placeholderTextColor={colour.text3} placeholder="What you work in (optional)" value={industry} onChangeText={(t) => setIndustry(t.slice(0, INDUSTRY_MAX))} maxLength={INDUSTRY_MAX} accessibilityLabel="Industry" className="text-text font-medium" style={[ME_TYPE.field15, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                        </Input>
                      </FieldTile>
                    </Box>
                  </Box>
                  {error ? <Type step="note" className="text-hotText" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }} accessibilityLiveRegion="polite">{error}</Type> : null}
                </Box>
              </ScrollView>
            </Box>
          );
        }}
      </PushedPage>
    </KeyboardPage>
  );
}
