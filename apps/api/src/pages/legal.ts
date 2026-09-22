/** M6 (FR-027, FR-028): /privacy, /rules and /get — plain pages the owner can edit here; no build needed. */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { esc, page } from './clip.ts';

export const RELEASES_URL = 'https://github.com/Jayden0218/SocialMorning-ci/releases/latest';

export const legal = new Hono<AuthEnv>();

legal.get('/privacy', (c) => {
  const appeals = c.get('safety').appealsEmail;
  return c.html(page('Privacy', `<h1>Privacy</h1>
<p>SocialMorning is a podcast player with a social layer. This page says what it keeps and where.</p>
<h2>What the app keeps on the server</h2>
<ul>
<li><b>Your account</b>: email, display name, a password hash. Sessions are random tokens; only their hash is stored.</li>
<li><b>Comments and clips</b> you write, with the moment in the episode they belong to. A clip is a time range; it carries no audio.</li>
<li><b>Reactions</b> (the ♡ taps) as counts per moment.</li>
<li><b>Listening ranges</b> — which parts of an episode you heard — and playback positions, so your place survives a new phone. With <b>private listening</b> on (Account), your listens count in totals but are never shown against your name.</li>
<li><b>Follows, blocks and reports</b> you make. A report keeps a copy of what you reported for 90 days so the owner can review it.</li>
</ul>
<h2>What it does not keep</h2>
<ul><li><b>Audio.</b> Episodes stream or download from the publisher's own servers. Nothing is hosted here.</li><li>Your subscriptions and downloads live on your phone only.</li><li>No advertising, no analytics service, no sale of data.</li></ul>
<h2>Deleting everything</h2>
<p>Account → <b>Delete my account</b> removes your account, sessions, reactions, positions, listening ranges, follows and blocks at once. Comments with replies become an anonymous placeholder so other people's replies keep their context; comments without replies are deleted. The email is free to use again.</p>
<h2>Reports and moderation</h2>
<p>Anyone can report a comment, clip, profile or show from the app. The owner reviews reports and may remove content, hide a show from discovery, or suspend an account. See the <a href="/rules">community rules</a>.</p>
<h2>Contact</h2>
<p>${appeals ? `Questions, appeals, data requests: <a href="mailto:${esc(appeals)}">${esc(appeals)}</a>.` : 'Contact the owner through the app.'}</p>
<p class="muted"><a href="/get">Get the app</a> · <a href="/rules">Community rules</a></p>`));
});

legal.get('/rules', (c) => {
  const appeals = c.get('safety').appealsEmail;
  return c.html(page('Community rules', `<h1>Community rules</h1>
<p>Comments and clips sit next to other people's listening. Keep them worth reading.</p>
<h2>Not allowed</h2>
<ul>
<li><b>Spam</b> — repeated, off-topic or promotional posts.</li>
<li><b>Harassment</b> — targeting a person to hurt or scare them.</li>
<li><b>Hate</b> — attacking people for who they are.</li>
<li><b>Sexual content</b> involving minors, or non-consensual sexual content.</li>
<li><b>Violence</b> — threats or glorification.</li>
<li><b>Illegal content</b>.</li>
</ul>
<h2>What happens</h2>
<p>Anyone can <b>report</b> a comment, clip, profile or show — it is hidden for them at once. Anyone can <b>block</b> a listener — nothing that listener writes reaches them again. The owner reviews every report and may dismiss it, remove the content, hide a show from discovery, or suspend the account.</p>
<h2>Appeals</h2>
<p>${appeals ? `If your content was removed or your account suspended and you think that was wrong, write to <a href="mailto:${esc(appeals)}">${esc(appeals)}</a>.` : 'Write to the owner through the app.'}</p>
<p class="muted"><a href="/privacy">Privacy</a> · <a href="/get">Get the app</a></p>`));
});

legal.get('/get', (c) => {
  const sha = c.get('safety').releaseSha256;
  return c.html(page('Get SocialMorning', `<h1>Get SocialMorning for Android</h1>
<p>A podcast player with a social layer: comments pinned to the moment, a reaction curve on the scrubber, clips as ranges, and a Discover page that has something to open on day one.</p>
<a class="btn" href="${RELEASES_URL}">Download the latest build</a>
<p class="muted">The build is a signed APK on GitHub Releases. Android will ask you to allow installs from your browser the first time.${sha ? ` SHA-256 of the current build: <code>${esc(sha)}</code>` : ''}</p>
<p><a href="/privacy">Privacy</a> · <a href="/rules">Community rules</a></p>`));
});
