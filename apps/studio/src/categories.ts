// Lists the allowed podcast categories and show languages.
/** Apple Podcasts' top-level categories (podcasters.apple.com/support/1691, read 2026-09-29) — the server accepts only these. */
export const CATEGORIES = [
  'Arts', 'Business', 'Comedy', 'Education', 'Fiction', 'Government', 'History', 'Health & Fitness', 'Kids & Family',
  'Leisure', 'Music', 'News', 'Religion & Spirituality', 'Science', 'Society & Culture', 'Sports', 'Technology', 'True Crime', 'TV & Film',
] as const;
export const LANGUAGES = [['zh', '中文'], ['en', 'English'], ['ms', 'Bahasa Melayu'], ['ja', '日本語'], ['ko', '한국어']] as const;
