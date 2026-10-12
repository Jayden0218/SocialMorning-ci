// Runs the BUILT Lambda bundles (dist-lambda/<name>/index.mjs) against DynamoDB Local: used by test/lambda-bundle.test.ts.
// Usage: node run-bundle.mjs <bundle dir> <events dir>   (env: SESSION_PEPPER, DDB_ENDPOINT, DDB_TABLE_PREFIX, DATA_BACKEND=ddb, APP_ENV=dev)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [dir, events] = process.argv.slice(2);
const ev = (name) => JSON.parse(readFileSync(`${events}/${name}.json`, 'utf8'));
const out = {};
const api = await import(pathToFileURL(`${dir}/api/index.mjs`).href);
const health = await api.handler(ev('health'), {});
out.health = health.statusCode;
// A route that reads DynamoDB through a `dual()` repo body — this is what fails when the bundle lost the lazy imports.
const academy = ev('health');
academy.rawPath = '/v1/content/academy'; academy.requestContext.http.path = '/v1/content/academy';
const r = await api.handler(academy, {});
out.academy = r.statusCode;
out.academyBody = JSON.parse(r.body);
const worker = await import(pathToFileURL(`${dir}/worker/index.mjs`).href);
out.worker = await worker.handler({ kind: 'drain' }, { getRemainingTimeInMillis: () => 100000 });
console.log(JSON.stringify(out));
