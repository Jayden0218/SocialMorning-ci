// Tests the Admin second step (M25 SB) and the browser-side picture cleaning before upload.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { SecondFactor } from '../src/pages/admin/SecondFactor';
import { withoutMetadata } from '../src/upload';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Admin › second step (M25 SB)', () => {
  it('sends one code on open, then a right code calls onDone with remember', async () => {
    const calls: { path: string; body: unknown }[] = [];
    const f = mockApi(() => undefined);
    f.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, '');
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return json({ ok: true });
    });
    const onDone = vi.fn();
    renderIn(<SecondFactor email="owner@example.com" onDone={onDone} />);
    expect(await screen.findByText(/We emailed a 6-digit code to owner@example.com/)).toBeTruthy();
    expect(calls.filter((c) => c.path === '/v1/studio/second-factor/send')).toHaveLength(1);

    const button = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12a3456' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.find((c) => c.path === '/v1/studio/second-factor/verify')?.body).toEqual({ code: '123456', remember: true });
  });

  it('a wrong code shows the server message and stays; Send a new code asks again; untick remember', async () => {
    let sends = 0;
    const f = mockApi(() => undefined);
    f.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, '');
      if (path === '/v1/studio/second-factor/send') { sends += 1; return json({ ok: true }); }
      if (path === '/v1/studio/second-factor/verify') {
        expect(JSON.parse(String(init?.body)).remember).toBe(false);
        return json({ error: 'invalid_code', message: 'That code is not right.' }, 422);
      }
      return json({ error: 'not_found', message: 'No such route.' }, 404);
    });
    const onDone = vi.fn();
    renderIn(<SecondFactor email="owner@example.com" onDone={onDone} />);
    await screen.findByText(/We emailed/);
    fireEvent.click(screen.getByLabelText(/Remember this browser/));
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That code is not right.');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(sends).toBe(2));
  });

  it('a send that fails says so', async () => {
    const f = mockApi(() => undefined);
    f.mockImplementation(async () => json({ error: 'locked', message: 'Wait 30 seconds before a new code.' }, 429));
    renderIn(<SecondFactor email="owner@example.com" onDone={() => undefined} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Wait 30 seconds before a new code.');
  });
});

describe('Admin › second step when the network fails', () => {
  it('send and verify show the offline message when the request itself fails', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { n += 1; throw new TypeError('Failed to fetch'); }));
    const onDone = vi.fn();
    renderIn(<SecondFactor email="owner@example.com" onDone={onDone} />);
    const OFFLINE = 'Could not reach SocialMorning. Check your connection and try again.';
    expect((await screen.findByRole('alert')).textContent).toBe(OFFLINE);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(n).toBe(2));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(OFFLINE));
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('withoutMetadata (M25 SB, browser side)', () => {
  // SOI, APP1 "Exif\0\0" + 4 bytes, SOS (length 4) + 1 data byte, EOI.
  const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0];
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0c, ...EXIF, 0x47, 0x50, 0x53, 0x21, 0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x11, 0xff, 0xd9]);
  const hasExif = (b: Uint8Array) => b.some((_, i) => EXIF.every((v, j) => b[i + j] === v));
  // jsdom 20's Blob has no arrayBuffer(): the input gets one (as a browser has), the output is read with FileReader.
  const readable = (bytes: Uint8Array, name: string, type: string) => {
    const f = new File([bytes as BlobPart], name, { type });
    Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(bytes.slice().buffer) });
    return f;
  };
  const read = (f: File) => new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(f);
  });

  it('a JPEG loses its Exif block and keeps its name and type', async () => {
    const out = await withoutMetadata(readable(jpeg, 'cover.jpg', 'image/jpeg'));
    const bytes = await read(out);
    expect(hasExif(bytes)).toBe(false);
    expect(bytes.length).toBeLessThan(jpeg.length);
    expect(out.name).toBe('cover.jpg');
    expect(out.type).toBe('image/jpeg');
  });

  it('anything that is not a JPEG, PNG or WebP goes as it is; a file that cannot be read goes as it is', async () => {
    const audio = readable(new Uint8Array([1, 2, 3]), 'a.mp3', 'audio/mpeg');
    expect(await withoutMetadata(audio)).toBe(audio);
    const broken = new File([jpeg as BlobPart], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(broken, 'arrayBuffer', { value: () => Promise.reject(new Error('unreadable')) });
    expect(await withoutMetadata(broken)).toBe(broken);
  });

  it('a file that says JPEG but is not one goes as it is; a browser with no arrayBuffer sends it as it is', async () => {
    const fake = readable(new Uint8Array([1, 2, 3, 4]), 'x.jpg', 'image/jpeg');
    expect(await withoutMetadata(fake)).toBe(fake);
    const plain = new File([jpeg as BlobPart], 'p.jpg', { type: 'image/jpeg' });
    Object.defineProperty(plain, 'arrayBuffer', { value: undefined });
    expect(await withoutMetadata(plain)).toBe(plain);
  });
});
