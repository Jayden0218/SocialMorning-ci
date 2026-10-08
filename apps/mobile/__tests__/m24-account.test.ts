// Tests M24 lane A3 on the phone: the account client (redeem, change email) and choosing several downloads.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@/social/api';
import { cleanCode, codeReady, createAccountApi, grantLine, groupCode, isEmail } from '@/social/account-api';
import { NONE, deleteLabel, keepListed, removeChosen, removedLine, toggleAll, toggleChosen } from '@/downloads/multi-select';

const ROOT = join(__dirname, '..');
type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function deps(answer: (url: string) => Response) {
  const calls: Call[] = [];
  return {
    calls,
    baseUrl: 'https://api.test',
    getToken: async () => 'tok',
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return answer(url); }) as unknown as typeof fetch,
  };
}

describe('redeem codes', () => {
  it('the code is cleaned and grouped as typed; the button wakes at 6 symbols', () => {
    expect(cleanCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
    expect(groupCode('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN');
    expect(groupCode('ABCD-EF')).toBe('ABCD-EF');
    expect(groupCode('')).toBe('');
    expect(codeReady('abc')).toBe(false);
    expect(codeReady('abcd-ef')).toBe(true);
    expect(codeReady('abcd-e$')).toBe(false);
  });

  it('POST /v1/me/redeem sends the clean code with the token and returns the grant', async () => {
    const d = deps(() => json(200, { grant: { kind: 'plus', days: 30, until: '2026-11-07T00:00:00.000Z' } }));
    const g = await createAccountApi(d).redeem('abcd-efgh-jkmn');
    expect(g).toEqual({ kind: 'plus', days: 30, until: '2026-11-07T00:00:00.000Z' });
    expect(d.calls[0]!.url).toBe('https://api.test/v1/me/redeem');
    expect(d.calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(d.calls[0]!.init.body))).toEqual({ code: 'ABCDEFGHJKMN' });
    expect(d.calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('a refusal carries the server\'s words', async () => {
    const d = deps(() => json(409, { error: 'already_claimed', message: 'You already used this code.' }));
    const e = await createAccountApi(d).redeem('ABCDEFGHJKMN').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).message).toBe('You already used this code.');
    expect((e as ApiError).status).toBe(409);
  });

  it('the line after a code worked', () => {
    const date = (iso: string) => iso.slice(0, 10);
    expect(grantLine({ kind: 'plus', days: 30, until: '2026-11-07T00:00:00.000Z' }, date)).toBe('PLUS is yours until 2026-11-07.');
    expect(grantLine({ kind: 'plus', days: 30, until: null }, date)).toBe('30 days of PLUS added.');
    expect(grantLine({ kind: 'show', feedUrl: 'f', title: 'Deep Talk' }, date)).toBe('Deep Talk is yours. Find it on the show page.');
    expect(grantLine({ kind: 'show', feedUrl: 'f', title: null }, date)).toBe('The series is yours. Find it on the show page.');
  });

  it('Wallet links to the Redeem page, which exists', () => {
    expect(readFileSync(join(ROOT, 'app/wallet.tsx'), 'utf8')).toMatch(/router\.push\('\/redeem'\)/);
    expect(existsSync(join(ROOT, 'app/redeem.tsx'))).toBe(true);
  });
});

describe('change the sign-in email', () => {
  it('start sends the new address; confirm sends the code and returns the new email', async () => {
    const d = deps((url) => (url.endsWith('/start') ? json(200, { sent: true, resendAfterSeconds: 30 }) : json(200, { email: 'new@example.com' })));
    const api = createAccountApi(d);
    expect(await api.startEmailChange(' new@example.com ')).toEqual({ sent: true, resendAfterSeconds: 30 });
    expect(await api.confirmEmailChange(' 123456 ', ' 654321 ')).toEqual({ email: 'new@example.com', signedOut: 0 });
    expect(d.calls.map((c) => [c.url, JSON.parse(String(c.init.body))])).toEqual([
      ['https://api.test/v1/me/email/start', { email: 'new@example.com' }],
      ['https://api.test/v1/me/email/confirm', { code: '123456', oldCode: '654321' }],
    ]);
  });

  it('an address in use is refused with the server\'s words', async () => {
    const d = deps(() => json(409, { error: 'conflict', message: 'Another account uses that email.' }));
    await expect(createAccountApi(d).startEmailChange('b@example.com')).rejects.toMatchObject({ code: 'conflict', message: 'Another account uses that email.' });
  });

  it('isEmail is a light check before the server\'s', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail(' a@b.co ')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.co')).toBe(false);
  });

  it('Account links to the Change email page, which exists', () => {
    expect(readFileSync(join(ROOT, 'app/settings/account.tsx'), 'utf8')).toMatch(/router\.push\('\/settings\/account-email'\)/);
    expect(existsSync(join(ROOT, 'app/settings/account-email.tsx'))).toBe(true);
  });
});

describe('downloads: choose several and delete them', () => {
  it('toggle, select all / clear, and rows that left the list drop out', () => {
    let s = toggleChosen(NONE, 'a');
    s = toggleChosen(s, 'b');
    expect([...s]).toEqual(['a', 'b']);
    expect([...toggleChosen(s, 'a')]).toEqual(['b']);
    expect([...toggleAll(s, ['a', 'b', 'c'])]).toEqual(['a', 'b', 'c']);
    expect(toggleAll(new Set(['a', 'b', 'c']), ['a', 'b', 'c']).size).toBe(0);
    expect(toggleAll(NONE, []).size).toBe(0);
    expect([...keepListed(s, ['b', 'c'])]).toEqual(['b']);
    expect(keepListed(s, ['a', 'b'])).toBe(s);
  });

  it('removes each chosen row in turn and goes on past one that fails', async () => {
    const seen: string[] = [];
    const r = await removeChosen(['a', 'b', 'c'], async (id) => { seen.push(id); if (id === 'b') throw new Error('disk'); });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r).toEqual({ removed: 2, failed: 1 });
    expect(removedLine(r)).toBe('2 downloads deleted. 1 download could not be deleted.');
    expect(removedLine({ removed: 1, failed: 0 })).toBe('1 download deleted.');
  });

  it('the Delete button names how many', () => {
    expect(deleteLabel(0)).toBe('Delete');
    expect(deleteLabel(1)).toBe('Delete 1 episode');
    expect(deleteLabel(3)).toBe('Delete 3 episodes');
  });

  it('the Downloads page has Select mode wired to these helpers', () => {
    const src = readFileSync(join(ROOT, 'app/downloads.tsx'), 'utf8');
    expect(src).toMatch(/accessibilityLabel=\{selecting \? 'Done' : 'Select'\}/);
    expect(src).toMatch(/removeChosen\(list, \(id\) => downloads\.remove\(id\)\)/);
  });
});
