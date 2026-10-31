// The ios-journey test server's request log (docs/gate-logs/ios-journey-2026-10-31-e1-red.md): see test/e2e-request-log.test.ts.
/**
 * Wraps a fetch handler so each request writes two lines to `write` (default: stdout, which ios-journey redirects to api.log and uploads):
 *   `<iso time> -> <id> <METHOD> <path>`          on arrival
 *   `<iso time> <- <id> <status> <ms>ms`          when the response is ready (`500 …ms threw` if the handler throws; the error still propagates)
 * Method, path (no query string), status, duration and a short random id only: never bodies, headers, tokens or query strings.
 * The arrival line is what shows whether a request that got no answer reached the server at all.
 */
import { randomBytes } from 'node:crypto';

type Handler<A extends unknown[]> = (req: Request, ...rest: A) => Response | Promise<Response>;

export function withRequestLog<A extends unknown[]>(handler: Handler<A>, write: (line: string) => void = (l) => console.log(l)): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    const id = randomBytes(4).toString('hex');
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    write(`${new Date().toISOString()} -> ${id} ${req.method} ${new URL(req.url).pathname}`);
    try {
      const res = await handler(req, ...rest);
      write(`${new Date().toISOString()} <- ${id} ${res.status} ${ms()}ms`);
      return res;
    } catch (e) {
      write(`${new Date().toISOString()} <- ${id} 500 ${ms()}ms threw`);
      throw e;
    }
  };
}
