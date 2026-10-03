/**
 * M10b US6 — the photo library and the encoder (native; see `shrink.ts` for the logic).
 * The photo permission is asked only when the listener taps "Add image".
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_WIDTH, smallestFit } from './feedback-shrink';

export type PickedImage = { uri: string; base64: string };
export type PickResult = { kind: 'ok'; images: PickedImage[] } | { kind: 'denied' } | { kind: 'cancelled' } | { kind: 'too-big'; kept: PickedImage[] };

export async function pickImages(max: number): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, quality: 1 });
  if (r.canceled) return { kind: 'cancelled' };
  const out: PickedImage[] = [];
  let tooBig = false;
  for (const a of r.assets.slice(0, max)) {
    const width = Math.min(a.width || MAX_WIDTH, MAX_WIDTH);
    const ref = await ImageManipulator.manipulate(a.uri).resize({ width }).renderAsync();
    const b64 = await smallestFit(async (q) => (await ref.saveAsync({ format: SaveFormat.JPEG, compress: q, base64: true })).base64 ?? '');
    if (b64 === undefined) { tooBig = true; continue; }
    out.push({ uri: a.uri, base64: b64 });
  }
  return tooBig ? { kind: 'too-big', kept: out } : { kind: 'ok', images: out };
}
