// Lets you pick one photo for a comment and shrinks it to a JPEG the server takes.
/**
 * M20 US9 (spec FR-053). One photo from the library — the permission is asked only on tap. A file
 * over 10 MB is refused with a reason before anything else; the rest is reduced on the phone to at
 * most 1600 px on its long side, JPEG 0.8 (then 0.6, 0.4 if still over the server's 1 000 000
 * bytes). The size math is in `image-fit.ts`, tested without a phone.
 */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { fitWithin, IMAGE_LONG_SIDE } from './image-fit';

export const PICK_MAX_BYTES = 10_000_000;
export const UPLOAD_MAX_BYTES = 1_000_000;

export type PickedCommentImage = { uri: string; w: number; h: number };
export type CommentImagePick = { kind: 'ok'; image: PickedCommentImage } | { kind: 'denied' } | { kind: 'cancelled' } | { kind: 'too-big' };

export async function pickCommentImage(): Promise<CommentImagePick> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
  if (r.canceled || !r.assets[0]) return { kind: 'cancelled' };
  const a = r.assets[0];
  if ((a.fileSize ?? 0) > PICK_MAX_BYTES) return { kind: 'too-big' };
  const size = fitWithin(a.width || IMAGE_LONG_SIDE, a.height || IMAGE_LONG_SIDE);
  const ref = await ImageManipulator.manipulate(a.uri).resize({ width: size.w, height: size.h }).renderAsync();
  for (const compress of [0.8, 0.6, 0.4]) {
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress });
    const bytes = (await (await fetch(out.uri)).blob()).size;
    if (bytes <= UPLOAD_MAX_BYTES) return { kind: 'ok', image: { uri: out.uri, w: out.width, h: out.height } };
  }
  return { kind: 'too-big' };
}
