// The secrets of the API on AWS Lambda, read from SSM Parameter Store and re-read every 15 minutes.
/**
 * M28 US6 (specs/029-m28-enterprise-hardening, research R8, contracts/secrets.md "Loader"). On Lambda with `SECRETS_PATH` set,
 * the secrets are SecureString parameters under that path (`/sm/api/`, `/stg/api/`), not values in the function configuration.
 * `src/config.ts` decides when this loader is used; everywhere else (Vercel, Node, tests) the environment is read as before.
 *
 * - Cold start: `GetParametersByPath(Path, WithDecryption, Recursive false)`, following `NextToken` (a page holds at most 10).
 *   A read that fails, or a required name that is missing, throws — the function never starts with an empty secret (FR-027).
 * - After that the values live in memory for 15 minutes. The first `get` after that starts ONE background re-read, so a request
 *   never waits on SSM. A failed re-read keeps the old values, retries after 1 minute and logs at most once an hour.
 * - Each good read is also copied into the `env` object it was given, so code that reads `process.env` directly (Groq, the Blob
 *   tokens, `EDGE_SECRET`) sees the parameters too; a parameter that was deleted is removed again.
 * - Logged: names and counts. Never a value.
 */
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

export const SECRETS_TTL_MS = 15 * 60_000;
export const SECRETS_RETRY_MS = 60_000;
export const SECRETS_LOG_EVERY_MS = 60 * 60_000;

/** What the loader needs of the SSM client (a test hands in a stub). */
export type SsmLike = { send(command: GetParametersByPathCommand): Promise<{ Parameters?: { Name?: string; Value?: string }[]; NextToken?: string }> };

export type SecretsOptions = {
  /** `/sm/api/`: a trailing slash is added when missing. */
  path: string;
  /** Names that must exist; a missing one throws `secret <NAME> is not set at <path>`. */
  required?: readonly string[];
  client?: SsmLike;
  region?: string;
  now?: () => number;
  log?: (message: string) => void;
  /** Receives every loaded value (the Lambda's `process.env`), so env readers see them. */
  env?: Record<string, string | undefined>;
};

export type Secrets = {
  /** The current value; starts a background re-read when the cache is 15 minutes old. */
  get(name: string): string | undefined;
  /** The names loaded (never values). */
  names(): string[];
};

const withSlash = (path: string): string => (path.endsWith('/') ? path : `${path}/`);

async function readAll(client: SsmLike, path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let token: string | undefined;
  do {
    const page = await client.send(new GetParametersByPathCommand({ Path: path, WithDecryption: true, Recursive: false, MaxResults: 10, ...(token ? { NextToken: token } : {}) }));
    for (const p of page.Parameters ?? []) {
      const name = (p.Name ?? '').split('/').pop();
      if (name && p.Value) out.set(name, p.Value);
    }
    token = page.NextToken;
  } while (token);
  return out;
}

/** Reads the parameters once (throws on failure or a missing required name) and returns the self-refreshing handle. */
export async function loadSecrets(opts: SecretsOptions): Promise<Secrets> {
  const path = withSlash(opts.path);
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.log(m));
  const client = opts.client ?? new SSMClient({ region: opts.region ?? process.env['AWS_REGION'] });
  const required = opts.required ?? [];
  const check = (m: Map<string, string>) => { for (const name of required) if (!m.has(name)) throw new Error(`secret ${name} is not set at ${path}`); };

  let values = await readAll(client, path);
  check(values);
  let loadedAt = now();
  let retryAt = 0;
  let lastLogAt = -Infinity;
  let inFlight: Promise<void> | undefined;
  const applied = new Set<string>();
  const apply = () => {
    if (!opts.env) return;
    for (const [k, v] of values) { opts.env[k] = v; applied.add(k); }
    for (const k of applied) if (!values.has(k)) { delete opts.env[k]; applied.delete(k); }
  };
  apply();
  log(`secrets: ${values.size} loaded from ${path}`);

  const refresh = (): Promise<void> => {
    inFlight = readAll(client, path).then((fresh) => {
      check(fresh); // a required value that vanished is a failed read, not a new truth
      values = fresh; loadedAt = now(); apply();
      log(`secrets: ${values.size} loaded from ${path}`);
    }).catch((err: unknown) => {
      retryAt = now() + SECRETS_RETRY_MS;
      if (now() - lastLogAt >= SECRETS_LOG_EVERY_MS) {
        lastLogAt = now();
        log(`secrets: refresh failed ${(err as { name?: string })?.name ?? 'error'}`);
      }
    }).finally(() => { inFlight = undefined; });
    return inFlight;
  };

  return {
    get(name) {
      if (!inFlight && now() - loadedAt >= SECRETS_TTL_MS && now() >= retryAt) void refresh();
      return values.get(name);
    },
    names: () => [...values.keys()],
  };
}
