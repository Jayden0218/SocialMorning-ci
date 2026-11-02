// 036 (B5, T020): make only the catalogue search slow on the test server — every /v1/search request (and /v1/search/people) waits
// 12 s before it is answered: past the app's 10 s default limit for other calls, inside the search's own 25 s limit
// (SEARCH_TIMEOUT_MS, apps/mobile/src/social/api.ts:394). The answer is real, only late, so the app must show the results and must
// never say the catalogue "needs a connection" (src/ui/search/catalogue-error.ts:11). Switch it off with fault-off.js
// (r23's onFlowComplete does, on every exit path; run-check.sh turns it off after any flow as well).
var r = http.post(API + '/__e2e/fault', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ path: '/v1/search', mode: 'slow', ms: 12000 }),
});
if (!r.ok) throw new Error('fault switch (search): ' + r.status);
