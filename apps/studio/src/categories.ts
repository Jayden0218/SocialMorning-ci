// Lists the allowed podcast categories and show languages.
/** Apple Podcasts' top-level categories — the server accepts only these (one list in social-core). */
import { CATEGORY_NAMES } from '@socialmorning/social-core';

export const CATEGORIES = CATEGORY_NAMES;
export const LANGUAGES = [['zh', '中文'], ['en', 'English'], ['ms', 'Bahasa Melayu'], ['ja', '日本語'], ['ko', '한국어']] as const;
