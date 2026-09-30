// Waits MS milliseconds by asking the test server to answer late (Maestro has no sleep).
// In 2 s steps, so no single request runs into the HTTP client's read timeout.
for (var left = Number(MS); left > 0; left -= 2000) http.get(API + '/__e2e/wait?ms=' + Math.min(left, 2000));
