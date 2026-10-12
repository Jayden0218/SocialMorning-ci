// The API as an AWS Lambda function behind a Function URL (API Gateway v2 event shape).
/**
 * M27 (specs/028-m27-aws-infra research R4, contracts/lambda-events.md). The same Hono app as `server.ts` and
 * `vercel-entry.ts`, adapted by `hono/aws-lambda`. The app is built once per cold start, from the environment
 * (`config.ts`), on the first request — importing this file reads nothing.
 */
import { handle } from 'hono/aws-lambda';
import { createApp, type AppDeps } from './app.ts';
import { depsFromEnv } from './config.ts';

type LambdaHandler = ReturnType<typeof handle>;

/** The handler for an app (tests compare it with the same app answering directly). */
export const fromApp = (app: ReturnType<typeof createApp>): LambdaHandler => handle(app);

/** The handler for given dependencies. */
export const createHandler = (deps: AppDeps): LambdaHandler => fromApp(createApp(deps));

let ready: Promise<LambdaHandler> | undefined;

export const handler: LambdaHandler = async (event, context) => {
  ready ??= depsFromEnv().then(createHandler);
  return (await ready)(event, context);
};
