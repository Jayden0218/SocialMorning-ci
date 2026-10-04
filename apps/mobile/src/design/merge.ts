// Teaches the class merger the app's own text sizes, so a colour and a size can sit together.
/**
 * Found 2026-10-04 (owner: "Disagree should be brown"). gluestack's `Text` passes its classes
 * through tailwind-variants, which runs tailwind-merge (v1.14). tailwind-merge does not know
 * the sizes in tokens.ts that Tailwind does not have — `text-micro`, `text-meta`, `text-body`,
 * `text-title`, `text-hero`, `text-display` — so it read them as COLOURS and kept only the last
 * "colour": `text-accent text-body` lost its brown, `text-body text-accent` lost its size.
 * 315 texts lost their colour and 58 their size.
 *
 * tailwind-variants copies this setting when each style is created, so this file must load
 * before any `ui/lib` component: it is the first import of `index.ts` and of the Jest setup.
 * Guard: __tests__/text-merge.test.tsx.
 */
import { defaultConfig } from 'tailwind-variants';
import { fontSize } from './tokens';

/** Every size name in tokens.ts that Tailwind does not already have. */
const TAILWIND_SIZES = new Set(['xs', 'sm', 'base', 'lg', 'xl']);
export const APP_TEXT_SIZES = Object.keys(fontSize).filter((k) => !TAILWIND_SIZES.has(k));

