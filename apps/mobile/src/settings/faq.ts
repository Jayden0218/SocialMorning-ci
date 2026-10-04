// Questions and answers for the Help page.
/** Help & feedback (帮助与反馈, M10): SocialNet's own questions and answers. */
export const FAQ: { q: string; tag: string; a: string }[] = [
  { q: 'Where does the audio come from?', tag: 'Listening', a: 'Every episode plays straight from its publisher. SocialNet never stores or hosts audio.' },
  { q: 'How do timestamped comments work?', tag: 'Comments', a: 'A comment is pinned to the moment you were at when you wrote it. Others see it when they reach that moment, and on the heat curve above the scrubber.' },
  { q: 'Why is an episode not downloading?', tag: 'Downloads', a: 'Check the storage budget and “Allow mobile data” under Settings › Downloads and cache. A download waits for Wi-Fi unless mobile data is allowed.' },
  { q: 'How do I move my shows from another app?', tag: 'Subscriptions', a: 'Export an OPML file from the other app, then open Settings › More › Import or export subscriptions and paste it in.' },
  { q: 'How do stickers work?', tag: 'Stickers', a: 'Stickers are earned for listening milestones — your first hour, 10 hours, your first finished episode, and more. See Me › Stickers.' },
  { q: 'Who can see what I listen to?', tag: 'Privacy', a: 'Turn on “Keep my listening private” under Settings › Privacy, and your listens and stats are hidden from others. Comments and clips stay public.' },
  { q: 'How do I block or report someone?', tag: 'Safety', a: 'Open their profile or the comment and choose Block or Report. Manage blocked listeners under Settings › Privacy › Blocked listeners.' },
  { q: 'How do I delete my account?', tag: 'Account', a: 'Settings › Account and security › Delete my account. We send a code to your email to confirm.' },
  { q: 'Community guidelines', tag: 'Community', a: 'Be respectful, talk about the issue and not the person, no illegal content, harassment or spam. The full text is under Settings › About.' },
];

export const FEEDBACK_KINDS = ['Using the app', 'Account and sign-in', 'Playback and downloads', 'Comments and community', 'Suggestion or other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
