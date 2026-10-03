// Help articles for podcast creators about using the app and Studio.
/**
 * Creator academy (M12 FR-103): help for show owners, written for SocialNet — no 小宇宙 text
 * (FR-110). Every step describes what this app and the Studio do today; when a screen
 * changes, the article must change with it.
 */
export type Article = { slug: string; title: string; summary: string; sections: { heading: string; body: string }[] };

export const STUDIO_URL = 'https://socialmorning-studio.vercel.app';

export const ARTICLES: readonly Article[] = [
  {
    slug: 'claim-your-show',
    title: 'Claim your show',
    summary: 'Prove the feed is yours, without handing it over.',
    sections: [
      { heading: 'Why claim', body: 'A claimed show gets its numbers in the Creator centre, a Host mark on your comments, and the Studio website. Your audio stays where it is: SocialNet reads your RSS feed and never hosts your episodes.' },
      { heading: 'The steps', body: '1. Me › Creator centre. 2. Pick your show from the list, or paste your feed address. 3. Tap Get my code. 4. Put the code anywhere in your show description, in your hosting service. 5. Wait for your host to update the feed, then tap Verify.' },
      { heading: 'After it is proven', body: 'You can take the code out of your description again. The claim stays.' },
    ],
  },
  {
    slug: 'read-your-numbers',
    title: 'Read your numbers',
    summary: 'What "listened", comments and moments mean.',
    sections: [
      { heading: 'In the app', body: 'Creator centre shows, for each proven show, how many people listened, how many comments it has, how many episodes, and the moments where people comment most.' },
      { heading: 'What counts', body: 'A listener counts once per episode, and only when their listening is public. Deleted and removed comments are not counted. Nobody\'s private listening is ever shown to you.' },
      { heading: 'More detail', body: `The Studio website (${STUDIO_URL}) shows the same numbers over time, per episode, and your subscribers.` },
    ],
  },
  {
    slug: 'reply-to-comments',
    title: 'Talk with your listeners',
    summary: 'Comments are pinned to moments — answer them there.',
    sections: [
      { heading: 'Moments', body: 'Listeners comment at a point in the episode. On the episode page, "By moment" lists comments in the order they happen, so you can follow the conversation as the episode plays.' },
      { heading: 'Your Host mark', body: 'Once your show is proven, every comment you write on it carries a Host mark, so listeners know the answer is yours.' },
      { heading: 'Keeping it kind', body: 'You can hide a comment on your own show from the Studio. Listeners can report anything that breaks the rules; moderation reviews every report.' },
    ],
  },
  {
    slug: 'clips',
    title: 'Clips',
    summary: 'Share the best minute without copying a second of audio.',
    sections: [
      { heading: 'What a clip is', body: 'A clip is a start time and an end time in your episode. No audio is copied: whoever opens it plays that part from your own feed.' },
      { heading: 'Making one', body: 'In the player, tap the scissors: it takes the last 30 seconds. Change the start and end if you like, and share the link. Anyone can do this with any episode.' },
      { heading: 'Why it helps you', body: 'A clip plays from your own feed and links back to the episode, so a listener who likes the minute is one tap from the whole show.' },
    ],
  },
  {
    slug: 'the-studio',
    title: 'The Studio',
    summary: 'Your show\'s page, announcements and polls, on the web.',
    sections: [
      { heading: 'Signing in', body: `Open ${STUDIO_URL} on a computer and sign in with your SocialNet account.` },
      { heading: 'Your show page', body: 'Change the title, description and cover SocialNet shows, name your hosts, and add links and contacts. The feed itself is not changed.' },
      { heading: 'Announcements and polls', body: 'Post a note to your listeners or ask a question. They appear on your show page in the app, marked as from the host.' },
    ],
  },
];

export const articleBySlug = (slug: string): Article | undefined => ARTICLES.find((a) => a.slug === slug);
