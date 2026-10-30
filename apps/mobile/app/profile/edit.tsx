// Edit profile: photo, name, short bio, optional age range, gender, birthday and industry, and whether likes are public.
/**
 * M19 T013 (US1, FR-001–FR-008): your own profile, edited. A square photo (picked with the
 * system crop, shrunk to 400 px and ≤ 200 KB on the phone), the name (1–30), a short bio
 * (≤ 160), an age range and a gender — both optional, never shown on the profile, creators see
 * only totals of 10 or more — and the "Likes are public" switch. Save sends the text first,
 * then the photo, then says so and goes back.
 *
 * Editorial look (M17): the app's own header, white cards, serif section titles, yellow chips.
 * M21 US8 (FR-075): an optional birthday (typed as YYYY-MM-DD — our own field, no system date
 * picker) and industry (≤ 40). Both are private: the server returns them to you alone (G-M21-10).
 */
import { useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Input, InputField } from '@/ui/lib/input';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { hit } from '@/design';
import { PageHeader, goBack } from '@/ui/kit/PageHeader';
import { Avatar } from '@/ui/kit/Avatar';
import { Card } from '@/ui/kit/Card';
import { Chip } from '@/ui/kit/Chip';
import { Toggle } from '@/ui/kit/Toggle';
import { Button } from '@/ui/kit/Button';
import { BottomBar } from '@/ui/kit/BottomBar';
import { Loader } from '@/ui/kit/Loader';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { AGE_RANGES, BIO_MAX, GENDERS, INDUSTRY_MAX, NAME_MAX, birthdayOk, useProfileApi, type AgeRange, type Gender } from '@/social/profile-api';
import { avatarBytes, pickAvatar } from '@/social/avatar-image';

const TAP = { minHeight: hit.min };

const AGE_LABEL: Record<AgeRange, string> = { under18: 'Under 18', '18-24': '18–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55+': '55+' };
const GENDER_LABEL: Record<Gender, string> = { woman: 'Woman', man: 'Man', another: 'Another', unsaid: 'Prefer not to say' };

const asAge = (v: string | null | undefined): AgeRange | null => ((AGE_RANGES as readonly string[]).includes(v ?? '') ? (v as AgeRange) : null);
const asGender = (v: string | null | undefined): Gender | null => ((GENDERS as readonly string[]).includes(v ?? '') ? (v as Gender) : null);

type Photo = { kind: 'server'; url?: string } | { kind: 'picked'; uri: string } | { kind: 'removed' };

