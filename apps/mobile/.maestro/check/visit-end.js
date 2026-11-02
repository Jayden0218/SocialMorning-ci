// 036 (C2): marks the end of a Discover visit in api.log — GET /__e2e/code (404 without a pending email: harmless, never faulted).
http.get(API + '/__e2e/code?email=visit-end@journey.test');
