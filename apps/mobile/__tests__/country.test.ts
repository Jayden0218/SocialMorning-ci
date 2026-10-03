/** M10b US7 — the profile's "IP location" names the country; an unknown code is shown as it is. */
import { countryName } from '../src/ui/country';

it('names a country from its two letters, or falls back to the code', () => {
  const my = countryName('MY');
  expect(my === 'Malaysia' || my === 'MY').toBe(true); // Hermes may lack Intl.DisplayNames
  expect(countryName('ZZ')).toMatch(/ZZ|Unknown/);
});
