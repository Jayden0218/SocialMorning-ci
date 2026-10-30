// The DynamoDB DocumentClient: plain JS objects in and out; refuses real AWS until it is approved.
/**
 * M26 F0-06. One client per server instance (DynamoDB is HTTP: no pool, no connection budget —
 * research R16).
 *
 * DocumentClient options (https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-dynamodb/README.md):
 * - `removeUndefinedValues: true` — an `undefined` inside a list/map/set is dropped instead of throwing.
 * - `convertClassInstanceToMap: false` — a Date or class instance is an error, not a silent map; the codec
 *   (codec.ts) turns Dates into ISO strings before anything reaches the client.
 * - numbers come back as JS numbers (`wrapNumbers` off): every id/ms value we store is < 2^53, and the
 *   marshaller throws on an imprecise number by default (`allowImpreciseNumbers` off).
 *
 * Safety (owner, 2026-10-10: no AWS account exists yet): without an explicit local endpoint the client is
 * refused unless `allowAws: true` is passed. DynamoDB Local accepts any credentials ("Downloadable DynamoDB
 * requires any credentials to work" — https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html),
 * so a local endpoint gets fixed dummy keys and never reads the machine's AWS profile.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type DdbClientOptions = {
  /** e.g. `http://localhost:8000` (DynamoDB Local). Taken from `DDB_ENDPOINT` when not given. */
  endpoint?: string;
  region?: string;
  /** Must be true to talk to real AWS (no endpoint). Nothing sets it before the owner approves AWS by name. */
  allowAws?: boolean;
};

export const DEFAULT_REGION = 'ap-southeast-1';

/** True for an endpoint on this machine or a CI service container (never AWS). */
export function isLocalEndpoint(endpoint: string): boolean {
  let host: string;
  try { host = new URL(endpoint).hostname; } catch { return false; }
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'dynamodb' || host === 'dynamodb-local';
}

export type Clients = { raw: DynamoDBClient; doc: DynamoDBDocumentClient };

export function createDdbClients(opts: DdbClientOptions = {}): Clients {
  const endpoint = opts.endpoint ?? process.env['DDB_ENDPOINT'];
  const region = opts.region ?? process.env['AWS_REGION'] ?? DEFAULT_REGION;
  if (endpoint && !isLocalEndpoint(endpoint) && !opts.allowAws) {
    throw new Error('DynamoDB endpoint is not local and allowAws is not set (no AWS account is approved yet)');
  }
  if (!endpoint && !opts.allowAws) {
    throw new Error('DynamoDB: no DDB_ENDPOINT and allowAws is not set (no AWS account is approved yet)');
  }
  const raw = new DynamoDBClient({
    region,
    ...(endpoint
      ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  });
  const doc = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
    unmarshallOptions: { wrapNumbers: false },
  });
  return { raw, doc };
}
