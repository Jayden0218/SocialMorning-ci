# Studio — third-party licences

Checked with `npm view <pkg> license` on 2026-09-29 (specs/011-m11-studio/research.md R9).

| Package | Version | Licence | Ships to users |
|---|---|---|---|
| react, react-dom | 19.2.3 | MIT | yes |
| react-router | 7.18.4 | MIT | yes (8.x needs React ≥ 19.2.7; the monorepo pins 19.2.3) |
| recharts | 3.10.1 | MIT | yes |
| @vercel/blob | 2.8.0 | Apache-2.0 | yes (M13: uploads straight from the browser) |
| vite | 8.3.1 | MIT | build only |
| @vitejs/plugin-react | 6.1.1 | MIT | build only |
| vitest | 5.0.2 | MIT | tests only |
| @testing-library/react | 16.3.3 | MIT | tests only |
| @testing-library/dom | 10.4.2 | MIT | tests only |
| jsdom | 30.1.1 | MIT | tests only |
| axe-core | 4.13.0 | MPL-2.0 | tests only, unmodified (file-level copyleft; our code is not covered) |