export default function EditProfileScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
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
      setLoaded('ok');
    }).catch(() => setLoaded('error'));
  };
  useEffect(() => { if (listener) load(); }, [listener?.listenerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <PageHeader title="Edit profile" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to edit your profile.</Text></Box></>;
  if (loaded === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (loaded === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load your profile right now.</Text>
        <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }

  const shownUrl = photo.kind === 'picked' ? photo.uri : photo.kind === 'server' ? photo.url : undefined;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const bday = birthday.trim();
  const bdayOk = bday === '' || birthdayOk(bday, new Date());

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

  return (
    <>
    {header}
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section" keyboardShouldPersistTaps="handled">
      <Box className="items-center gap-row">
        <Avatar size={96} url={shownUrl} name={trimmed || listener.displayName} className="border-2 border-surface" />
        <Box className="flex-row gap-row">
          <Pressable onPress={() => void choosePhoto()} accessibilityRole="button" accessibilityLabel={shownUrl ? 'Change photo' : 'Add photo'} className="justify-center px-row" style={TAP}>
            <Text className="text-accent text-body font-semibold">{shownUrl ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
          {shownUrl ? (
            <Pressable onPress={() => setPhoto({ kind: 'removed' })} accessibilityRole="button" accessibilityLabel="Remove photo" className="justify-center px-row" style={TAP}>
              <Text className="text-muted text-body font-semibold">Remove photo</Text>
            </Pressable>
          ) : null}
        </Box>
      </Box>

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Name</Text>
        <Input className="bg-surface border border-border rounded-row h-auto px-0">
          <InputField placeholderTextColor={c.muted} placeholder="Your name" value={name} onChangeText={(t) => setName(t.slice(0, NAME_MAX))} maxLength={NAME_MAX} accessibilityLabel="Name" className="p-row text-base text-text" />
        </Input>
        <Text className={nameOk ? 'text-muted text-xs text-right' : 'text-accent text-xs text-right'}>{trimmed.length === 0 ? 'A name is needed · ' : ''}{name.length} / {NAME_MAX}</Text>
      </Box>

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Bio</Text>
        <Textarea className="bg-surface border border-border rounded-row min-h-24 h-auto">
          <TextareaInput placeholderTextColor={c.muted} placeholder="A line about you (optional)" value={bio} onChangeText={(t) => setBio(t.slice(0, BIO_MAX))} maxLength={BIO_MAX} multiline textAlignVertical="top" accessibilityLabel="Bio" className="p-row text-body text-text" />
        </Textarea>
        <Text className="text-muted text-xs text-right">{bio.length} / {BIO_MAX}</Text>
      </Box>

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Age range</Text>
        <Box className="flex-row flex-wrap gap-gap">
          {AGE_RANGES.map((a) => <Chip key={a} label={AGE_LABEL[a]} chosen={age === a} onPress={() => setAge(age === a ? null : a)} accessibilityLabel={`Age ${AGE_LABEL[a]}`} />)}
          <Chip label="Prefer not to say" chosen={age === null} onPress={() => setAge(null)} accessibilityLabel="Age: prefer not to say" />
        </Box>
      </Box>

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Gender</Text>
        <Box className="flex-row flex-wrap gap-gap">
          {GENDERS.map((g) => <Chip key={g} label={GENDER_LABEL[g]} chosen={gender === g} onPress={() => setGender(gender === g ? null : g)} accessibilityLabel={`Gender: ${GENDER_LABEL[g]}`} />)}
        </Box>
        <Text className="text-muted text-xs">Never shown on your profile. Creators see only totals of 10 or more.</Text>
      </Box>

      {/* M21 US8 (FR-075): both optional, both private — never on your profile. */}
      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Birthday</Text>
        <Input className="bg-surface border border-border rounded-row h-auto px-0">
          <InputField placeholderTextColor={c.muted} placeholder="YYYY-MM-DD (optional)" value={birthday} onChangeText={(t) => setBirthday(t.replace(/[^0-9-]/g, '').slice(0, 10))} maxLength={10} keyboardType="numbers-and-punctuation" accessibilityLabel="Birthday, year-month-day" className="p-row text-base text-text" />
        </Input>
        {bdayOk ? null : <Text className="text-accent text-xs">Write it as year-month-day, e.g. 1995-04-21.</Text>}
      </Box>

      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Industry</Text>
        <Input className="bg-surface border border-border rounded-row h-auto px-0">
          <InputField placeholderTextColor={c.muted} placeholder="What you work in (optional)" value={industry} onChangeText={(t) => setIndustry(t.slice(0, INDUSTRY_MAX))} maxLength={INDUSTRY_MAX} accessibilityLabel="Industry" className="p-row text-base text-text" />
        </Input>
        <Text className="text-muted text-xs">{`Private: only you see your birthday and industry. ${industry.length} / ${INDUSTRY_MAX}`}</Text>
      </Box>

      <Card>
        <Box className="flex-row items-center gap-section py-row">
          <Box className="flex-1">
            <Text className="text-text text-body">Likes are public</Text>
            <Text className="text-muted text-xs mt-0.5">People who follow you see the episodes you like.</Text>
          </Box>
          <Toggle value={likesPublic} onChange={setLikesPublic} label="Likes are public" />
        </Box>
      </Card>

      {error ? <Text className="text-accent text-body" accessibilityLiveRegion="polite">{error}</Text> : null}
    </ScrollView>
    <BottomBar tone="surface" line="border" className="flex-row items-center justify-end">
      <Button label="Save" onPress={() => void save()} disabled={!nameOk || !bdayOk} busy={busy} className="px-9" />
    </BottomBar>
    </>
  );
}
