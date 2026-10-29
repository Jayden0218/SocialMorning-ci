// A tiny structured logger: one JSON line per event, level threshold from LOG_LEVEL, secrets scrubbed.
import { logLevel } from './config.ts';
import { scrubError } from './routes/errors.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /token|authorization|password|secret|cookie|apikey|api_key/i;

/** Where lines go (tests replace it). warn and error use the console method of the same name, so platform log levels stay right. */
export const sink: { write: (level: Level, line: string) => void } = {
  write: (level, line) => { (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line); },
};

function clean(v: unknown, key?: string, depth = 0): unknown {
  if (key && SECRET_KEY.test(key)) return '<redacted>';
  if (v instanceof Error) return scrubError(`${v.name}: ${v.message}`);
  if (typeof v === 'string') return scrubError(v);
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || v === undefined) return v;
  if (depth > 3) return '<deep>';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, undefined, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, clean(x, k, depth + 1)]));
  return String(v);
}

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const threshold = RANK[logLevel() as Level] ?? RANK.info;
  if (RANK[level] < threshold) return;
  const { requestId, ...rest } = fields;
  sink.write(level, JSON.stringify({
    level, event, time: new Date().toISOString(), ...(typeof requestId === 'string' ? { requestId } : {}), ...(clean(rest) as object),
  }));
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};

/** `.catch(swallow('event'))`: keeps the old "carry on" behaviour but leaves a warn line saying what failed. */
export const swallow = (event: string, fields?: Record<string, unknown>) => (err: unknown): undefined => {
  log.warn(event, { ...fields, error: err });
  return undefined;
};
