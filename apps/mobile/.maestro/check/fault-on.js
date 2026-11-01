// R18: make the test server stop answering in time — every app request waits 30 s, past the app's own 10 s
// limit, so the app sees what it sees with no network (apps/api/scripts/e2e-server.ts: POST /__e2e/fault;
// /__e2e routes are never slowed). run-check.sh turns it off after the flow whatever happens.
var r = http.post(API + '/__e2e/fault', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ path: '/', mode: 'slow', ms: 30000 }),
});
if (!r.ok) throw new Error('fault switch: ' + r.status);
