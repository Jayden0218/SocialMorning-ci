// R3: a 6-digit code that is NOT the one the test server sent (the last digit moved by one), so the
// wrong-code error is certain to show. Runs after ../fetch-code.js, which sets output.code.
var c = String(output.code);
output.wrong = c.slice(0, 5) + String((Number(c.charAt(5)) + 1) % 10);
