// Every module that registers an outbox handler, imported for its side effect (M32 A1, review.md).
/**
 * `registerHandler` runs when a module loads. A cold worker or API Lambda imports only its entry file, so a
 * handler whose module nothing imported was never registered and its entries were kept for ever
 * ("no outbox handler for kind …"). The entries import this file; test/worker-handlers.test.ts checks a cold
 * process against every kind `enqueue` writes in src/. A new `registerHandler` module is added here.
 */
import '../heat/ddb.ts';
import '../db/repos/social/graph-ddb/activity.ts';
import '../db/repos/account/ddb/push.ts';
import '../db/repos/safety/ddb/moderation.ts';
import '../db/repos/studio/ddb/facts.ts';
