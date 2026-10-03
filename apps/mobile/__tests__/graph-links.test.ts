import { clipLinkFor, clipSchemeLinkFor, parseClipLink } from '../src/graph/links';

const ID = '0f1e2d3c-4b5a-4697-8877-665544332211';

it('builds the https link on the API host and the scheme link', () => {
  expect(clipLinkFor(ID, 'https://socialmorning-api.vercel.app/')).toBe(`https://socialmorning-api.vercel.app/c/${ID}`);
  expect(clipSchemeLinkFor(ID)).toBe(`socialmorning://clip/${ID}`);
});

it('parses both forms, ignores other URLs, and refuses non-uuid ids', () => {
  expect(parseClipLink(`https://socialmorning-api.vercel.app/c/${ID}`)).toBe(ID);
  expect(parseClipLink(`https://socialmorning-api.vercel.app/c/${ID.toUpperCase()}?utm=1`)).toBe(ID);
  expect(parseClipLink(`socialmorning://clip/${ID}`)).toBe(ID);
  expect(parseClipLink('socialmorning://downloads')).toBeUndefined();
  expect(parseClipLink('https://socialmorning-api.vercel.app/v1/health')).toBeUndefined();
  expect(parseClipLink('https://socialmorning-api.vercel.app/c/not-a-uuid')).toBeUndefined();
  expect(parseClipLink('socialmorning://clip/%E0%A4%A')).toBeUndefined();
});
