// The API as an AWS Lambda function behind a Function URL (API Gateway v2 event shape).
/**
 * M27 (specs/028-m27-aws-infra research R4, contracts/lambda-events.md). The same Hono app as `server.ts` and
 * `vercel-entry.ts`, adapted by `hono/aws-lambda`. The app is built once per cold start, from the environment
 * (`config.ts`), on the first request — importing this file reads nothing.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { handle } from 'hono/aws-lambda';
import { createApp, type AppDeps } from './app.ts';
import { depsFromEnv } from './config.ts';
import './jobs/handlers.ts';
import { edgeSecret } from './config.ts';

type LambdaHandler = ReturnType<typeof handle>;

/**
 * M28 US2 (research R2). The address a per-address limit counts. A Function URL event carries AWS's own
 * `requestContext.http.sourceIp`; a client-sent `x-forwarded-for` is never trusted here. Behind the Vercel edge
 * proxy every request has the proxy's address as `sourceIp`, so the proxy signs the real one with `x-sm-edge`
 * (= EDGE_SECRET) and `x-sm-client-ip`. Every one of these three headers is removed from what the client sent first.
 * Looked up: docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html (payload format 2.0, `requestContext.http.sourceIp`).
 */
const DIGEST = (s: string): Buffer => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string): boolean => timingSafeEqual(DIGEST(a), DIGEST(b));
const OWN_HEADERS = ['x-sm-trusted-ip', 'x-sm-edge', 'x-sm-client-ip'];

export function trustedAddress(event: { headers?: Record<string, string | undefined>; requestContext?: { http?: { sourceIp?: string } } }): { headers: Record<string, string | undefined>; address: string | undefined } {
  const headers: Record<string, string | undefined> = {};
  const own: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    const name = k.toLowerCase();
    if (OWN_HEADERS.includes(name)) { if (v !== undefined) own[name] = v; } else headers[k] = v;
  }
  const secret = edgeSecret();
  const viaEdge = secret.length > 0 && own['x-sm-edge'] !== undefined && sameSecret(own['x-sm-edge'], secret);
  const address = (viaEdge ? own['x-sm-client-ip'] : undefined) || event.requestContext?.http?.sourceIp || undefined;
  return { headers, address: address?.trim().slice(0, 64) || undefined };
}

/** The handler for an app (tests compare it with the same app answering directly). */
export const fromApp = (app: ReturnType<typeof createApp>): LambdaHandler => {
  const inner = handle(app);
  return ((event: Parameters<LambdaHandler>[0], context: Parameters<LambdaHandler>[1]) => {
    const { headers, address } = trustedAddress(event as never);
    if (address) headers['x-sm-trusted-ip'] = address;
    return inner({ ...event, headers } as never, context);
  }) as LambdaHandler;
};

/** The handler for given dependencies. */
export const createHandler = (deps: AppDeps): LambdaHandler => fromApp(createApp(deps));

/** The cold-start handler for a dependencies loader (`depsFromEnv` in production; a test passes its own). */
export const makeHandler = (load: () => Promise<AppDeps>): LambdaHandler => {
  let ready: Promise<LambdaHandler> | undefined;
  return (async (event: Parameters<LambdaHandler>[0], context: Parameters<LambdaHandler>[1]) => {
    if (!ready) {
      // A failed read is not kept (M32 A3): the next request tries again instead of failing until the container is recycled.
      const p = load().then(createHandler);
      p.catch(() => { if (ready === p) ready = undefined; });
      ready = p;
    }
    return (await ready)(event, context);
  }) as LambdaHandler;
};

export const handler: LambdaHandler = makeHandler(depsFromEnv);
