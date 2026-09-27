/**
 * The personal information collection list (个人信息收集清单, M10) — what SocialNet
 * actually keeps about you, with live counts where there is a number to count. Written
 * from the code, not from the privacy policy's template: if something is not collected,
 * it is not on this list.
 */
export type CollectedItem = { id: string; title: string; purpose: string; when: string; scope: string; count?: number };
export type CollectedGroup = { title: string; line: string; items: CollectedItem[] };

export type Counts = { signedIn: boolean; history: number; favourites: number; moments: number; searches: number; subscriptions: number };

export function collectedList(c: Counts): CollectedGroup[] {
  return [
    {
      title: 'Your account',
      line: 'What is needed to create your account, sign you in and show your name.',
      items: [
        { id: 'account', title: 'Account details', purpose: 'Create your account, sign you in, show your name on comments', when: 'When you sign up, and when you change your name', scope: 'Display name, email address', count: c.signedIn ? 2 : 0 },
        { id: 'country', title: 'Country (IP location)', purpose: 'Shown on your profile to everyone, as the country you use SocialNet from', when: 'Each time you sign in', scope: 'The country your internet address belongs to — never your city or the address itself', count: c.signedIn ? 1 : 0 },
        { id: 'email', title: 'Email address', purpose: 'Sign in with a one-time code; account messages', when: 'When you sign up or sign in', scope: 'Email address', count: c.signedIn ? 1 : 0 },
      ],
    },
    {
      title: 'What you do in the app',
      line: 'Kept so the app can resume, recommend and show your own history.',
      items: [
        { id: 'history', title: 'Listening history', purpose: 'Resume where you stopped; listening time; recommendations', when: 'While you listen', scope: 'Episode, position, finished or not, listening time', count: c.history },
        { id: 'subscriptions', title: 'Subscriptions', purpose: 'Your shows, on every phone you sign in on', when: 'When you subscribe or unsubscribe', scope: 'Show feed addresses', count: c.subscriptions },
        { id: 'favourites', title: 'Favourites', purpose: 'Your list of starred episodes', when: 'When you star an episode', scope: 'Episode, time starred — on this phone only', count: c.favourites },
        { id: 'moments', title: 'Saved moments', purpose: 'Your saved moments and notes', when: 'When you save a moment', scope: 'Episode, time, your note — on this phone only', count: c.moments },
        { id: 'searches', title: 'Search history', purpose: 'Show your recent searches on the search page', when: 'When you search', scope: 'Search terms — on this phone only', count: c.searches },
        { id: 'posts', title: 'Comments, clips and reactions', purpose: 'Show them to other listeners at their moment', when: 'When you post one', scope: 'The text, the episode and the moment; they are public' },
      ],
    },
    {
      title: 'Your device',
      line: 'Kept so sync and safety work.',
      items: [
        { id: 'device', title: 'Device identifier', purpose: 'Tell your phones apart when positions sync', when: 'The first time the app runs', scope: 'A random id made by the app — not the phone’s serial or advertising id', count: 1 },
      ],
    },
  ];
}
