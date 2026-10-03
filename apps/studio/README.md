# apps/studio — the creator website

Vite + React, live at `https://socialmorning-studio.vercel.app`. Show owners manage their show here;
admins use the admin pages. It calls the API through its own `/api` proxy (first-party cookie).

| Path | What is in it |
|---|---|
| `src/App.tsx`, `src/main.tsx` | The routes and start-up |
| `src/pages/` | One file per page (Home, Episodes, Comments, Subscribers, Data, Settings…); `admin/` and `settings/` hold sub-pages |
| `src/shell/` | Shared layout and parts: sidebar, page frame, tables, dialogs, unsaved-changes bar |
| `src/charts/` | Heat curve, trend chart, small charts |
| `src/api.ts`, `src/session.tsx`, `src/useLoad.ts` | Talking to the API and keeping the signed-in session |
| `src/tokens.ts`, `src/styles.css` | Colours and styles (frozen since M17) |
| `test/`, `e2e/` | Unit tests and the browser end-to-end test (Playwright), run in CI |
