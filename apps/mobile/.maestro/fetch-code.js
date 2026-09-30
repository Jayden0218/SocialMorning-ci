// The sign-in code from the test server's in-memory inbox (scripts/e2e-server.ts: GET /__e2e/code).
// Retries for a few seconds: the code is written when the "Send code" request finishes.
var code = null;
for (var i = 0; i < 20 && code === null; i++) {
  var r = http.get(API + '/__e2e/code?email=' + encodeURIComponent(EMAIL));
  if (r.ok) code = json(r.body).code;
}
if (code === null) throw new Error('no sign-in code for ' + EMAIL);
output.code = code;
