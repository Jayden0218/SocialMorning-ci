// Starts the API locally on Node, on DynamoDB Local (DDB_ENDPOINT) — see src/config.ts.
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { dbFromConfig, depsFromEnv, port as portFromEnv, readConfig } from './config.ts';

const config = readConfig();
// On a local DynamoDB the tables may not exist yet (`npm run dev:ddb`): create the missing ones before listening.
if (config.ddbEndpoint) {
  const { ddb, tables } = await dbFromConfig(config);
  const [{ ListTablesCommand }, { createTableSet }] = await Promise.all([import('@aws-sdk/client-dynamodb'), import('./db/ddb/schema.ts')]);
  const have = new Set((await ddb!.raw.send(new ListTablesCommand({}))).TableNames ?? []);
  const missing = Object.values(tables!).filter((t) => !have.has(t));
  if (missing.length === 0) console.log(`tables ${Object.values(tables!).join(', ')} already exist`);
  else if (missing.length === 3) { await createTableSet(ddb!.raw, tables!); console.log(`created tables ${missing.join(', ')}`); }
  else throw new Error(`DynamoDB Local has only part of the table set (missing ${missing.join(', ')}); restart it or drop the rest`);
  ddb!.raw.destroy();
}

const app = createApp(await depsFromEnv());
const port = portFromEnv();
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on :${port} (${config.appEnv}, DynamoDB)`);
});
