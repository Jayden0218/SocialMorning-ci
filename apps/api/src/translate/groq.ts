// Calls Groq's free tier: speech-to-text from the publisher's audio URL, and line-by-line translation as strict JSON.
/**
 * M22 US13 (research R1, constitution 3.3.0). Two calls, both on the free tier, both through an
 * injectable `fetch` (tests pass a fake Groq — the real one is never called in a test):
 *  - POST /openai/v1/audio/transcriptions, multipart, `url` = the episode's enclosure URL. The server
 *    never downloads or stores episode audio (constitution V); Groq fetches it from the publisher.
 *    `whisper-large-v3`, `response_format=verbose_json`, `timestamp_granularities[]=segment`.
 *  - POST /openai/v1/chat/completions, `openai/gpt-oss-120b`, `response_format` json_schema strict:
 *    `{ lines: [{ id, text }] }` — ids in, ids out, so the timing is never guessed again.
 * A 429 becomes `GroqRateLimited` with Groq's `retry-after`; the job parks until then. Without
 * GROQ_API_KEY the client is not `ready` and nothing is called (jobs stay queued).
 */
import { TRANSLATOR, WHISPER } from '@socialmorning/social-core';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
/** Groq bills at least 10 s of audio per transcription request. */
export const MIN_BILLED_AUDIO_S = 10;

export type Segment = { start: number; end: number; text: string };
export type TranslatedLine = { id: number; text: string };

export class GroqRateLimited extends Error {
  constructor(readonly retryAfterS: number) { super(`Groq rate limit; retry after ${retryAfterS} s`); }
}
export class GroqError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface Groq {
  ready: boolean;
  transcribe(audioUrl: string, language?: string): Promise<{ segments: Segment[]; durationS: number }>;
  translate(lines: readonly TranslatedLine[], from: string | undefined, to: 'en' | 'zh-Hans'): Promise<{ lines: TranslatedLine[]; tokens: number }>;
}

const LANG_NAME: Record<'en' | 'zh-Hans', string> = { en: 'English', 'zh-Hans': 'Simplified Chinese' };

/** Seconds from `retry-after` (seconds or an HTTP date); 60 when missing or unreadable. */
export function retryAfterSeconds(h: string | null, now = Date.now()): number {
  if (!h) return 60;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - now) / 1000)) : 60;
}

async function check(res: Response): Promise<void> {
  if (res.status === 429) throw new GroqRateLimited(retryAfterSeconds(res.headers.get('retry-after')));
  if (!res.ok) throw new GroqError(res.status, `Groq answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function groqClient(key: string | undefined, f: typeof fetch = fetch): Groq {
  const ready = typeof key === 'string' && key.length > 0;
  const auth = { authorization: `Bearer ${key ?? ''}` };
  return {
    ready,
    async transcribe(audioUrl, language) {
      if (!ready) throw new GroqError(503, 'GROQ_API_KEY is not set');
      const form = new FormData();
      form.set('model', WHISPER);
      form.set('url', audioUrl);
      form.set('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      // Whisper wants ISO-639-1 ("zh", "ja"); left empty when the feed does not say.
      const iso = language?.toLowerCase().split(/[-_]/)[0];
      if (iso && /^[a-z]{2}$/.test(iso)) form.set('language', iso);
      const res = await f(`${GROQ_BASE}/audio/transcriptions`, { method: 'POST', headers: auth, body: form });
      await check(res);
      const body = (await res.json()) as { duration?: number; segments?: { start?: number; end?: number; text?: string }[] };
      const segments = (body.segments ?? [])
        .filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && typeof s.text === 'string' && s.text.trim().length > 0)
        .map((s) => ({ start: s.start!, end: s.end!, text: s.text!.trim() }));
      const durationS = typeof body.duration === 'number' ? body.duration : (segments.at(-1)?.end ?? 0);
      return { segments, durationS };
    },
    async translate(lines, from, to) {
      if (!ready) throw new GroqError(503, 'GROQ_API_KEY is not set');
      const res = await f(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: TRANSLATOR,
          temperature: 0,
          messages: [
            { role: 'system', content: `You translate podcast transcript lines${from ? ` from ${from}` : ''} into ${LANG_NAME[to]}. Translate every line on its own, keep each id, add nothing. Answer with JSON only.` },
            { role: 'user', content: JSON.stringify({ lines }) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'translation',
              strict: true,
              schema: {
                type: 'object',
                properties: { lines: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false } } },
                required: ['lines'],
                additionalProperties: false,
              },
            },
          },
        }),
      });
      await check(res);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
      const content = body.choices?.[0]?.message?.content ?? '';
      let parsed: { lines?: { id?: unknown; text?: unknown }[] };
      try { parsed = JSON.parse(content) as typeof parsed; } catch { throw new GroqError(502, 'Groq answered something that is not JSON'); }
      const out = (parsed.lines ?? [])
        .filter((l): l is { id: number; text: string } => typeof l.id === 'number' && typeof l.text === 'string')
        .map((l) => ({ id: l.id, text: l.text }));
      return { lines: out, tokens: Number(body.usage?.total_tokens ?? 0) };
    },
  };
}
