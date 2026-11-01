// R10: the id of the newest clip on episode 1 (EP1_ID, from run-check.sh), read from the test server the way the app
// does (GET /v1/episodes/:id/clips). Run 41282540688: the clip was saved (201) but the profile shows no "clipped" row,
// so the clip page has no way in from the app for its own maker; it is opened by this id.
var r = http.get(API + '/v1/episodes/' + EP1_ID + '/clips');
if (!r.ok) throw new Error('clips: ' + r.status);
var body = json(r.body);
var list = body.clips || body.items || body;
if (!list || !list.length) throw new Error('no clips on episode 1: ' + r.body.slice(0, 200));
output.clipId = list[0].id;
