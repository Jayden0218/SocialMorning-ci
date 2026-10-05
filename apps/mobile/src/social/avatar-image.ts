// Lets you pick a square profile photo and shrinks it to 400 px and under 200 KB.
/**
 * M19 T013 (US1, research R6): the photo library with the system's square crop, then a
 * 400 × 400 JPEG re-encoded at falling quality until it fits the server's 204 800-byte limit.
 * The photo permission is asked only when the listener taps "Change photo".
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { QUALITIES, base64Bytes } from '@/settings/feedback-shrink';
import { AVATAR_MAX_BYTES } from './profile-api';

export const AVATAR_PX = 400;

export type AvatarPick = { kind: 'ok'; uri: string } | { kind: 'denied' } | { kind: 'cancelled' } | { kind: 'too-big' };

export async function pickAvatar(): Promise<AvatarPick> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (r.canceled) return { kind: 'cancelled' };
  const asset = r.assets[0];
  if (!asset) return { kind: 'cancelled' };
  const ref = await ImageManipulator.manipulate(asset.uri).resize({ width: AVATAR_PX, height: AVATAR_PX }).renderAsync();
  for (const q of QUALITIES) {
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: q, base64: true });
    if (base64Bytes(saved.base64 ?? '') <= AVATAR_MAX_BYTES - 4_800) return { kind: 'ok', uri: saved.uri };
  }
  return { kind: 'too-big' };
}

/** The saved file's bytes, ready to send. */
export async function avatarBytes(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}
