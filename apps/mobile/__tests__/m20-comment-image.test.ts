// Tests comment pictures on the phone: the shrink size, the thumbnail box, and reading the server's field.
/**
 * M20 US9 (spec FR-053). Logic only; picking and showing a real photo is quickstart B13, NOT VERIFIED.
 */
import { fitWithin, thumbSize } from '@/social/image-fit';
import { extrasOf } from '@/social/comment-extras-api';
import type { Comment } from '@/social/api';

it('shrinks the long side to 1600, keeps the shape, never enlarges', () => {
  expect(fitWithin(4032, 3024)).toEqual({ w: 1600, h: 1200 });
  expect(fitWithin(3000, 6000)).toEqual({ w: 800, h: 1600 });
  expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
});

it('the thumbnail fits a 200 square and never drops under the 48 pt tap floor', () => {
  expect(thumbSize(1600, 1200, 200, 48)).toEqual({ width: 200, height: 150 });
  expect(thumbSize(2000, 100, 200, 48)).toEqual({ width: 200, height: 48 });
  expect(thumbSize(100, 80, 200, 48)).toEqual({ width: 100, height: 80 });
});

it('takes the server\'s image only when it is a well-formed https picture', () => {
  const base = { id: 'c', authorId: 'a', displayName: 'A', body: 'x', offsetMs: 0, parentId: null, createdAt: '', deleted: false } as Comment;
  expect(extrasOf({ ...base, image: { url: 'https://pub.example/a.jpg', w: 640, h: 480 } } as Comment).image).toEqual({ url: 'https://pub.example/a.jpg', w: 640, h: 480 });
  expect(extrasOf({ ...base, image: { url: 'http://x/a.jpg', w: 640, h: 480 } } as Comment).image).toBeUndefined();
  expect(extrasOf({ ...base, image: { url: 'https://x/a.jpg', w: 0, h: 480 } } as Comment).image).toBeUndefined();
});
