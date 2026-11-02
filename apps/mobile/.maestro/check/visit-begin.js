// 036 (C2): marks the start of one Discover visit in api.log — GET /__e2e/removed (a test-server route that is never faulted and changes
// nothing). check-categories.mjs counts the category requests between this and visit-end.js.
http.get(API + '/__e2e/removed');
