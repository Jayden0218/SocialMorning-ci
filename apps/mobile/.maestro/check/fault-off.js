// R18: the test server answers normally again.
var r = http.post(API + '/__e2e/fault', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mode: 'off' }),
});
if (!r.ok) throw new Error('fault switch off: ' + r.status);
