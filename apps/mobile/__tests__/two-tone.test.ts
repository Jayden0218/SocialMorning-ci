import { twoTone } from '@/ui/kit/two-tone';

it('splits a section title at its first space; one word stays all accent (M12 FR-055)', () => {
  expect(twoTone("Editor's picks · 2026-09-22")).toEqual({ lead: "Editor's", rest: ' picks · 2026-09-22' });
  expect(twoTone('For You')).toEqual({ lead: 'For', rest: ' You' });
  expect(twoTone('Talked')).toEqual({ lead: '', rest: 'Talked' });
});
