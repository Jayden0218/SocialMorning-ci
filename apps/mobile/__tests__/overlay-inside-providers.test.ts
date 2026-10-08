// Checks that sheets and pop-ups sit inside the app's providers, avoiding crashes.
/**
 * gluestack draws Actionsheets, dialogs and toasts in a portal at GluestackUIProvider, so
 * anything inside a sheet can only reach contexts that wrap that provider. Found on the
 * iPhone 2026-09-29: with the provider outermost, the episode ⋯ sheet threw "useStores must
 * be used inside <AppProviders>" and the Release build crashed (SIGABRT).
 *
 * The break that turns it red: move <GluestackUIProvider> back outside <AppProviders>.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
const body = layout.slice(layout.indexOf('export default function RootLayout'));
const at = (tag: string): number => body.indexOf(`<${tag}>`);

it.each(['AppProviders', 'SocialProvider', 'SafetyProvider', 'GraphProvider'])('the overlay provider sits inside %s', (outer) => {
  expect(at(outer)).toBeGreaterThanOrEqual(0);
  expect(at('GluestackUIProvider')).toBeGreaterThan(at(outer));
});
