// The test server answers before the journey starts (a dead server otherwise looks like "no code").
var r = http.get(API + '/v1/health');
if (!r.ok) throw new Error('test server not answering: ' + API + ' → ' + r.status);
