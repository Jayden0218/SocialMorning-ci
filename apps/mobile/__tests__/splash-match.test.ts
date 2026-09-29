/**
 * The native launch screen and the in-app Splash must look the same, or the hand-off
 * reads as two splash screens (owner, 2026-09-29: a 120-wide native icon, then 192).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { SPLASH_ICON_WIDTH } from '../src/ui/Splash';
import { colour } from '../src/design/tokens';

const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
const splashSource = readFileSync(join(__dirname, '../src/ui/Splash.tsx'), 'utf8');

it('app.json configures the native launch screen', () => {
  expect(plugin).toBeDefined();
});

it('the native icon is as wide as the in-app one', () => {
  expect(plugin[1].imageWidth).toBe(SPLASH_ICON_WIDTH);
});

it('both draw the same image', () => {
  const image = String(plugin[1].image).replace(/^\.\//, '');
  expect(splashSource).toContain(`require("../../${image}")`);
});

it('the native background is the screen background', () => {
  expect(String(plugin[1].backgroundColor).toLowerCase()).toBe(colour.background.toLowerCase());
});
